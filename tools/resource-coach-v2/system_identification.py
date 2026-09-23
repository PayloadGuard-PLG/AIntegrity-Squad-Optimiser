#!/usr/bin/env python3
"""Interval-preserving Resource Coach falsification, separate from production logic.

The archived 13 September transcription is secondary evidence. Historical previews
whose screenshots were later disputed are run in sensitivity analyses only.
Requires numpy and scipy. Writes JSON; no parameters are imported from app code.
"""
import argparse
import base64
import collections
import gzip
import itertools
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, least_squares

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'calibration' / 'resource-coach-identification'
TIER = {'T0': 0, 'T1': 10, 'T2': 30, 'T3': 50, 'T4': 80, 'T5': 120, 'T6': 160}
DISPUTED = {x['experimentId'] for x in json.loads((ROOT/'calibration/resource-coach-log/quality-exclusions.json').read_text())['experiments']
            if x['experimentId'].startswith('PRV-')}


def canonical():
    packed = (ROOT / 'calibration/longitudinal-corpus/canonical-corpus-v1.json.gz.b64').read_text()
    doc = json.loads(gzip.decompress(base64.b64decode(packed)))
    rows, events, seen = [], [], set()
    for e in doc['experiments']:
        player, coach = e['preOutcome']['player'], e['preOutcome']['coach']
        fp = json.dumps([player, coach, e['observed']], sort_keys=True)
        # PRV-0022 repeats PRV-0007, with a different instance identifier.
        if e['id'] == 'PRV-0022' or fp in seen:
            continue
        seen.add(fp)
        events.append(e['id'])
        p = len(e['observed']['statIntervals'])
        for stat, interval in e['observed']['statIntervals'].items():
            rows.append(dict(id=e['id'], player=player['id'], name=player['name'],
                             state=e['_stateId'], age=player['age'], tier=int(player['tier'][1:]),
                             s=player['stats'][stat], stat=stat.upper(),
                             cls=e['_classByStat'][stat], coach=coach['title'],
                             family=coach['programmeFamily'].upper(), N=coach['multiplier'],
                             p=p, g=[interval['lo'], interval['hi']],
                             source='canonical-workbook',
                             provenance='disputed' if e['id'] in DISPUTED else 'workbook'))
    return rows, events


def archived():
    return json.loads((DATA / 'archived-preview-rows-v1.json').read_text())['rows']


def integrate(u, g, h, beta):
    """Integral of cost 1 below h and exp(beta * (z-h)) above h."""
    u, g = np.asarray(u, float), np.asarray(g, float)
    if beta == 0:
        return g
    def primitive(z):
        return np.minimum(z, h) + np.expm1(np.clip(beta*(z-h), 0, 70))/beta
    return primitive(u+g)-primitive(u)


def inverse(u, budget, h, beta):
    if beta == 0:
        return budget
    c0=np.minimum(u,h)+np.expm1(np.clip(beta*(u-h),0,70))/beta
    target=c0+budget
    end=np.where(target<=h,target,h+np.log1p(beta*np.maximum(0,target-h))/beta)
    return end-u


def pair_constraint(rows, slack, beta, hw=135, hg=120, offset=True):
    a = {r['stat']:r for r in rows if r['id']=='PRV-0017'}
    b = {r['stat']:r for r in rows if r['id']=='PRV-0007'}
    bounds = {}
    for stat, r in a.items():
        z = b[stat]; h = hw if r['cls']=='WHITE' else hg
        u = r['s']-(TIER['T'+str(r['tier'])] if offset and r['cls']=='WHITE' else 0)
        low = float(integrate(u, max(0,z['g'][0]-slack),h,beta)/integrate(u,r['g'][1]+slack,h,beta))
        high = float(integrate(u,z['g'][1]+slack,h,beta)/integrate(u,max(.001,r['g'][0]-slack),h,beta))
        bounds[stat] = [low,high]
    lower = max(v[0] for v in bounds.values()); upper = min(v[1] for v in bounds.values())
    return dict(slack=slack,beta=beta,thresholds=[hw,hg],lower=lower,upper=upper,
                compatible=lower<=upper, limiting_lower=max(bounds,key=lambda k:bounds[k][0]),
                limiting_upper=min(bounds,key=lambda k:bounds[k][1]),by_stat=bounds)


