#!/usr/bin/env python3
"""Research-only replay from recorded outcomes; no production code dependency.

Run: python tools/resource-coach-v2/independent_validation_20260924.py OUTDIR
The profile is fixed before any ablation. Each alternative changes one component;
only the amplitude of one observed anchor event is inferred.
"""
import base64
import csv
import gzip
import json
import math
import pathlib
import statistics
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / 'calibration'
PROFILE = json.loads((ROOT / 'profiles/resource_coach_current_replay_20260923.json').read_text())
RESPONSE = PROFILE['response']


def archive():
    doc = json.loads((DATA / 'resource-coach-identification/archived-preview-rows-v1.json').read_text())
    events = defaultdict(list)
    for x in doc['rows']:
        if not x.get('state') or x['cls'] not in ('WHITE', 'MID_GREY'):
            continue
        source = x.get('source', '')
        # A filename/reference is evidence of a transcription, not a pixel audit.
        grade = 'referenced-screenshot' if any(y in source.lower() for y in ('.png', 'preview', 'card', 'chat_upload', 'screenshot')) else 'secondary-transcription'
        key = ('archive', x['player'], x['state'], x['id'])
        events[key].append(dict(stat=x['stat'].upper(), start=x['s'], cls=x['cls'], lo=x['g'][0], hi=x['g'][1], source=source,
                                player=x['name'], age=x['age'], tier=x['tier'], coach=x['coach'], family=x['family'].upper().replace('-', ' '), N=x['N'], p=x['p'], grade=grade))
    return events


def chat():
    doc = json.loads((DATA / 'resource-coach-identification/chat-locked-tests-20260923.json').read_text())
    events = defaultdict(list)
    for x in doc['tests']:
        c = x['coach']
        if c['transferClass'].lower() != 'ordinary':
            continue
        s = doc['playerStates'][x['playerStateId']]
        key = ('chat', x['playerStateId'], x['playerStateId'], x['testId'])
        for r in x['affectedStats']:
            if r['displayClass'] not in ('WHITE', 'MID_GREY'):
                continue
            events[key].append(dict(stat=r['stat'], start=r['start'], cls=r['displayClass'], lo=r['observed'][0], hi=r['observed'][1],
                                    source='conversation-observed:' + x['testId'], player=s['playerName'], age=s['age'], tier=int(s['tier'][1:]),
                                    coach=c['coachLabel'], family=c['programmeFamily'].upper().replace('-', ' '), N=c['multiplier'], p=c['affectedStatCount'], grade='conversation-observed'))
    return events


def canonical(include_conflicts=False):
    encoded = (DATA / 'longitudinal-corpus/canonical-corpus-v1.json.gz.b64').read_text()
    doc = json.loads(gzip.decompress(base64.b64decode(encoded)))
    excluded = {e['experimentId'] for e in json.loads((DATA / 'resource-coach-log/quality-exclusions.json').read_text())['experiments']}
    events = defaultdict(list)
    for x in doc['experiments']:
        if (x['id'] in excluded and not include_conflicts) or x['id'] == 'PRV-0022':
            continue
        p, c = x['preOutcome']['player'], x['preOutcome']['coach']
        if c.get('transferClass') != 'ordinary':
            continue
        key = ('canonical', p['id'], x['_stateId'], x['id'])
        for stat, bounds in x['observed']['statIntervals'].items():
            cls = x['_classByStat'].get(stat)
            if cls not in ('WHITE', 'MID_GREY'):
                continue
            events[key].append(dict(stat=stat.upper(), start=p['stats'][stat], cls=cls, lo=bounds['lo'], hi=bounds['hi'],
                                    source=x.get('_sourceId'), player=p['name'], age=p['age'], tier=int(p['tier'][1:]),
                                    coach=c['title'], family=c['programmeFamily'].upper(), N=c['multiplier'], p=len(x['observed']['statIntervals']), grade='canonical-workbook'))
    return events


