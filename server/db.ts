import { DatabaseSync } from 'node:sqlite';
import Libsql from 'libsql';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export type RecordData = Record<string, any>;
export const now = () => new Date().toISOString();
export const uid = (prefix:string) => `${prefix}-${randomUUID()}`;
export const hash = (value:string|Buffer) => createHash('sha256').update(value).digest('hex');
export const canonical = (url:string) => { const u = new URL(url); u.hash=''; for(const k of [...u.searchParams.keys()]) if(k.startsWith('utm_'))u.searchParams.delete(k); return u.toString(); };
export type DatabaseSettings={driver:'sqlite'|'libsql';syncUrl?:string;authToken?:string};
export function databaseSettings(env:NodeJS.ProcessEnv=process.env):DatabaseSettings {
  const driver=env.DATABASE_DRIVER??'sqlite',syncUrl=env.TURSO_DATABASE_URL,authToken=env.TURSO_AUTH_TOKEN;
  if(driver!=='sqlite'&&driver!=='libsql')throw new Error('DATABASE_DRIVER must be sqlite or libsql.');
  if(Boolean(syncUrl)!==Boolean(authToken))throw new Error('Configure both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
  if(syncUrl){let url:URL;try{url=new URL(syncUrl);}catch{throw new Error('TURSO_DATABASE_URL must be a valid secure database URL.');}if(!['https:','libsql:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.hostname||url.pathname!=='/')throw new Error('TURSO_DATABASE_URL must be a secure database origin without credentials or a path.');if(driver!=='libsql')throw new Error('TURSO_DATABASE_URL requires DATABASE_DRIVER=libsql.');}
  if(env.REQUIRE_REMOTE_DATABASE==='true'&&(!syncUrl||driver!=='libsql'))throw new Error('Free hosting requires the durable remote database. Configure Turso before starting; local files are ephemeral.');
  return{driver,syncUrl,authToken};
}
type SqlDatabase={exec(sql:string):unknown;prepare(sql:string):{all(...args:any[]):any[];get(...args:any[]):any;run(...args:any[]):{changes:number|bigint;lastInsertRowid:number|bigint}};close():unknown};
export class Store {
  db: SqlDatabase;
  constructor(path=process.env.DATABASE_PATH || 'storage/intelligence.sqlite',settings=databaseSettings()) {
    if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true});
    if(settings.driver==='libsql'){
      const remote=path!==':memory:'&&Boolean(settings.syncUrl),db=new Libsql(path,(remote?{syncUrl:settings.syncUrl,authToken:settings.authToken,syncPeriod:30,readYourWrites:true,offline:false}:{timeout:5000}) as any);
      try{if(remote)db.sync();}catch{db.close();throw new Error('Unable to connect to the durable database. Check the Turso connection and access token. No local-only fallback was started.');}
      this.db=db;
    }else this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    for(const file of readdirSync(new URL('./migrations/',import.meta.url)).filter(f=>/^\d+-.*\.sql$/.test(f)).sort()){
      const version=Number(file.split('-')[0]);
      if(!this.one('SELECT version FROM schema_migrations WHERE version=?',version))this.transaction(()=>{
        this.db.exec(readFileSync(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
        this.run('INSERT INTO schema_migrations VALUES (?,?)',version,now());
      });
    }
  }
  all(sql:string,...args:any[]):any[]{return this.db.prepare(sql).all(...args);}
  one(sql:string,...args:any[]):any{return this.db.prepare(sql).get(...args);}
  run(sql:string,...args:any[]){return this.db.prepare(sql).run(...args);}
  list(table:string,where='',...args:any[]):RecordData[]{return this.all(`SELECT * FROM ${safeTable(table)} ${where}`,...args).map(r=>({...JSON.parse(r.data),id:r.id??JSON.parse(r.data).id}));}
  get(table:string,id:string):RecordData|undefined {const r=this.one(`SELECT * FROM ${safeTable(table)} WHERE id=?`,id);return r?{...JSON.parse(r.data),id:r.id}:undefined;}
  meta(key:string,value?:unknown):any {if(value!==undefined)this.run('INSERT OR REPLACE INTO app_metadata VALUES (?,?)',key,JSON.stringify(value));return JSON.parse(this.one('SELECT data FROM app_metadata WHERE key=?',key)?.data??'null');}
  transaction(fn:()=>void){this.db.exec('BEGIN IMMEDIATE');try{fn();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  close(){this.db.close();}
}
const tables=new Set(['territories','accounts','account_relationships','facilities','connectors','sources','research_runs','documents','document_versions','claims','events','products','opportunities','buyer_roles','competitive_constraints','actions','analyst_notes','scoring_policies','score_snapshots','document_relationships','event_reconciliations']);
function safeTable(t:string){if(!tables.has(t))throw new Error('Unknown table');return t;}