def features(rows):
    # This parameterization is deliberately descriptive, not an engine law.
    # Each column is checked for rank before interpreting any coefficient.
    return np.array([[1, (r['age']-18)/10, math.log(r['N']), -math.log(r['p']),
                      r['cls']=='MID_GREY', r['family']=='DRILL SESSION',
                      r['coach'].startswith('Extensive'),r['coach'].startswith('Standard')]
                     for r in rows],float)


def prepare(rows):
    x=features(rows); s=np.array([r['s'] for r in rows],float)
    tier=np.array([TIER['T'+str(r['tier'])] for r in rows],float)
    white=np.array([r['cls']=='WHITE' for r in rows])
    g=np.array([r['g'] for r in rows],float)
    return x,s,tier,white,g


def predict(rows, coeff, variant):
    x,s,tier,white,_=prepare(rows)
    beta, hw, hg, tier_adjust = variant
    u=s-tier*white if tier_adjust else s
    h=np.where(white,hw,hg)
    b=np.exp(np.clip(x@coeff[:-1],-18,18))
    width=1+np.exp(np.clip(coeff[-1],-10,6))
    low=inverse(u,b,h,beta); high=inverse(u,b*width,h,beta)
    if tier_adjust:
        low=np.maximum(0,u+low)-np.maximum(0,u)
        high=np.maximum(0,u+high)-np.maximum(0,u)
    return np.stack((low,high),axis=1)


def errors(pred, observed):
    # Each displayed endpoint is an interval under up to half a stat of rounding.
    return np.maximum(0,np.maximum(observed-.5-pred,pred-observed-.5))


def fit(rows, variant):
    x,_,_,_,g=prepare(rows)
    scale=np.linalg.svd(x,compute_uv=False)
    # Fixed ridge keeps rank-deficient coefficients finite but cannot identify them.
    init=np.array([math.log(2),-0.2,1,-1,0,0,0,0,math.log(.4)])
    count=collections.Counter(r['id'] for r in rows)
    w=np.array([1/math.sqrt(count[r['id']]) for r in rows])
    def residual(c):
        p=predict(rows,c,variant)
        signed=np.where(p<g-.5,p-(g-.5),np.where(p>g+.5,p-(g+.5),0))
        return np.r_[(np.log1p(np.abs(signed))*np.sign(signed)*w[:,None]).ravel(),
                     .005*(c-init)]
    result=least_squares(residual,init,max_nfev=95,ftol=5e-5,xtol=5e-5)
    rank=int(np.sum(scale>scale[0]*1e-10))
    return result.x,dict(rank=rank,columns=x.shape[1],condition=float(scale[0]/scale[-1]) if scale[-1] else None,
                         singular_values=scale.round(6).tolist(),success=bool(result.success))


def score(rows,pred):
    if not rows:return dict(n=0)
    g=np.array([r['g'] for r in rows],float)
    misses=errors(pred,g)
    gap=np.maximum(0,np.maximum(g[:,0]-pred[:,1],pred[:,0]-g[:,1]))
    vals=sorted([(float(gap[i]),rows[i]['id'],rows[i]['stat'],
                  [round(float(z),2) for z in pred[i]],[float(z) for z in g[i]])
                 for i in range(len(rows))],reverse=True)
    by_family=collections.defaultdict(list)
    for i,r in enumerate(rows):by_family[r['family']].append(float(gap[i]))
    return dict(n=len(rows), events=len(set(r['id'] for r in rows)), players=len(set(r['player'] for r in rows)),
                overlap=float(np.mean(gap<=1e-7)),mean_separation=float(np.mean(gap)),
                endpoint_rounding_mae=float(np.mean(misses)),
                by_family={k:dict(n=len(v),overlap=float(np.mean(np.array(v)<=1e-7)),
                                   mean_separation=float(np.mean(v))) for k,v in by_family.items()},
                worst=[dict(gap=a,id=b,stat=c,pred=d,obs=e) for a,b,c,d,e in vals[:12]])


def validate(rows,variant,fold_key):
    pred=np.zeros((len(rows),2))
    for key in sorted({r[fold_key] for r in rows}):
        train=[r for r in rows if r[fold_key]!=key]
        indices=[i for i,r in enumerate(rows) if r[fold_key]==key]
        if len(train)<9:continue
        coef,_=fit(train,variant)
        pred[indices]=predict([rows[i] for i in indices],coef,variant)
    return score(rows,pred)