def settings(variant):
    v = dict(tier=True, thresholds=True, age=True, dose_n=1., dose_p=1., response='plateau', amplitude=True,
             rho=RESPONSE['upperDoseRatio'], h_white=RESPONSE['whiteThreshold'], h_grey=RESPONSE['midGreyThreshold'], K=RESPONSE['K'])
    mods = {
        'no_tier': dict(tier=False), 'same_threshold': dict(thresholds=False), 'no_age': dict(age=False),
        'no_N': dict(dose_n=0.), 'no_p': dict(dose_p=0.), 'N_1_4': dict(dose_n=1.4),
        'p_0_75': dict(dose_p=.75), 'linear_response': dict(response='linear'),
        'smooth_exponential': dict(response='smooth'), 'no_rectification': dict(response='no_rectification'),
        'fixed_amplitude': dict(amplitude=False), 'fixed_rho_1': dict(rho=1.),
        'K_47': dict(K=47.), 'thresholds_135_120': dict(h_white=135.,h_grey=120.),
    }
    if variant != 'current':
        v.update(mods[variant])
    return v


def age(age):
    for b in PROFILE['ageScaleBands']:
        if b['minAge'] <= age <= b['maxAge']:
            return b['scale']
    raise ValueError(age)


def gain(r, budget, v):
    u = float(r['start']) - (PROFILE['tierAdditions'][r['tier']] if v['tier'] and r['cls']=='WHITE' else 0.)
    h = (v['h_white'] if r['cls']=='WHITE' else v['h_grey']) if v['thresholds'] else (v['h_white']+v['h_grey'])/2
    K = v['K']
    if v['response'] == 'linear':
        movement = budget
    elif v['response'] == 'smooth':
        movement = K*math.log1p(budget/(K*math.exp(max(-25.,min(25.,(u-h)/K)))))
    elif u < h:
        flat = h-u
        movement = budget if budget <= flat else flat + K*math.log1p((budget-flat)/K)
    else:
        movement = K*math.log1p(budget/(K*math.exp(max(-25.,min(25.,(u-h)/K)))))
    return movement if v['response'] == 'no_rectification' else max(0.,u+movement)-max(0.,u)


def dose(r, amp, v):
    return amp * (age(r['age']) if v['age'] else 1.) * r['N']**v['dose_n'] / r['p']**v['dose_p']


def predicted(r, amp, v):
    b = dose(r, amp, v)
    return gain(r,b,v),gain(r,b*v['rho'],v)


def calibration(anchor, v):
    if not v['amplitude']:
        return PROFILE['dose']['globalAmplitude']
    # PR #157 inverts each stat separately then averages implied lower doses.
    # Reproduce that precise prescribed anchor estimator; optimization code is independent.
    budgets=[]
    for r in anchor:
        def loss(b):
            return (gain(r,b,v)-r['lo'])**2+(gain(r,b*v['rho'],v)-r['hi'])**2
        lo, hi = 0., 10000.
        for _ in range(160):
            left=lo+(hi-lo)/3
            right=hi-(hi-lo)/3
            if loss(left)<=loss(right): hi=right
            else: lo=left
        budgets.append((lo+hi)/2)
    r=anchor[0]
    return sum(budgets)/len(budgets)/dose(r,1,v)


def rowscore(r, a, b, v, amp, variation, data):
    lo, hi=predicted(r,amp,v)
    obslo,obshi=r['lo'],r['hi']
    mid,obsmid=(lo+hi)/2,(obslo+obshi)/2
    intersection=max(0.,min(hi,obshi)-max(lo,obslo))
    union=max(hi,obshi)-min(lo,obslo)
    return dict(variant=variation,partition=b[0],player=r['player'],state=b[2],age=r['age'],tier=r['tier'],
                anchor=a[3],target=b[3],anchor_coach=data[a][0]['coach'],target_coach=r['coach'],
                anchor_family=data[a][0]['family'],family=r['family'],N=r['N'],p=r['p'],stat=r['stat'],start=r['start'],cls=r['cls'],
                amp=amp,pred_lo=lo,pred_hi=hi,pred_mid=mid,obs_lo=obslo,obs_hi=obshi,obs_mid=obsmid,
                residual=mid-obsmid,mid_abs=abs(mid-obsmid),inside=int(obslo<=mid<=obshi),
                overlap=int(max(lo,obslo)<=min(hi,obshi)),endpoint_mae=(abs(lo-obslo)+abs(hi-obshi))/2,
                iou=1 if union==0 else intersection/union,source=r['source'],grade=r['grade'])


