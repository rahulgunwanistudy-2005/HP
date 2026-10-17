import config from '../data/workspace-config.json' with {type:'json'};
import type {RecordData} from './db.ts';
export const workspaceConfig=config;
export const accountIsVisible=(account:RecordData)=>!account.archived&&!config.archivedReferenceAccountIds.includes(account.id);
export const presentation={reportDate:config.reportDate,label:config.reportLabel,basis:config.dateBasis};