def ovr_check(doc):
    out=[]
    for e in doc['experiments']:
        if e['id']=='PRV-0022':continue
        o=e['observed'].get('ovrDelta')
        if not o:continue
        gains=e['observed']['statIntervals'].values()
        implied=[sum(g['lo'] for g in gains)/15,sum(g['hi'] for g in gains)/15]
        observed=[o['lo'],o['hi']]
        gap=max(0,observed[0]-implied[1],implied[0]-observed[1])
        integer_envelope=[math.floor(implied[0]),math.ceil(implied[1])]
        out.append(dict(id=e['id'],implied=implied,observed=observed,gap=gap,
                        integer_envelope=integer_envelope,
                        integer_envelope_incompatible=observed[1]<integer_envelope[0] or observed[0]>integer_envelope[1]))
    return dict(n=len(out),incompatible=sum(x['gap']>1e-7 for x in out),
                integer_envelope_incompatible=sum(x['integer_envelope_incompatible'] for x in out),
                cases=[x for x in out if x['gap']>1e-7])


def prospective_check():
    doc=json.loads((DATA/'prospective-evidence-20260921.json').read_text())
    out=[]
    for e in doc['previews']:
        gaps=[]
        for x in e['stats']:
            lo,hi=x['actual']; plo,phi=x['locked']
            gaps.append(dict(stat=x['stat'],actual=[lo,hi],locked=[plo,phi],
                             separation=max(0,lo-phi,plo-hi),
                             endpoint_error=[abs(plo-lo),abs(phi-hi)]))
        out.append(dict(id=e['id'],family=e['family'],predictionStatus=e.get('predictionStatus','document says locked'),
                        n=len(gaps),overlap=sum(x['separation']==0 for x in gaps),
                        incompatible=[x for x in gaps if x['separation']>0],
                        mean_endpoint_error=sum(sum(x['endpoint_error']) for x in gaps)/(2*len(gaps)),
                        ovr=dict(actual=e['ovr'],locked=e['lockedOvr']) if 'ovr' in e else None))
    return out


def matched_archived_pairs(rows):
    groups=collections.defaultdict(list)
    for r in rows:
        # Same identified state, same stat and coach; family is explicitly matched.
        key=(r['player'],r['state'],r['stat'],r['s'],r['cls'],r['coach'],r['family'],r['p'])
        groups[key].append(r)
    out=[]
    for key,rr in groups.items():
        for a,b in itertools.combinations(sorted(rr,key=lambda r:r['N']),2):
            if a['N']==b['N']:continue
            u=a['s']-(TIER['T'+str(a['tier'])] if a['cls']=='WHITE' else 0)
            h=135 if a['cls']=='WHITE' else 120
            lo=float(integrate(u,b['g'][0],h,.0354)/integrate(u,a['g'][1],h,.0354))
            hi=float(integrate(u,b['g'][1],h,.0354)/integrate(u,max(a['g'][0],.001),h,.0354))
            out.append(dict(a=a['id'],b=b['id'],stat=a['stat'],n=[a['N'],b['N']],
                            gain=[a['g'],b['g']],dose_ratio=[lo,hi]))
    return out


def next_experiment_predictions():
    # Locked before x80 is observed; x20 is the reported 21 September preview.
    out=[]
    for stat,start,low,high in [('TACKLING',9,33,49),('MARKING',21,33,49),('BRAVERY',62,33,47)]:
        choices={}
        for label,q in [('drill_like',1.056),('skill_high_exponent',1.46)]:
            budget=integrate(start,np.array([low-.5,high+.5]),120,.0354)*4**q
            gain=inverse(np.array([start,start],float),budget,np.array([120,120],float),.0354)
            choices[label]=[math.floor(float(gain[0]-.5)),math.ceil(float(gain[1]+.5))]
        out.append(dict(stat=stat,start=start,anchor=[low,high],x80=choices))
    return out


def within_preview_order(rows):
    grouped=collections.defaultdict(list)
    for r in rows:grouped[r['id']].append(r)
    tested=0; inversions=[];equal_start=[]
    for event,rr in grouped.items():
        for a,b in itertools.combinations(rr,2):
            if a['cls']!=b['cls'] or a['cls'] not in ('WHITE','MID_GREY'):continue
            if a['s']==b['s']:
                equal_start.append(dict(id=event,stats=[a['stat'],b['stat']],gains=[a['g'],b['g']],
                                        disjoint=max(a['g'][0]-b['g'][1],b['g'][0]-a['g'][1])>0))
                continue
            a,b=sorted((a,b),key=lambda r:r['s'])
            u=a['s']-(TIER['T'+str(a['tier'])] if a['cls']=='WHITE' else 0)
            if u<0:continue  # visible gain is rectified, so monotonicity need not hold
            tested+=1
            if a['g'][1]<b['g'][0]:
                inversions.append(dict(id=event,low_stat=a['stat'],high_stat=b['stat'],
                                       starts=[a['s'],b['s']],gains=[a['g'],b['g']]))
    return dict(comparable_pairs=tested,strict_inversions=inversions,
                equal_start_pairs=equal_start)


