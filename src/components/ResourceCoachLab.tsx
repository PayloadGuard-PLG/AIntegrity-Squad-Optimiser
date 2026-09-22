import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Share } from 'react-native';
import type { Player } from '../database/playerSchema';
import type { CoachPreviewInterval } from '../logic/recommendation';
import type { CoachSourceFamily, CoachTransferClass } from '../logic/coachTransfer';
import {
  RESOURCE_MODEL, predictResourceCoach, fitPlayerCalibration,
  buildResourceStatsFromState, resourceStateConfirmed,
  type ResourceInput, type ResourcePrediction, type ResourceObservation,
  type DisplayClass, type ResourceProgrammeFamily,
} from '../logic/resourceCoachV2';
import {
  RESOURCE_CALIBRATION_CANDIDATE, predictCalibrationCandidate,
  type CandidatePrediction,
} from '../logic/resourceCoachCandidate';
import { resourceCoachService } from '../services/resourceCoachService';
import { theme } from '../constants/theme';

type Props = {
  player: Player;
  stats: string[];
  multiplier: number;
  coachLabel: string;
  sourceFamily: CoachSourceFamily;
  transferClass: CoachTransferClass;
  initialProgrammeFamily?: ResourceProgrammeFamily;
  targetSource?: 'ocr-observed' | 'manual-confirmed' | 'all-round-observed' | 'unresolved';
  observed: CoachPreviewInterval[];
  identityConflict: boolean;
};
const textStyle = { color: theme.inkSec, fontSize: 13, lineHeight: 19 };
const fieldStyle = { color: theme.ink, borderWidth: 1, borderColor: theme.hairline2, padding: 8, minWidth: 64, fontSize: 15 };
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
function Button({ label, onPress, disabled = false }: {label:string;onPress:()=>void;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={{ padding:12, minHeight:44, borderWidth:1, borderColor:theme.steel, opacity:disabled ? 0.4 : 1, marginTop:8 }}>
    <Text style={textStyle}>{label}</Text>
  </Pressable>;
}

/** Remount when the source state changes: a target preview never inherits stale
 * edited observations or a previous player's prediction state. */
export function ResourceCoachLab(props: Props) {
  const key = JSON.stringify([props.player.id,props.player.age,props.player.tier,props.player.role,props.player.stats,props.stats,props.multiplier,props.coachLabel,props.sourceFamily,props.transferClass,props.initialProgrammeFamily,props.targetSource,props.observed,props.identityConflict]);
  return <LabSession key={key} {...props} />;
}
function LabSession({player,stats,multiplier,coachLabel,sourceFamily,transferClass,initialProgrammeFamily='unknown',targetSource='unresolved',observed,identityConflict}: Props) {
  const [classes,setClasses] = useState<Record<string,DisplayClass>>({});
  const [programmeFamily,setProgrammeFamily] = useState<ResourceProgrammeFamily>(initialProgrammeFamily);
  const [values,setValues] = useState<Record<string,{lo:string;hi:string}>>(() => Object.fromEntries(stats.map(stat => {
    const r=observed.find(r=>r.stat===stat);return [stat,{lo:r?String(r.gainLo):'',hi:r?String(r.gainHi):''}];
  })));
  const [ovrLo,setOvrLo]=useState(''), [ovrHi,setOvrHi]=useState('');
  const [prediction,setPrediction]=useState<ResourcePrediction|null>(null);
  const [candidatePrediction,setCandidatePrediction]=useState<CandidatePrediction|null>(null);
  const [predictionId,setPredictionId]=useState<string|undefined>();
  const [savedObservation,setSavedObservation]=useState<ResourceObservation|null>(null);
  const [message,setMessage]=useState('');
  const [exportJson,setExportJson]=useState('');
  const input:ResourceInput=useMemo(()=>({ playerId:player.id,age:player.age,tier:player.tier,
    stateKey:JSON.stringify([player.age,player.tier,[...player.role].sort(),Object.entries(player.stats).sort(([a],[b])=>a.localeCompare(b))]),
    sourceFamily,transferClass,coachLabel,multiplier,programmeFamily,targetSource,
    stats:buildResourceStatsFromState(player.role,player.stats,stats,classes),
  }),[player,stats,multiplier,coachLabel,sourceFamily,transferClass,programmeFamily,classes]);
  const observedMismatch=observed.some(r=>r.statBefore!==undefined && player.stats[r.stat]!==r.statBefore);
  const hasZero=observed.some(r=>r.gainHi===0) || Object.values(values).some(v=>v.lo.trim()!=='' && v.hi.trim()!=='' && Number(v.hi)===0);
  const mismatch=identityConflict||observedMismatch;
  const stateConfirmed=!mismatch&&resourceStateConfirmed(player.role,player.stats,input.stats);
  const evidenceReady=stateConfirmed&&targetSource!=='unresolved';

  function attempt(action:()=>void) { try { action(); } catch(e) { setMessage(e instanceof Error?e.message:String(e)); } }
  function project() { attempt(()=>{
    const p=predictResourceCoach(input,resourceCoachService.calibration(player.id));
    const id=uid();resourceCoachService.savePrediction(id,input,p);setPredictionId(id);
    setPrediction(p);setMessage('V2 baseline prediction snapshot saved.');
  }); }
  function projectCandidate() { attempt(()=>{
    const p=predictCalibrationCandidate(input);
    const id=uid();resourceCoachService.saveCandidatePrediction(id,input,p);setPredictionId(id);
    setCandidatePrediction(p);setMessage('21 Sep calibration-candidate snapshot saved separately from V2.');
  }); }
  function saveObservation() { attempt(()=>{
    const intervals=stats.filter(stat=>values[stat].lo!==''||values[stat].hi!=='').map(stat=>{
      const v=values[stat];if(v.lo.trim()===''||v.hi.trim()==='')throw Error(`Enter both bounds for ${stat}.`);
      return {stat,gainLo:Number(v.lo),gainHi:Number(v.hi)};
    });
    if((ovrLo!==''||ovrHi!=='')&&(ovrLo.trim()===''||ovrHi.trim()===''))throw Error('Enter both OVR boost bounds.');
    const classSource=input.stats.some(s=>s.classSource==='manual-observed')?'manual-confirmed-preview':'state-confirmed-preview';
    const o:ResourceObservation={id:uid(),capturedAt:new Date().toISOString(),input,intervals,evidenceKind:'observed-interval',source:classSource,predictionId,
      ...(ovrLo!==''?{ovrBoost:{gainLo:Number(ovrLo),gainHi:Number(ovrHi)}}:{})};
    resourceCoachService.saveObservation(o);setSavedObservation(o);setMessage('Observed preview saved separately from predictions.');
  }); }
  function changeValue(stat:string,part:'lo'|'hi',value:string) {
    setValues(prev=>({...prev,[stat]:{...prev[stat],[part]:value}}));setSavedObservation(null);
  }
  function toggleClass(stat:string, current:DisplayClass) {
    setClasses(prev=>({...prev,[stat]:current==='WHITE'?'MID_GREY':'WHITE'}));
    setPrediction(null);setCandidatePrediction(null);setPredictionId(undefined);setSavedObservation(null);
  }

  return <View style={{borderWidth:1,borderColor:theme.steel,padding:14,marginBottom:14,backgroundColor:theme.bg}}>
    <Text style={{...textStyle,color:theme.steelLight,fontWeight:'700'}}>{sourceFamily==='training-camp'?'TRAINING CAMP EVIDENCE · RESOURCE COACH V2 NOT APPLIED':'RESOURCE COACH CALIBRATION LAB'}</Text>
    <Text style={textStyle}>{sourceFamily==='training-camp'
      ? `Displayed multiplier ×${Number.isFinite(multiplier)?multiplier:'—'} · ${stats.length} affected stats. Training Camp remains evidence-only for V2.`
      : transferClass==='ordinary'
        ? `Displayed multiplier ×${Number.isFinite(multiplier)?multiplier:'—'} · ${stats.length} affected stats. Stored player state supplies starting stats and classes.`
        : `Displayed multiplier ×${Number.isFinite(multiplier)?multiplier:'—'} · ${stats.length} affected stats. V2 is unavailable for ${transferClass==='reward'?'Reward transfer':'an unresolved transfer class'}.`}</Text>

    <Text style={{...textStyle,fontWeight:'700',marginTop:12}}>PROGRAMME METADATA</Text>
    <Text style={textStyle}>Recorded for residual analysis. OCR uses the explicit DRILL SESSION / SKILL SEMINAR label when present; manual selection remains a fallback.</Text>
    <View style={{flexDirection:'row',gap:6,flexWrap:'wrap',marginTop:6}}>
      {([
        ['unknown','UNKNOWN'],
        ['drill-session','DRILL SESSION'],
        ['skill-seminar','SKILL SEMINAR'],
      ] as const).map(([value,label])=><Pressable key={value} onPress={()=>{
        setProgrammeFamily(value);setCandidatePrediction(null);setPredictionId(undefined);setSavedObservation(null);
      }} style={{padding:8,borderWidth:1,borderColor:programmeFamily===value?theme.steelLight:theme.steel}}>
        <Text style={textStyle}>{label}</Text>
      </Pressable>)}
    </View>

    <Text style={{...textStyle,marginTop:12}}>Starting values and white/grey class are already resolved from this player's persisted scan state. No second confirmation is required.</Text>
    <Text style={{...textStyle,color:targetSource==='unresolved'?theme.hot:theme.pos,marginTop:6}}>
      TARGET SET: {targetSource==='ocr-observed'?'OCR OBSERVED':targetSource==='manual-confirmed'?'MANUAL CONFIRMED':targetSource==='all-round-observed'?'ALL-ROUND OBSERVED':'UNRESOLVED'}
    </Text>
    {targetSource==='unresolved'&&<Text style={{...textStyle,color:theme.hot}}>
      Confirm the exact affected rows before saving this preview as calibration evidence. Coach type/category alone is not target evidence.
    </Text>}
    {input.stats.map(s=><View key={s.stat} style={{marginTop:8,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8}}>
      <Text style={{...textStyle,flexGrow:1}}>{s.stat} {s.displayedStat}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Override ${s.stat} class`} onPress={()=>toggleClass(s.stat,s.displayClass)}
        style={{padding:10,borderWidth:1,borderColor:theme.steel}}>
        <Text style={textStyle}>{s.displayClass==='WHITE'?'WHITE':'GREY'} · {s.classSource==='role-map'?'STORED STATE':'MANUAL OVERRIDE'}</Text>
      </Pressable>
    </View>)}
    <Text style={{...textStyle,color:stateConfirmed?theme.pos:theme.hot,marginTop:10}}>
      {stateConfirmed
        ? '✓ PLAYER STATE RESOLVED · STARTING STATS + CLASSES ARE READY'
        : 'PLAYER STATE UNRESOLVED · CHECK PLAYER IDENTITY OR STARTING STAT VALUES'}
    </Text>
    {mismatch&&<Text style={{...textStyle,color:theme.hot}}>The scanned card or starting values do not match this player. Re-scan the correct preview before saving evidence.</Text>}
    {hasZero&&<Text style={{...textStyle,color:theme.hot}}>A zero-gain preview is directly observed. Preserve it: the 21 Sep candidate explicitly tests below-zero rectification; V2 anchor fitting still cannot consume zero-gain rows.</Text>}
    {sourceFamily==='training-camp'&&<Text style={{...textStyle,color:theme.hot}}>Training Camp is a separate source family. Save its observed intervals; V2 remains blocked.</Text>}

    <Button label="PROJECT V2 BASELINE" onPress={project}
      disabled={sourceFamily==='training-camp'||!stats.length||!Number.isFinite(multiplier)||multiplier<=0||mismatch||hasZero}/>
    {prediction&&<View style={{marginTop:12,gap:6}}>
      <Text style={{...textStyle,fontWeight:'700'}}>V2 · {prediction.mode.toUpperCase()}</Text>
      {prediction.reasons.map(r=><Text key={r} style={textStyle}>{r}</Text>)}
      {prediction.intervals.map(r=><Text key={r.stat} style={textStyle}>{r.stat}: +{r.gainLo.toFixed(1)}–{r.gainHi.toFixed(1)}</Text>)}
      {prediction.ovrBoost&&<Text style={textStyle}>Approx. OVR +{prediction.ovrBoost.gainLo.toFixed(2)}–{prediction.ovrBoost.gainHi.toFixed(2)}</Text>}
    </View>}

    <Button label="PROJECT 21 SEP CALIBRATION CANDIDATE" onPress={projectCandidate}
      disabled={!stateConfirmed||!stats.length||!Number.isFinite(multiplier)||multiplier<=0}/>
    {candidatePrediction&&<View style={{marginTop:12,gap:6,borderWidth:1,borderColor:theme.hairline2,padding:10}}>
      <Text style={{...textStyle,fontWeight:'700'}}>SHARED LATENT + RECTIFICATION · CALIBRATION ONLY</Text>
      {candidatePrediction.reasons.map(r=><Text key={r} style={textStyle}>{r}</Text>)}
      {candidatePrediction.intervals.map(r=><Text key={r.stat} style={textStyle}>{r.stat}: +{r.gainLo.toFixed(1)}–{r.gainHi.toFixed(1)} candidate</Text>)}
      {candidatePrediction.ovrBoost&&<Text style={textStyle}>Approx. OVR +{candidatePrediction.ovrBoost.gainLo.toFixed(2)}–{candidatePrediction.ovrBoost.gainHi.toFixed(2)}</Text>}
    </View>}

    <Text style={{...textStyle,fontWeight:'700',marginTop:18}}>OBSERVED PREVIEW · LOW / HIGH</Text>
    <Text style={textStyle}>Copy the game's preview bounds. Leave unobserved rows empty.</Text>
    {stats.map(stat=><View key={stat} style={{marginTop:10,gap:5}}>
      <Text style={textStyle}>{stat}</Text>
      <View style={{flexDirection:'row',gap:8}}>
        <TextInput accessibilityLabel={`${stat} observed low`} keyboardType="decimal-pad" placeholder="Low" placeholderTextColor={theme.inkMuted} value={values[stat].lo} onChangeText={v=>changeValue(stat,'lo',v)} style={{...fieldStyle,flex:1}}/>
        <TextInput accessibilityLabel={`${stat} observed high`} keyboardType="decimal-pad" placeholder="High" placeholderTextColor={theme.inkMuted} value={values[stat].hi} onChangeText={v=>changeValue(stat,'hi',v)} style={{...fieldStyle,flex:1}}/>
      </View>
    </View>)}
    <Text style={{...textStyle,marginTop:10}}>Optional observed OVR boost</Text>
    <View style={{flexDirection:'row',gap:8}}>
      <TextInput accessibilityLabel="Observed OVR boost low" placeholder="Low" placeholderTextColor={theme.inkMuted} keyboardType="decimal-pad" value={ovrLo} onChangeText={v=>{setOvrLo(v);setSavedObservation(null);}} style={{...fieldStyle,flex:1}}/>
      <TextInput accessibilityLabel="Observed OVR boost high" placeholder="High" placeholderTextColor={theme.inkMuted} keyboardType="decimal-pad" value={ovrHi} onChangeText={v=>{setOvrHi(v);setSavedObservation(null);}} style={{...fieldStyle,flex:1}}/>
    </View>
    <Button label={savedObservation?'OBSERVATION SAVED':'SAVE OBSERVED PREVIEW'} onPress={saveObservation} disabled={!evidenceReady||!!savedObservation}/>
    <Button label="USE SAVED PREVIEW AS V2 SEPARATE ANCHOR" disabled={!savedObservation||sourceFamily!=='resource-coach'||transferClass!=='ordinary'||hasZero} onPress={()=>attempt(()=>{
      const c=fitPlayerCalibration(savedObservation!);resourceCoachService.saveCalibration(c,savedObservation!);
      setPrediction(null);setMessage('V2 anchor saved. The 21 Sep calibration candidate remains unanchored by design.');
    })}/>
    <Text style={{...textStyle,marginTop:8}}>Predictions never update player facts. Programme metadata and observed intervals are retained for later grouped calibration.</Text>
    <Button label="EXPORT PLAYER TEST DATA" onPress={()=>attempt(()=>{
      const data=resourceCoachService.exportPlayer(player.id);setExportJson(data);
      void Share.share({message:data,title:'Resource coach test data'}).catch(()=>setMessage('Share unavailable. Copy the JSON below.'));
    })}/>
    {!!message&&<Text accessibilityRole="alert" style={{...textStyle,color:theme.hot,marginTop:10}}>{message}</Text>}
    {!!exportJson&&<TextInput accessibilityLabel="Exported test data JSON" multiline editable={false} selectTextOnFocus value={exportJson} style={{...fieldStyle,height:180,marginTop:8}}/>}
    <Text style={{...textStyle,fontSize:10,marginTop:12}}>V2: {RESOURCE_MODEL.modelVersion}</Text>
    <Text style={{...textStyle,fontSize:10}}>Candidate: {RESOURCE_CALIBRATION_CANDIDATE.modelVersion}</Text>
  </View>;
}
