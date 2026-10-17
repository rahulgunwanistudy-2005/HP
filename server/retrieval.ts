import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import {isIP} from 'node:net';
import ipaddr from 'ipaddr.js';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash} from './db.ts';

export const MAX_BYTES=5*1024*1024;
const MAX_TEXT=500000,MAX_ROBOTS=512*1024;
const UA='HPAccountIntelligenceResearch/1.0 (local analyst initiated; public evidence only)';
export class RetrievalError extends Error {
  constructor(message:string,public code='RETRIEVAL_FAILED',public retryable=false){super(message);this.name='RetrievalError';}
}
const canceled=()=>new RetrievalError('Canceled','CANCELED');
export type PassageCandidate={text:string,section:string,score:number,signals:string[],page?:number,publishedAt?:string|null};
export type ParsedDocument={title:string,text:string,publishedAt:string|null,items:any[],candidates?:PassageCandidate[],sourceMetadata?:Record<string,any>,warnings?:string[],pages?:{page:number,text:string}[],pageCount?:number};
export type RetrievalResult=ParsedDocument&{url:string,canonicalUrl:string,fingerprint:string,bytes:number,adapter:string,contentType:string,status:number};
export function validatePublicUrl(input:string){
  let u:URL;try{u=new URL(input);}catch{throw new RetrievalError('Invalid URL','UNSAFE_URL');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new RetrievalError('Only credential-free public HTTP(S) URLs are supported','UNSAFE_URL');
  if(u.port&&!['80','443'].includes(u.port))throw new RetrievalError('Only public HTTP(S) default ports are supported','UNSAFE_URL');
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')&&!isIP(host))throw new RetrievalError('Local and internal hostnames are forbidden','UNSAFE_URL');
  if(isIP(host)&&!isPublicAddress(host))throw new RetrievalError('Private, local, reserved and metadata IP addresses are forbidden','UNSAFE_URL');
  u.hash='';return u;
}
export function isPublicAddress(address:string){
  try{const ip=ipaddr.process(address);
    if(ip.kind()==='ipv6'){
      if(ip.match(ipaddr.parse('64:ff9b::'),96))return ipaddr.parse(ip.toByteArray().slice(-4).join('.')).range()==='unicast';
      return ip.range()==='unicast'&&ip.match(ipaddr.parse('2000::'),3);
    }
    return ip.range()==='unicast';
  }catch{return false;}
}
type LookupAddress={address:string,family:number};
export async function resolvePublic(host:string,lookup=dns.lookup):Promise<LookupAddress[]> {
  const clean=host.replace(/^\[|\]$/g,'');
  const answers:LookupAddress[]=isIP(clean)?[{address:clean,family:isIP(clean)}]:await lookup(clean,{all:true,verbatim:true});
  if(!answers.length||answers.some(a=>!isPublicAddress(a.address)))throw new RetrievalError('DNS resolved to a forbidden or mixed private/public address','UNSAFE_DNS');
  return answers;
}
export function boundedOperation<T>(operation:Promise<T>,signal:AbortSignal|undefined,ms:number,label:string):Promise<T>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){operation.catch(()=>{});reject(canceled());return;}
    const abort=()=>finish(canceled()),timer=setTimeout(()=>finish(new RetrievalError(label+' timed out','TIMEOUT',true)),ms);
    const finish=(error?:unknown,value?:T)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value as T);};
    signal?.addEventListener('abort',abort,{once:true});
    operation.then(v=>finish(undefined,v),e=>finish(e));
  });
}
const domainTime=new Map<string,number>();
const pause=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  if(signal?.aborted){reject(canceled());return;}
  const cancel=()=>{clearTimeout(timer);reject(canceled());};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},Math.max(0,ms));
  signal?.addEventListener('abort',cancel,{once:true});
});
export type PublicResponse={status:number,headers:http.IncomingHttpHeaders,buffer:Buffer};
async function singleRequest(u:URL,signal?:AbortSignal):Promise<PublicResponse>{
  const answers=await boundedOperation(resolvePublic(u.hostname),signal,10000,'DNS resolution');
  const previous=domainTime.get(u.hostname)??0;domainTime.set(u.hostname,Math.max(Date.now(),previous)+1000);
  if(domainTime.size>2000)for(const [host,time]of domainTime)if(time<Date.now())domainTime.delete(host);
  await pause(Math.max(0,previous-Date.now()),signal);
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(canceled());return;}
    let settled=false;
    const finish=(error?:unknown,value?:PublicResponse)=>{if(settled)return;settled=true;clearTimeout(hardTimeout);error?reject(error):resolve(value!);};
    const transport=u.protocol==='https:'?https:http;
    // Use exactly the vetted addresses for the actual connection; preserve Host and TLS SNI.
    const lookup:any=(_host:string,opts:any,cb:any)=>{if(typeof opts==='function'){cb=opts;opts={};}if(opts?.all)cb(null,answers);else cb(null,answers[0].address,answers[0].family);};
    const req=transport.request(u,{method:'GET',agent:false,headers:{'User-Agent':UA,Accept:'text/html,application/json,application/pdf,application/rss+xml,application/atom+xml,text/plain;q=0.8','Accept-Encoding':'identity'},lookup,signal},res=>{
      const chunks:Buffer[]=[];let size=0;
      const encoding=String(res.headers['content-encoding']??'identity').toLowerCase();
      if(encoding!=='identity'){finish(new RetrievalError('Unsupported encoded response; source ignored Accept-Encoding: identity','UNSUPPORTED_ENCODING'));res.destroy();return;}
      if(Number(res.headers['content-length']??0)>MAX_BYTES){finish(new RetrievalError('Document exceeds 5 MiB limit','TOO_LARGE'));res.destroy();return;}
      res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){finish(new RetrievalError('Document exceeds 5 MiB limit','TOO_LARGE'));res.destroy();return;}chunks.push(Buffer.from(chunk));});
      res.on('end',()=>finish(undefined,{status:res.statusCode??0,headers:res.headers,buffer:Buffer.concat(chunks)}));
      res.on('aborted',()=>finish(new RetrievalError('Source response was interrupted','INTERRUPTED',true)));
      res.on('error',e=>finish(e));
      res.on('close',()=>{if(!res.complete)finish(new RetrievalError('Source response closed before completion','INTERRUPTED',true));});
    });
    const hardTimeout=setTimeout(()=>{finish(new RetrievalError('Request timed out after 10 seconds','TIMEOUT',true));req.destroy();},10000);
    req.on('error',e=>finish(signal?.aborted?canceled():e));req.end();
  });
}
export async function requestRedirects(input:string,signal?:AbortSignal,maxRedirects=4,respectRobots=false,request=singleRequest,access=checkRobots){
  let u=validatePublicUrl(input);
  for(let i=0;i<=maxRedirects;i++){
    if(signal?.aborted)throw canceled();
    if(respectRobots)await access(u,signal);
    const r=await request(u,signal);
    if([301,302,303,307,308].includes(r.status)){
      if(!r.headers.location)throw new RetrievalError('Redirect response has no Location','INVALID_REDIRECT');
      if(i===maxRedirects)throw new RetrievalError('Too many redirects','REDIRECT_LIMIT');
      u=validatePublicUrl(new URL(r.headers.location,u).href);continue;
    }
    return{...r,finalUrl:u.href};
  }
  throw new RetrievalError('Redirect limit','REDIRECT_LIMIT');
}

