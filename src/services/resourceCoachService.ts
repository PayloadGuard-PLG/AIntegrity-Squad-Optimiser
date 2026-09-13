import { expoDb } from '../db';
import { createResourceCoachStore } from './resourceCoachStore';
export const resourceCoachService = createResourceCoachStore(expoDb);