def live_gilmartin_check():
    rec=json.loads((DATA/'live-preview-20260923-gilmartin.json').read_text())
    stats=rec['observed']['statIntervals']
    # Both target stats are WHITE. Their coordinate separation is eight at any
    # common tier offset; h cancels when both lie above the same threshold.
    passing,dribbling=stats['PASSING'],stats['DRIBBLING']
    u_p,u_d=passing['start']-50,dribbling['start']-50
    def ratio(beta,slack):
        return float(integrate(u_d,max(0,dribbling['lo']-slack),135,beta)
                     /integrate(u_p,passing['hi']+slack,135,beta))
    return dict(
        source=rec['source'],
        anchor_status='new independent state; prior row has a baseline mismatch and Finishing changed',
        observed={k:[v['lo'],v['hi']] for k,v in stats.items()},
        prior={k:v for k,v in rec['priorRecord']['statIntervals'].items()},
        unchanged_projected_finishing_endpoints=[
            rec['priorRecord']['storedFinishingStart']+rec['priorRecord']['statIntervals']['FINISHING'][0],
            rec['priorRecord']['storedFinishingStart']+rec['priorRecord']['statIntervals']['FINISHING'][1]],
        new_projected_finishing_endpoints=[stats['FINISHING']['start']+stats['FINISHING']['lo'],
                                           stats['FINISHING']['start']+stats['FINISHING']['hi']],
        equal_budget_minimum_dribbling_over_passing=[
            dict(beta=beta,literal=ratio(beta,0),half_point_display_tolerance=ratio(beta,.5))
            for beta in (0,.025,.0354,.045)],
        minimum_beta_for_equal_budget=dict(
            literal=brentq(lambda b:ratio(b,0)-1,.000001,.4),
            half_point_display_tolerance=brentq(lambda b:ratio(b,.5)-1,.000001,.4)),
        scope='Conditional on equal allocation, a common increasing exponential marginal cost, and the same latent tier transform for both WHITE stats. Not a universal falsification of equal allocation.'
    )