const robotsCache=new Map<string,{expires:number,text:string}>();
function robotsPath(value:string){
  return value.replace(/%([0-9a-f]{2})/gi,(raw,hex)=>{const c=String.fromCharCode(parseInt(hex,16));return /[A-Za-z0-9._~-]/.test(c)?c:raw.toUpperCase();}).replace(/[^\x00-\x7F]/gu,c=>encodeURIComponent(c));
}
function globPrefix(pattern:string,path:string){
  const anchored=pattern.endsWith('$');if(anchored)pattern=pattern.slice(0,-1);
  const parts=pattern.split('*');
  if(parts.length===1)return anchored?path===pattern:path.startsWith(pattern);
  if(!path.startsWith(parts[0]))return false;
  let offset=parts[0].length;
  for(let i=1;i<parts.length;i++){
    const part=parts[i];if(!part)continue;
    if(anchored&&i===parts.length-1)return path.endsWith(part)&&path.length-part.length>=offset;
    const found=path.indexOf(part,offset);if(found<0)return false;offset=found+part.length;
  }
  return true;
}
export function robotsAllows(text:string,path:string){
  if(Buffer.byteLength(text)>MAX_ROBOTS)throw new RetrievalError('Source robots policy exceeds supported size','ACCESS_UNAVAILABLE');
  const groups:{agents:string[],rules:{allow:boolean,path:string}[]}[]=[];let current:typeof groups[number]|undefined,hadDirective=false;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.replace(/#.*$/,'').trim();if(!line){if(hadDirective)current=undefined;hadDirective=false;continue;}
    const index=line.indexOf(':');if(index<0)continue;const key=line.slice(0,index).trim().toLowerCase(),value=line.slice(index+1).trim();
    if(key==='user-agent'){if(!value)continue;if(!current||hadDirective){current={agents:[],rules:[]};groups.push(current);}current.agents.push(value.toLowerCase());hadDirective=false;}
    else if(current&&(key==='allow'||key==='disallow')){
      hadDirective=true;
      if(value){if(value.length>2048||(value.match(/\*/g)?.length??0)>32)throw new RetrievalError('Source robots rule is too complex','ACCESS_UNAVAILABLE');current.rules.push({allow:key==='allow',path:robotsPath(value)});}
    }
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&UA.toLowerCase().startsWith(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*')),normalized=robotsPath(path);
  const matches=selected.flatMap(g=>g.rules).filter(r=>globPrefix(r.path,normalized)).sort((a,b)=>b.path.replace(/[*$]/g,'').length-a.path.replace(/[*$]/g,'').length||Number(b.allow)-Number(a.allow));
  return matches[0]?.allow??true;
}
async function checkRobots(u:URL,signal?:AbortSignal){
  let cached=robotsCache.get(u.origin);
  if(!cached||cached.expires<Date.now()){
    const r=await requestRedirects(new URL('/robots.txt',u).href,signal,2);
    if(r.status===404||r.status===410)cached={text:'',expires:Date.now()+3600000};
    else if(r.status>=200&&r.status<300){
      const text=r.buffer.toString('utf8');
      if(/<(?:!doctype|html|body)\b/i.test(text))throw new RetrievalError('Source robots returned HTML instead of an access policy','ACCESS_UNAVAILABLE');
      if(r.buffer.length>MAX_ROBOTS)throw new RetrievalError('Source robots policy exceeds supported size','ACCESS_UNAVAILABLE');
      cached={text,expires:Date.now()+3600000};
    }else throw new RetrievalError('Source access conditions unavailable (robots HTTP '+r.status+'); skipped conservatively','ACCESS_UNAVAILABLE',r.status>=500);
    robotsCache.set(u.origin,cached);
    if(robotsCache.size>128){for(const [origin,value]of robotsCache)if(value.expires<Date.now())robotsCache.delete(origin);while(robotsCache.size>128)robotsCache.delete(robotsCache.keys().next().value!);}
  }
  if(!robotsAllows(cached.text,u.pathname+u.search))throw new RetrievalError('Source robots policy restricts this research path','ACCESS_RESTRICTED');
}

function decodeEntities(text:string){const entities:Record<string,string>={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};return text.replace(/&#(x[0-9a-f]+|\d+);/gi,(_raw,code)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):parseInt(code,10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';}).replace(/&(nbsp|amp|lt|gt|quot|apos);/gi,(_raw,name:string)=>entities[name.toLowerCase()]??'');}
function cleanMarkup(html:string){
  return html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|nav|footer|header|form|button|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*$/gi,' ');
}
export function stripHtml(html:string){return decodeEntities(cleanMarkup(String(html)).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
const signalRules:[string,RegExp][]=[
  ['procurement',/\b(tender|rfp|rfi|procurement|invitation to (?:bid|tender)|request for proposal|closing date|bid deadline)\b/i],
  ['amendment',/\b(amend(?:ed|ment)?|supersed(?:ed|es|ing)?|deadline extended|extension of (?:time|deadline)|revised (?:date|quantity|scope|deadline))\b/i],
  ['cancellation_or_delay',/\b(cancel(?:ed|led|lation)?|postpon(?:ed|ement)|delay(?:ed)?|withdrawn|suspended|deferred)\b/i],
  ['facility',/\b(factory|facility|campus|hospital|office|plant|distribution cent(?:er|re)|expansion|opens?|opened|construction)\b/i],
  ['workload',/\b(workstation|cad|engineering|simulation|rendering|printing|multifunction|mfp|collaboration|meeting room|device|endpoint|packaging|production)\b/i],
  ['supplier_relationship',/\b(supplier|preferred provider|partnership|awarded|contract|agreement|incumbent)\b/i],
];
export function selectCandidates(blocks:{text:string,section?:string,page?:number,publishedAt?:string|null}[],title=''):PassageCandidate[]{
  const result:PassageCandidate[]=[];
  for(const block of blocks.slice(0,5000)){
    const text=stripHtml(block.text).slice(0,2000);
    if(text.length<30||text.split(/\s+/).length<4&&!/[\u3000-\u9fff]/.test(text))continue;
    const signals=signalRules.filter(([,re])=>re.test(text)).map(([name])=>name);
    const noise=(text.match(/\b(cookie|privacy|subscribe|newsletter|sign in|log in|skip to|all rights reserved|accept all|manage consent)\b/gi)??[]).length;
    const score=signals.length*8+(signals.includes('amendment')||signals.includes('cancellation_or_delay')?8:0)+(signals.includes('procurement')?4:0)+(text.length>=80?2:0)-noise*12;
    if(score<0)continue;
    if(!result.some(c=>c.text===text))result.push({text,section:block.section??'Extracted source text',score,signals,...(block.page?{page:block.page}:{}),...(block.publishedAt?{publishedAt:block.publishedAt}:{})});
  }
  return result.sort((a,b)=>b.score-a.score).slice(0,5);
}
export function boundedPassage(text:string,words=20){const selected=String(text).trim().split(/\s+/).slice(0,words).join(' ');return selected.length<=300?selected:selected.slice(0,300).replace(/\s+\S*$/,'').trim();}
function attrs(tag:string){const result:Record<string,string>={};for(const m of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g))result[m[1].toLowerCase()]=decodeEntities(m[2]??m[3]??m[4]);return result;}
function dateValue(value:unknown){
  if(typeof value!=='string'||value.trim().length>100||!value.trim()||!Number.isFinite(Date.parse(value)))return null;
  const iso=value.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if(iso){const d=new Date(Date.UTC(+iso[1],+iso[2]-1,+iso[3]));if(d.getUTCFullYear()!==+iso[1]||d.getUTCMonth()!==+iso[2]-1||d.getUTCDate()!==+iso[3])return null;}
  else if(!/\b(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/.test(value))return null;
  return value.trim();
}
function textValue(value:unknown,depth=0):string{if(depth>10)return '';if(typeof value==='string'||typeof value==='number')return stripHtml(String(value));if(Array.isArray(value))return value.slice(0,100).map(v=>textValue(v,depth+1)).join(' ');if(value&&typeof value==='object')return Object.entries(value).filter(([key])=>!key.startsWith('@_')).slice(0,100).map(([,v])=>textValue(v,depth+1)).join(' ');return '';}
export function parseHtml(html:string):ParsedDocument{
  const metadata:Record<string,any>={},warnings:string[]=[];
  for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]),key=(a.property??a.name??'').toLowerCase();if(key&&a.content)metadata[key]=a.content;}
  const language=attrs(html.match(/<html\b[^>]*>/i)?.[0]??'').lang??null;
  let structured:any={};
  for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const data=JSON.parse(m[1]);const nodes=Array.isArray(data)?data:Array.isArray(data?.['@graph'])?data['@graph']:[data];structured=nodes.find((v:any)=>v&&typeof v==='object'&&(v.datePublished||v.headline))??structured;}catch{warnings.push('Invalid structured source metadata ignored');}
  }
  const title=stripHtml(metadata['og:title']??structured.headline??html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'Untitled public document');
  const publishedTime=Array.from(html.matchAll(/<time\b[^>]*>/gi)).map(m=>attrs(m[0])).find(a=>a.itemprop?.toLowerCase()==='datepublished'||/\bpublish(?:ed|ation)?\b/i.test(a.class??''));
  const rawDate=metadata['article:published_time']??metadata['datepublished']??metadata['publication_date']??metadata['pubdate']??metadata['dc.date.issued']??structured.datePublished??publishedTime?.datetime??metadata['date'];
  const publishedAt=dateValue(rawDate);if(rawDate&&!publishedAt)warnings.push('Unparseable source publication date retained only as metadata');
  const declaredCanonical=Array.from(html.matchAll(/<link\b[^>]*>/gi)).map(m=>attrs(m[0])).find(a=>a.rel?.split(/\s+/).includes('canonical'))?.href??null;
  const cleaned=cleanMarkup(html).replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi,' ');
  const article=cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i),main=cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const singleArticle=(cleaned.match(/<article\b/gi)?.length??0)===1;
  const body=(singleArticle?article?.[1]:undefined)??main?.[1]??cleaned;
  const blocks=body.replace(/<\/(?:p|div|section|li|h[1-6]|tr)>|<br\s*\/?>/gi,'\n').split(/\n+/).map(value=>stripHtml(value)).filter(Boolean);
  const text=blocks.join('\n').slice(0,MAX_TEXT);
  const candidates=selectCandidates(blocks.map(text=>({text,section:article?'Article text':main?'Main content':'Document text'})),title);
  if(!candidates.length)warnings.push('No substantive candidate passage identified; manual source inspection required');
  if(blocks.join('\n').length>MAX_TEXT)warnings.push('Extracted text truncated at 500,000 characters');
  return{title,text,publishedAt,items:[],candidates,sourceMetadata:{publisher:metadata['og:site_name']??textValue(structured.publisher?.name??structured.publisher),language,declaredCanonicalUrl:declaredCanonical,publicationDateRaw:rawDate??null,modifiedAt:dateValue(metadata['article:modified_time']??structured.dateModified),metadataBasis:'Publisher-provided metadata; unverified, not an event date'},warnings};
}
export function parseJson(raw:string):ParsedDocument{
  const obj=JSON.parse(raw),chunks:string[]=[],blocks:{text:string,section:string}[]=[];let visited=0,total=0;
  function walk(value:any,path='$',depth=0){
    if(++visited>20000||depth>12||total>MAX_TEXT)return;
    if(typeof value==='string'||typeof value==='number'){const text=stripHtml(String(value));chunks.push(text);total+=text.length;blocks.push({text,section:'JSON field '+path});}
    else if(Array.isArray(value))value.slice(0,500).forEach((v,i)=>walk(v,path+'['+i+']',depth+1));
    else if(value&&typeof value==='object')Object.entries(value).slice(0,500).forEach(([key,v])=>walk(v,path+'.'+key,depth+1));
  }
  walk(obj);
  const root=obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:{};
  return{title:textValue(root.title??root.name)||'Public JSON document',text:chunks.join('\n').slice(0,MAX_TEXT),publishedAt:dateValue(root.datePublished??root.publishedAt??root.published_at),items:[],candidates:selectCandidates(blocks),sourceMetadata:{language:textValue(root.language??root.lang)||null,metadataBasis:'Structured source values; entity, meaning and event dates require review'},warnings:visited>20000||total>MAX_TEXT?['JSON extraction reached its traversal or text bound']:[]};
}
export function parseFeed(raw:string):ParsedDocument{
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw))throw new Error('XML entities and DTDs are not supported');
  if(XMLValidator.validate(raw)!==true)throw new Error('Malformed XML feed');
  const doc=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,removeNSPrefix:true}).parse(raw);
  const feed=doc.rss?.channel??doc.feed;if(!feed)throw new Error('Not a supported RSS or Atom feed');
  const entries=feed.item??feed.entry??[];
  const items=(Array.isArray(entries)?entries:[entries]).slice(0,100).map((entry:any)=>{
    const links=Array.isArray(entry.link)?entry.link:[entry.link],link=links.find((v:any)=>v&&typeof v==='object'&&(!v['@_rel']||v['@_rel']==='alternate'))??links.find((v:any)=>typeof v==='string');
    return{title:textValue(entry.title),url:typeof link==='string'?link:link?.['@_href']??'',publishedAt:dateValue(entry.pubDate??entry.published),updatedAt:dateValue(entry.updated),text:stripHtml(textValue(entry.description??entry.summary??entry.content??entry.encoded)),guid:textValue(entry.guid??entry.id)||null};
  });
  return{title:textValue(feed.title)||'Public feed',text:items.map(i=>i.title+'. '+i.text).join('\n').slice(0,MAX_TEXT),publishedAt:null,items,candidates:selectCandidates(items.map(i=>({text:i.title+'. '+i.text,section:'Feed item: '+i.title,publishedAt:i.publishedAt}))),sourceMetadata:{language:textValue(feed.language??feed['@_lang'])||null,feedUpdatedAt:dateValue(feed.updated??feed.lastBuildDate),metadataBasis:'Feed dates belong to individual items; an updated timestamp is not publication or event time'},warnings:items.length>=100?['Feed limited to 100 items']:[]};
}
async function runParser(args:string[],input:Buffer,signal:AbortSignal|undefined,label:string):Promise<ParsedDocument>{
  if(signal?.aborted)throw canceled();
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=192',...args],{stdio:['pipe','pipe','pipe']});
    const chunks:Buffer[]=[];let size=0,err='',settled=false;
    const finish=(error?:unknown,value?:ParsedDocument)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){child.kill('SIGKILL');reject(error);}else resolve(value!);};
    const abort=()=>finish(canceled());
    const timer=setTimeout(()=>finish(new RetrievalError(label+' parsing exceeded 10 seconds','PARSER_TIMEOUT')),10000);
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',d=>{size+=d.length;if(size>2*MAX_BYTES)finish(new RetrievalError('Extracted text exceeds output limit','PARSER_OUTPUT_LIMIT'));else chunks.push(Buffer.from(d));});
    child.stderr.on('data',d=>{if(err.length<2000)err+=d.toString().slice(0,2000-err.length);});
    child.on('error',e=>finish(e));child.stdin.on('error',e=>finish(e));
    child.on('close',code=>{if(settled)return;if(code!==0)finish(new RetrievalError(label+' extraction failed: '+err.slice(0,300),'PARSE_FAILED'));else{try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof parsed.text!=='string'||typeof parsed.title!=='string'||!Array.isArray(parsed.items))throw new Error('Malformed parser result');finish(undefined,parsed);}catch{finish(new RetrievalError('Invalid '+label+' extraction result','PARSE_FAILED'));}}});
    child.stdin.end(input);
  });
}
export async function parsePdf(buffer:Buffer,signal?:AbortSignal){return runParser([fileURLToPath(new URL('./pdf-worker.mjs',import.meta.url))],buffer,signal,'PDF');}
export async function parseRemoteText(text:string,adapter:string,signal?:AbortSignal):Promise<ParsedDocument>{
  if(!['html','json','feed'].includes(adapter))throw new RetrievalError('Unsupported text adapter','UNSUPPORTED_ADAPTER');
  if(Buffer.byteLength(text)>MAX_BYTES)throw new RetrievalError('Document exceeds 5 MiB limit','TOO_LARGE');
  return runParser(['--import','tsx',fileURLToPath(new URL('./text-worker.ts',import.meta.url))],Buffer.from(JSON.stringify({text,adapter})),signal,'Text');
}
export function decodeSource(buffer:Buffer,contentType:string){
  const charset=contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]??'utf-8';
  try{return new TextDecoder(charset,{fatal:true}).decode(buffer);}catch{throw new RetrievalError('Unsupported or invalid source character encoding: '+charset,'UNSUPPORTED_ENCODING');}
}
export function retryDelay(value:string|undefined,asOf=Date.now()){
  if(!value)return 1000;
  const numeric=Number(value),delay=Number.isFinite(numeric)?numeric*1000:Date.parse(value)-asOf;
  if(!Number.isFinite(delay)||delay<0)return 1000;
  if(delay>3000)throw new RetrievalError('Source requests a later retry; Retry-After exceeds this immediate research-run bound','RETRY_LATER');
  return delay;
}
function retryable(error:unknown){return error instanceof RetrievalError?error.retryable:['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ECONNREFUSED'].includes((error as any)?.code);}
export async function retrieve(input:string,adapter='html',signal?:AbortSignal):Promise<RetrievalResult>{
  validatePublicUrl(input);
  if(!['html','json','feed','pdf'].includes(adapter))throw new RetrievalError('Unsupported retrieval adapter','UNSUPPORTED_ADAPTER');
  let result:Awaited<ReturnType<typeof requestRedirects>>|undefined;
  for(let attempt=0;attempt<2;attempt++){
    try{result=await requestRedirects(input,signal,4,true);}catch(error){if(attempt===0&&!signal?.aborted&&retryable(error)){await pause(1000,signal);continue;}throw error;}
    if((result.status===429||result.status>=500)&&attempt===0){await pause(retryDelay(typeof result.headers['retry-after']==='string'?result.headers['retry-after']:undefined),signal);continue;}break;
  }
  if(!result||result.status<200||result.status>=300)throw new RetrievalError('Source returned HTTP '+(result?.status??'unknown'),result?.status===403||result?.status===401?'ACCESS_RESTRICTED':'HTTP_ERROR');
  const contentType=String(result.headers['content-type']??'').toLowerCase();
  const selected=contentType.includes('application/pdf')?'pdf':adapter==='html'&&/\b(?:application\/(?:[\w.-]+\+)?json|text\/json)\b/.test(contentType)?'json':adapter==='html'&&/application\/(?:rss|atom)\+xml/.test(contentType)?'feed':adapter;
  if(selected==='html'&&!/text\/html|application\/xhtml|text\/plain/.test(contentType))throw new RetrievalError('Unsupported HTML content type: '+contentType,'UNSUPPORTED_CONTENT_TYPE');
  if(selected==='json'&&!/(?:application\/(?:[\w.-]+\+)?json|text\/json|text\/plain)/.test(contentType))throw new RetrievalError('Unsupported JSON content type: '+contentType,'UNSUPPORTED_CONTENT_TYPE');
  if(selected==='feed'&&!/(?:xml|text\/plain)/.test(contentType))throw new RetrievalError('Unsupported feed content type: '+contentType,'UNSUPPORTED_CONTENT_TYPE');
  if(selected==='pdf'&&!result.buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw new RetrievalError('Source is not a PDF document','UNSUPPORTED_CONTENT_TYPE');
  const parsed=selected==='pdf'?await parsePdf(result.buffer,signal):await parseRemoteText(decodeSource(result.buffer,contentType),selected,signal);
  if(!parsed.text.trim())throw new RetrievalError('No extractable relevant text; JavaScript rendering, OCR or manual review may be required','NO_EXTRACTABLE_TEXT');
  return{...parsed,url:input,canonicalUrl:result.finalUrl,fingerprint:hash(parsed.text),text:parsed.text.slice(0,MAX_TEXT),bytes:result.buffer.length,adapter:selected,contentType,status:result.status};
}
