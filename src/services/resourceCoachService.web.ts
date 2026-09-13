import { RESOURCE_MODEL, validateObservation, type ResourceInput, type ResourceObservation, type ResourcePrediction, type PlayerCalibration } from '../logic/resourceCoachV2';
const key = 'resource-coach-v2-evidence';
type Store = { predictions: {id:string;input:ResourceInput;prediction:ResourcePrediction}[]; observations: ResourceObservation[]; calibrations: PlayerCalibration[] };
function read(): Store { return JSON.parse(localStorage.getItem(key) ?? '{"predictions":[],"observations":[],"calibrations":[]}'); }
function write(s: Store) { localStorage.setItem(key, JSON.stringify(s)); }
export const resourceCoachService = {
  calibration(id:string) { return read().calibrations.filter(c => c.playerId===id && c.modelVersion===RESOURCE_MODEL.modelVersion).at(-1) ?? null; },
  savePrediction(id:string,input:ResourceInput,prediction:ResourcePrediction) { const s=read();s.predictions.push({id,input,prediction});write(s); },
  saveObservation(o:ResourceObservation) { validateObservation(o);const s=read();if(s.observations.some(r=>r.id===o.id))throw Error('Observation already saved.');s.observations.push(o);write(s); },
  saveCalibration(c:PlayerCalibration,o:ResourceObservation) { const s=read();if(!s.observations.some(r=>r.id===c.anchorId && r.id===o.id))throw Error('Save the anchor first.');s.calibrations.push(c);write(s); },
  exportPlayer(id:string) { const s=read();return JSON.stringify({model:RESOURCE_MODEL,predictions:s.predictions.filter(r=>r.input.playerId===id),observations:s.observations.filter(r=>r.input.playerId===id),calibrations:s.calibrations.filter(c=>c.playerId===id)},null,2); },
};