def replay(data, variant='current', screen_only=False, family_match=False, exclude_near=False, overrides=None):
    v=settings(variant)
    v.update(overrides or {})
    groups=defaultdict(list)
    for k, rr in data.items():
        if not rr or (screen_only and rr[0]['grade']=='secondary-transcription'):
            continue
        groups[k[:3]].append(k)
    out=[]
    for gg in groups.values():
        if len(gg)<2: continue
        for a in gg:
            amp=calibration(data[a],v)
            for b in gg:
                if b==a: continue
                ar,br=data[a][0],data[b][0]
                if family_match and ar['family']!=br['family']:continue
                if exclude_near and ar['coach']==br['coach'] and ar['p']==br['p'] and abs(ar['N']-br['N'])<=8:continue
                for r in data[b]: out.append(rowscore(r,a,b,v,amp,variant,data))
    return out


def summary(rows):
    if not rows:return {'n':0}
    n=len(rows)
    return dict(n=n,players=len({r['player'] for r in rows}),states=len({(r['partition'],r['player'],r['state']) for r in rows}),
                pairs=len({(r['partition'],r['anchor'],r['target']) for r in rows}),
                midpoint_mae=sum(r['mid_abs'] for r in rows)/n,inside=sum(r['inside'] for r in rows)/n,
                overlap=sum(r['overlap'] for r in rows)/n,endpoint_mae=sum(r['endpoint_mae'] for r in rows)/n,
                iou=sum(r['iou'] for r in rows)/n,signed_residual=sum(r['residual'] for r in rows)/n)


def grouped(rows, field):
    d=defaultdict(list)
    for r in rows: d[str(r[field])].append(r)
    return {k:summary(v) for k,v in sorted(d.items())}


def consistency(data):
    d=defaultdict(list)
    for k,rr in data.items():
        for r in rr:d[k[:3]+(r['stat'],)].append((r['start'],r['cls'],k[3]))
    return {str(k):v for k,v in d.items() if len({(s,c) for s,c,_ in v})>1}


def same_stat_copy_baseline(data, scored):
    ids={(k[0],k[2],k[3]):k for k in data}
    copy=[]
    for r in scored:
        a=data[ids[(r['partition'],r['state'],r['anchor'])]]
        found=next((x for x in a if x['stat']==r['stat'] and x['start']==r['start']),None)
        if found:
            mid=(found['lo']+found['hi'])/2
            copy.append(dict(player=r['player'],current_abs=r['mid_abs'],copy_abs=abs(mid-r['obs_mid']),
                             copy_inside=int(r['obs_lo']<=mid<=r['obs_hi'])))
    return dict(n=len(copy),current_mae=sum(x['current_abs'] for x in copy)/len(copy),
                copy_mae=sum(x['copy_abs'] for x in copy)/len(copy),
                copy_inside=sum(x['copy_inside'] for x in copy)/len(copy))


def implied_lower(r,v):
    low,high=0.,10000.
    for _ in range(160):
        x=low+(high-low)/3
        y=high-(high-low)/3
        def loss(b):return (gain(r,b,v)-r['lo'])**2+(gain(r,b*v['rho'],v)-r['hi'])**2
        if loss(x)<=loss(y):high=y
        else:low=x
    return (low+high)/2


def mechanism_diagnostics(data, scored):
    """Separate common budget failure from a transferable per-stat response."""
    v=settings('current')
    budgets={k:{r['stat']:implied_lower(r,v) for r in rr} for k,rr in data.items() if rr}
    ids={(k[0],k[2],k[3]):k for k in data}
    internal=[]
    for k,br in budgets.items():
        if data[k][0]['grade']=='secondary-transcription' or len(br)<2:continue
        vals=list(br.values());mean=statistics.mean(vals)
        internal.append(dict(player=data[k][0]['player'],event=k[3],family=data[k][0]['family'],
                             n=len(vals),mean_budget=mean,cv=statistics.pstdev(vals)/mean if mean else None,
                             min_budget=min(vals),max_budget=max(vals)))
    matched=[]
    for row in scored:
        a=ids[(row['partition'],row['state'],row['anchor'])]
        b=ids[(row['partition'],row['state'],row['target'])]
        ar=next((r for r in data[a] if r['stat']==row['stat'] and r['start']==row['start'] and r['cls']==row['cls']),None)
        if ar is None:continue
        target=next(r for r in data[b] if r['stat']==row['stat'])
        scale=(row['N']/row['p'])/(ar['N']/ar['p'])
        budget=budgets[a][row['stat']]*scale
        lo,hi=gain(target,budget,v),gain(target,budget*v['rho'],v)
        matched.append(dict(player=row['player'],anchor=row['anchor'],target=row['target'],stat=row['stat'],
                            current_abs=row['mid_abs'],stat_specific_abs=abs((lo+hi)/2-row['obs_mid']),
                            current_endpoint_mae=row['endpoint_mae'],
                            stat_specific_endpoint_mae=(abs(lo-row['obs_lo'])+abs(hi-row['obs_hi']))/2,
                            implied_budget_ratio=budgets[b][row['stat']]/budgets[a][row['stat']],
                            expected_N_over_p_ratio=scale))
    aggregate_matched=lambda rr:dict(n=len(rr),common_midpoint_mae=sum(x['current_abs'] for x in rr)/len(rr),
                                     per_stat_midpoint_mae=sum(x['stat_specific_abs'] for x in rr)/len(rr),
                                     common_endpoint_mae=sum(x['current_endpoint_mae'] for x in rr)/len(rr),
                                     per_stat_endpoint_mae=sum(x['stat_specific_endpoint_mae'] for x in rr)/len(rr))
    byplayer={p:aggregate_matched([x for x in matched if x['player']==p]) for p in sorted({x['player'] for x in matched})}
    return dict(within_anchor_budget_dispersion=internal,same_stat_matched=aggregate_matched(matched),
                by_player=byplayer,matched_rows=matched,
                caveat='A per-stat anchor budget may absorb a wrong marginal curve; it is not proof of stat-specific allocation.')


