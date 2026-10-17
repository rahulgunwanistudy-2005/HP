import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,now,hash} from '../server/db.ts';
import {seed,Repository} from '../server/repository.ts';

const tables=['accounts','facilities','account_relationships','connectors','sources','documents','document_versions','claims','events','event_evidence','products','opportunities','opportunity_evidence','buyer_roles','competitive_constraints','actions'] as const;
const authoredTables=new Set(['accounts','facilities','events','opportunities','buyer_roles','competitive_constraints','actions','documents','claims']);
function edited(value:Record<string,any>,table:string){return Boolean(value.authoredAt||value.editedAt||value.liveRetrievedAt||(['accounts','opportunities','actions'].includes(table)&&value.updatedAt)||(['documents','claims'].includes(table)&&Object.hasOwn(value,'reviewNote')));}

/** Additive, transactional refresh. User work and immutable evidence versions take precedence. */
export function synchronizeReviewedSeed(target:Store,reviewed:Store){
  if(!target.meta('seedVersion'))seed(target);
  const report={inserted:0,updated:0,preserved:0,relationshipConflicts:[] as string[],at:now()};
  const documentIds=new Map<string,string>();
  const parentWasEdited=(table:string,parentId:string)=>{const parent=target.get(table,parentId);return Boolean(parent&&edited(parent,table));};
  target.transaction(()=>{
    for(const table of tables){
      const columns=reviewed.all(`PRAGMA table_info(${table})`).map(r=>r.name as string);
      for(const original of reviewed.all(`SELECT * FROM ${table}`)){
        const row={...original};
        // A live document may already own a newly curated URL under a different stable id.
        if(table==='documents'){
          const equivalent=target.one('SELECT id FROM documents WHERE account_id=? AND canonical_url=?',row.account_id,row.canonical_url);
          if(equivalent&&equivalent.id!==row.id){documentIds.set(row.id,equivalent.id);report.preserved++;continue;}
          documentIds.set(row.id,row.id);
        }
        if(row.document_id&&documentIds.has(row.document_id))row.document_id=documentIds.get(row.document_id);
        if(row.data){const data=JSON.parse(row.data);if(data.documentId&&documentIds.has(data.documentId))data.documentId=documentIds.get(data.documentId);for(const key of ['evidenceIds','contradictionIds','contextIds'])if(Array.isArray(data[key]))data[key]=data[key].map((documentId:string)=>documentIds.get(documentId)??documentId);row.data=JSON.stringify(data);}
        if(table==='event_evidence'&&parentWasEdited('events',row.event_id)||table==='opportunity_evidence'&&parentWasEdited('opportunities',row.opportunity_id)){report.preserved++;continue;}
        if(['buyer_roles','competitive_constraints','actions'].includes(table)&&parentWasEdited('opportunities',row.opportunity_id)&&!target.one(`SELECT id FROM ${table} WHERE id=?`,row.id)){report.preserved++;continue;}
        if(table==='opportunity_evidence'){
          const relation=target.one('SELECT relationship FROM opportunity_evidence WHERE opportunity_id=? AND document_id=?',row.opportunity_id,row.document_id);
          if(relation&&relation.relationship!==row.relationship){report.relationshipConflicts.push(`${row.opportunity_id}/${row.document_id}: kept analyst ${relation.relationship}`);report.preserved++;continue;}
        }
        const current=row.id?target.one(`SELECT * FROM ${table} WHERE id=?`,row.id):undefined;
        if(!current){
          const inserted=target.run(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,...columns.map(c=>row[c]));report.inserted+=Number(inserted.changes);continue;
        }
        if(table==='document_versions'){report.preserved++;continue;}
        let updated={...row};
        if(row.data){
          const desired=JSON.parse(row.data),old=JSON.parse(current.data);
          if(authoredTables.has(table)&&edited(old,table)){report.preserved++;continue;}
          if(table==='documents'&&(old.reviewStatus!==desired.reviewStatus||old.reviewHistory?.length)){report.preserved++;continue;}
          if(table==='claims'&&(edited(target.get('documents',row.document_id)??{},'documents')||old.reviewStatus!==desired.reviewStatus||target.one('SELECT id FROM document_versions WHERE document_id=? AND run_id IS NOT NULL LIMIT 1',row.document_id))){report.preserved++;continue;}
          const merged={...old,...desired};
          if(table==='connectors'){merged.enabled=old.enabled;updated.enabled=current.enabled;if(['html','json','feed','pdf'].includes(row.id)&&old.lastTestedAt){merged.status=old.status;merged.lastTestedAt=old.lastTestedAt;}}
          if(table==='opportunities'){merged.analystStatus=old.analystStatus;updated.analyst_status=merged.analystStatus;}
          if(table==='actions'){merged.status=old.status;updated.status=old.status;}
          updated.data=JSON.stringify(merged);
        }
        const fields=columns.filter(c=>c!=='id');if(fields.every(column=>updated[column]===current[column])){report.preserved++;continue;}
        target.run(`UPDATE ${table} SET ${fields.map(column=>`${column}=?`).join(',')} WHERE id=?`,...fields.map(column=>updated[column]),row.id);report.updated++;
        if(table==='documents'){
          const versionId=`${row.id}-reviewed-refresh-${hash(updated.data).slice(0,20)}`;
          target.run('INSERT OR IGNORE INTO document_versions VALUES (?,?,?,?,?,?)',versionId,row.id,updated.fingerprint,now(),null,JSON.stringify({...JSON.parse(updated.data),refreshRecordedAt:now(),extractionMethod:'Reviewed seed metadata refresh; original source review retained'}));
        }
      }
    }
    for(const key of ['coverage','screened','productResearch'])target.meta(key,reviewed.meta(key));
    target.meta('lastReviewedSeedUpdate',{...report,version:'reviewed-2026-10-17-audit',preservation:'Authored records, edited content, analyst source reviews and evidence relationships, immutable document versions, notes, research runs, territory and policy retained. No rows deleted.'});
    new Repository(target).snapshots();
  });
  return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const target=new Store(),reviewed=new Store(':memory:');
  try{seed(reviewed);const report=synchronizeReviewedSeed(target,reviewed);console.log(JSON.stringify({result:'Reviewed seed synchronized without deleting records',report,metrics:new Repository(target).metrics()},null,2));}finally{target.close();reviewed.close();}
}