def live_oliver_check():
    """Score a locked cross-player forecast and cancel the conditional cost law.

    Same-endpoint comparisons matter: arbitrary low-to-high cross-pairing cannot
    validate a common multiplier for both displayed interval endpoints.
    """
    locked=json.loads((DATA/'locked-prediction-20260923-lerchl-offensive-x10.json').read_text())
    actual=json.loads((DATA/'live-preview-20260923-lerchl-offensive-x10.json').read_text())
    mark=json.loads((DATA/'live-preview-20260923-lurinsky-offensive-x10.json').read_text())
    stats={}
    for stat,pred in locked['predictedStats'].items():
        observed=actual['actual'][stat]['gain']
        h=120 if pred['class']=='MID_GREY' else 135
        old_start,new_start=mark['displayedStart'][stat],pred['start']
        old_gain=mark['actualGains'][stat]
        ratio_intervals={}
        for slack in (.5,1):
            pair=[]
            for j in (0,1):
                lo=float(integrate(new_start,max(0,observed[j]-slack),h,.0354)
                         /integrate(old_start,old_gain[j]+slack,h,.0354))
                hi=float(integrate(new_start,observed[j]+slack,h,.0354)
                         /integrate(old_start,max(.001,old_gain[j]-slack),h,.0354))
                pair.append([lo,hi])
            ratio_intervals[str(slack)]=pair
        stats[stat]=dict(observed=observed,primary=pred['primaryGain'],rival=pred['rivalGain'],
                         primary_endpoint_absolute_errors=[abs(a-b) for a,b in zip(observed,pred['primaryGain'])],
                         primary_interval_gap=max(0,observed[0]-pred['primaryGain'][1],
                                                  pred['primaryGain'][0]-observed[1]),
                         rival_interval_gap=max(0,observed[0]-pred['rivalGain'][1],
                                                pred['rivalGain'][0]-observed[1]),
                         implied_ratio_same_endpoint=ratio_intervals)
    shared={}
    for slack in ('0.5','1'):
        shared[slack]=[]
        for endpoint in (0,1):
            intervals=[r['implied_ratio_same_endpoint'][slack][endpoint] for r in stats.values()]
            shared[slack].append(dict(lower=max(x[0] for x in intervals),
                                      upper=min(x[1] for x in intervals),
                                      feasible=max(x[0] for x in intervals)<=min(x[1] for x in intervals)))
    return dict(predictionCommit=actual['lockedPredictionAtGitHubCommit'],
                screenshot=actual['source'],stats=stats,common_ratio_by_endpoint=shared,
                scope='Shared endpoint dose ratio is conditional on the nominated cost curve, same latent tier coordinate transformation, and stable per-stat player allocation; cross-player age cannot be isolated.')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True)
    args=parser.parse_args()
    canonical_rows,canonical_events=canonical()
    archive_all=archived()
    # No role-map or fitted class substitution for a missing source display class.
    archive=[r for r in archive_all if r['cls'] in ('WHITE','MID_GREY')]
    archive_fingerprints={(r['name'],r['s'],r['stat'],r['N'],r['p'],tuple(r['g'])) for r in archive}
    heldout=[r for r in canonical_rows if r['id'] not in DISPUTED and
             (r['name'],r['s'],r['stat'],r['N'],r['p'],tuple(r['g'])) not in archive_fingerprints]
    doc=json.loads(gzip.decompress(base64.b64decode((ROOT/'calibration/longitudinal-corpus/canonical-corpus-v1.json.gz.b64').read_text())))
    variants={'flat_raw':(0,135,120,False),'flat_tier':(0,135,120,True),
              'plateau_015':(.015,135,120,True),'plateau_0354':(.0354,135,120,True),
              'plateau_0354_raw':(.0354,135,120,False),
              'plateau_0354_common_threshold':(.0354,135,135,True),
              'exp_0354':(.0354,0,0,True)}
    report=dict(canonical=dict(events=len(canonical_events),rows=len(canonical_rows),
                               disputed_events=sorted(DISPUTED),
                               supported_rows=sum(r['id'] not in DISPUTED for r in canonical_rows)),
                archive=dict(events=len({r['id'] for r in archive}),rows=len(archive),
                             source_rows=len(archive_all),unknown_class_rows=len(archive_all)-len(archive),
                             players=len({r['player'] for r in archive})),
                independent_canonical_holdout_rows=len(heldout),
                darren_pair=[pair_constraint(canonical_rows,slack,beta) for slack,beta in
                             itertools.product([0,.5,1],[0,.015,.0354])],
                ovr=ovr_check(doc),prospective=prospective_check(),
                archive_matched_pairs=matched_archived_pairs(archive),
                next_experiment=next_experiment_predictions(),
                new_live_preview=live_gilmartin_check(),
                mark_oliver_live_check=live_oliver_check(),models={},cost_sensitivity=[])
    report['within_preview_order']={
        'archive':within_preview_order(archive),
        'canonical_undisputed':within_preview_order([r for r in canonical_rows if r['id'] not in DISPUTED]),
    }
    for name,variant in variants.items():
        coefficient,diagnostic=fit(archive,variant)
        entry=dict(parameters=[round(float(z),5) for z in coefficient],design=diagnostic,
                   in_sample=score(archive,predict(archive,coefficient,variant)),
                   leave_one_player_out=validate(archive,variant,'player'),
                   leave_one_session_out=validate(archive,variant,'id'),
                   canonical_holdout_undisputed_workbook=score(heldout,predict(heldout,coefficient,variant)),
                   canonical_holdout_disputed=score([r for r in canonical_rows if r['id'] in DISPUTED],
                       predict([r for r in canonical_rows if r['id'] in DISPUTED],coefficient,variant)))
        report['models'][name]=entry
    for h,beta in itertools.product((100,135,170),(.025,.0354,.045)):
        variant=(beta,h,h-15,True)
        outcome=validate(archive,variant,'player')
        report['cost_sensitivity'].append(dict(white_threshold=h,grey_threshold=h-15,
                                                beta=beta,overlap=outcome['overlap'],
                                                mean_separation=outcome['mean_separation']))
    Path(args.out).write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='models'},indent=2)[:3500])
    for name,e in report['models'].items():
        print(name,[(k,round(e[k]['overlap'],3),round(e[k]['mean_separation'],2))
                    for k in ('in_sample','leave_one_player_out','leave_one_session_out')])


if __name__=='__main__':main()