def write_csv(path,rows):
    with path.open('w',newline='') as f:
        if rows:
            w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)


if __name__=='__main__':
    import sys
    out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
    events={**archive(),**chat()}
    primary=replay(events,screen_only=True)
    variants=['current','no_tier','same_threshold','no_age','no_N','no_p','N_1_4','p_0_75','linear_response','smooth_exponential','no_rectification','fixed_amplitude','fixed_rho_1','K_47','thresholds_135_120']
    results={x:summary(replay(events,x,screen_only=True)) for x in variants}
    canonical_current=replay(canonical())
    canonical_conflict=replay(canonical(True))
    curve_sensitivity={str(K):dict(all=summary(rows),by_player=grouped(rows,'player'))
                       for K in (26.05,28,30,32,35,38,47)
                       for rows in [replay(events,screen_only=True,overrides={'K':K})]}
    doc=dict(schema='ordinary-coach-independent-validation-v1',repoHead='workflow/coach-corpus-holdout-20260923@b7df869ddad595e075c323b52f728d1c0cfd539d',
             profile=PROFILE,counts={'archive_rows':sum(map(len,archive().values())),'chat_rows':sum(map(len,chat().values())),
                                     'canonical_rows':sum(map(len,canonical().values()))},
             primary=summary(primary), by={f:grouped(primary,f) for f in ('player','age','tier','cls','N','p','family','target_coach','anchor_family','stat')},
             sensitivity=dict(near_pair_excluded=summary(replay(events,screen_only=True,exclude_near=True)),
                              same_family_only=summary(replay(events,screen_only=True,family_match=True)),
                              canonical=summary(canonical_current),canonical_with_conflicts=summary(canonical_conflict),
                              same_stat_copy=same_stat_copy_baseline(events,primary)),
             ablations=results,mechanism_diagnostics=mechanism_diagnostics(events,primary),
             exploratory_K_sensitivity=curve_sensitivity,consistency_warnings=consistency(events),
             primary_events=[dict(partition=k[0],player=rr[0]['player'],state=k[2],event=k[3],coach=rr[0]['coach'],family=rr[0]['family'],
                                  multiplier=rr[0]['N'],p=rr[0]['p'],age=rr[0]['age'],tier=rr[0]['tier'],stat_count=len(rr),
                                  source=rr[0]['source'],grade=rr[0]['grade']) for k,rr in events.items() if rr and rr[0]['grade']!='secondary-transcription'],
             excluded_events=[x['experimentId'] for x in json.loads((DATA/'resource-coach-log/quality-exclusions.json').read_text())['experiments']]+['PRV-0022'],
             evidenceLimit='Referenced screenshot filenames and chat-transcribed ranges have not been independently checked against image pixels; outcomes are preview ranges, not executed coach gains.')
    write_csv(out/'predictions.csv',primary)
    write_csv(out/'canonical_predictions.csv',canonical_current)
    write_csv(out/'canonical_conflict_sensitivity.csv',canonical_conflict)
    (out/'validation.json').write_text(json.dumps(doc,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:doc[k] for k in ('primary','sensitivity','ablations','consistency_warnings')},indent=2))
