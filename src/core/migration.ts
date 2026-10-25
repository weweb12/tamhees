/** One-time, deterministic migration of the checked-in Markdown bootstrap ledger. */
import { createHash } from 'node:crypto';
import { lstat, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { appendValidatedAuditEvents } from './audit.js';
import { atomicWriteJson, verifyPathSafety, verifyStorageTreeSafety } from './atomic-write.js';
import { ENGINE_AUDITOR, ENGINE_VERSION, STORAGE_DIR } from './identity.js';
import { scanMemoryRecord, scanSecretLikeText } from './privacy.js';
import { loadAllRecords, rebuildMemoryIndex } from './store.js';
import {
  CURRENT_SCHEMA_VERSION,
  type ActionPermission,
  type AuditEvent,
  type Clock,
  type Confidence,
  type MemoryKind,
  type MemoryRecord,
  type Sensitivity,
  type SourceType,
  type ValidationIssue,
  type VerificationStatus,
} from './types.js';
import { isIso8601, isSafeArtifactId, validateMemoryRecord } from './validation.js';
import { withWriteLock } from './lock.js';

const MAX_BOOTSTRAP_BYTES = 1_048_576;
const MIGRATION_AUDIT_ID = 'evt-bootstrap-migration';
const ALLOWED_KEYS = new Set(['claim','source_type','source_reference','status','superseded_by','confidence','last_verified','review_after','sensitivity','action_permission','recheck_method','notes']);
const SOURCE_MAP: Readonly<Record<string, SourceType>> = {
  'Owner instruction':'OWNER_INSTRUCTION',
  'Explicit owner instruction':'OWNER_INSTRUCTION',
  'Approved project decision':'OWNER_INSTRUCTION',
  'Owner observation':'AGENT_OBSERVATION',
  'Visible submission message':'DOCUMENT_REFERENCE',
  'Official product documentation review':'DOCUMENT_REFERENCE',
  'Product analysis':'AGENT_INFERENCE',
  'Repository inspection':'REPOSITORY_STATE',
  'Repository and test inspection':'TEST_RESULT',
  'Repository and local verification evidence':'TEST_RESULT',
};
const STATUS_MAP: Readonly<Record<string, VerificationStatus>> = {
  OWNER_CONFIRMED:'OWNER_CONFIRMED', REPO_VERIFIED:'REPO_VERIFIED', TEST_VERIFIED:'TEST_VERIFIED',
  OBSERVED:'OBSERVED', INFERRED:'INFERRED', UNKNOWN:'UNKNOWN', CONFLICTED:'CONFLICTED', REVOKED:'REVOKED',
};
const CONFIDENCE_MAP: Readonly<Record<string, Confidence>> = { HIGH:'HIGH', MEDIUM:'MEDIUM', LOW:'LOW' };
const SENSITIVITY_MAP: Readonly<Record<string, Sensitivity>> = { PUBLIC:'PUBLIC', INTERNAL:'INTERNAL', SENSITIVE:'SENSITIVE', SECRET:'SECRET' };
const PERMISSION_MAP: Readonly<Record<string, ActionPermission>> = {
  MAY_ACT:'MAY_ACT', ACT_WITH_CAUTION:'ACT_WITH_CAUTION', ASK_BEFORE_CHANGE:'ASK_BEFORE_CHANGE',
  MUST_NOT_ACT:'MUST_NOT_ACT', DO_NOT_ACT:'MUST_NOT_ACT', FORGET_OR_REDACT:'FORGET_OR_REDACT',
};

export interface BootstrapMigrationResult {
  readonly success:boolean;
  readonly alreadyMigrated:boolean;
  readonly importedIds:readonly string[];
  readonly auditReferences:readonly string[];
  readonly errors:readonly ValidationIssue[];
}
export interface BootstrapSourceResult {
  readonly success:boolean;
  readonly markdown:string|null;
  readonly path:string|null;
  readonly errors:readonly ValidationIssue[];
}
type MarkerStatus = 'PREPARED' | 'RECORDS_WRITTEN' | 'COMPLETED';
interface Marker {
  schemaVersion:string;
  sourceFingerprint:string;
  status:MarkerStatus;
  importedIds:string[];
  recordFingerprints:Record<string,string>;
  auditReference:string;
  preparedAt:string;
  completedAt?:string;
}
export interface MigrationOperationHooks {
  readonly beforeMarkerWrite?: (marker: Readonly<Marker>) => void | Promise<void>;
  readonly beforeRecordWrite?: (record: MemoryRecord, index: number) => void | Promise<void>;
  readonly beforeIndexRebuild?: () => void | Promise<void>;
  readonly beforeAuditAppend?: (events: readonly AuditEvent[]) => void | Promise<void>;
}

export async function loadBootstrapMigrationSource(projectDir:string,inputPath:string):Promise<BootstrapSourceResult>{
  const root=resolve(projectDir), path=resolve(inputPath);
  const safety=await verifyPathSafety(path,root);
  if(!safety.safe)return sourceFail('PATH_SAFETY','Bootstrap input must be a regular file inside the project boundary without symbolic-link or reparse-point components.');
  try{
    const info=await lstat(path);
    if(info.isSymbolicLink()||!info.isFile())return sourceFail('INVALID_SOURCE','Bootstrap input must be a regular file.');
    if(info.size>MAX_BOOTSTRAP_BYTES)return sourceFail('INPUT_TOO_LARGE','Bootstrap source exceeds 1 MiB.');
    const bytes=await readFile(path);
    let markdown:string;
    try{markdown=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return sourceFail('INVALID_UTF8','Bootstrap input must contain valid UTF-8.');}
    return{success:true,markdown,path,errors:[]};
  }catch{return sourceFail('READ_FAILED','Bootstrap input could not be read safely.');}
}

export async function migrateBootstrapClaims(
  projectDir:string,
  markdown:string,
  clock:Clock,
  hooks:MigrationOperationHooks={},
):Promise<BootstrapMigrationResult>{
  return withWriteLock(projectDir,()=>migrateBootstrapClaimsUnlocked(projectDir,markdown,clock,hooks));
}

async function migrateBootstrapClaimsUnlocked(
  projectDir:string,
  markdown:string,
  clock:Clock,
  hooks:MigrationOperationHooks={},
):Promise<BootstrapMigrationResult>{
  const scan=scanSecretLikeText([markdown]);
  if(scan.secretLike)return fail('SECRET_LIKE_CONTENT','Bootstrap source matched secret-like patterns and was not migrated.');
  if(Buffer.byteLength(markdown,'utf8')>MAX_BOOTSTRAP_BYTES)return fail('INPUT_TOO_LARGE','Bootstrap source exceeds 1 MiB.');
  const now=clock();
  if(!isIso8601(now))return fail('INVALID_TIMESTAMP','The injected clock must return ISO-8601 UTC.');

  const root=resolve(projectDir), storage=join(root,STORAGE_DIR), markerPath=join(storage,'episodes','bootstrap-migration.json');
  const tree=await verifyStorageTreeSafety(storage,root);
  if(!tree.safe)return fail('PATH_SAFETY',tree.reason??'Storage tree is unsafe.');
  const safety=await verifyPathSafety(markerPath,root);
  if(!safety.safe)return fail('PATH_SAFETY',safety.reason??'Marker path is unsafe.');

  const fingerprint=sha256(markdown);
  const markerRead=await readMarker(markerPath);
  if(!markerRead.success)return fail('INVALID_MIGRATION_MARKER',markerRead.message);
  if(markerRead.marker){
    if(markerRead.marker.sourceFingerprint!==fingerprint)return fail('MIGRATION_SOURCE_CHANGED','Bootstrap migration state belongs to different source content; inspect the marker before recovery.');
    return reconcileExistingMigration(root,markerPath,markerRead.marker,now,hooks);
  }

  const parsed=parseClaims(markdown,now);
  if(!parsed.success)return{success:false,alreadyMigrated:false,importedIds:[],auditReferences:[],errors:parsed.errors};
  const loaded=await loadAllRecords(root);
  if(loaded.errors.length)return fail('STORE_INVALID','Canonical storage is invalid.');
  const known=new Set(loaded.records.map((record)=>record.id));
  const collision=parsed.records.find((record)=>known.has(record.id));
  if(collision)return fail('DUPLICATE_ID','Memory ID '+collision.id+' already exists; no migration files were written.');

  const importedIds=parsed.records.map((record)=>record.id);
  const recordFingerprints=Object.fromEntries(parsed.records.map((record)=>[record.id,recordFingerprint(record)]));
  const prepared:Marker={schemaVersion:CURRENT_SCHEMA_VERSION,sourceFingerprint:fingerprint,status:'PREPARED',importedIds,recordFingerprints,auditReference:MIGRATION_AUDIT_ID,preparedAt:now};
  const recordsWritten:Marker={...prepared,status:'RECORDS_WRITTEN'};
  const completed:Marker={...recordsWritten,status:'COMPLETED',completedAt:now};
  const created:string[]=[];
  let phase:'PREPARE'|'RECORDS'|'AUDIT'|'COMPLETE'='PREPARE';
  try{
    await writeMarker(markerPath,prepared,false,hooks);
    phase='RECORDS';
    for(let index=0;index<parsed.records.length;index+=1){
      const record=parsed.records[index]!;
      await hooks.beforeRecordWrite?.(record,index);
      const path=join(storage,'memories','records',record.id+'.json');
      const pathSafety=await verifyPathSafety(path,root);
      if(!pathSafety.safe)throw new Error('PATH_SAFETY');
      await atomicWriteJson(path,record,{allowOverwrite:false});
      created.push(path);
    }
    await hooks.beforeIndexRebuild?.();
    const indexResult=await rebuildMemoryIndex(root,()=>now);
    if(!indexResult.success)throw new Error('INDEX_FAILED');
    await writeMarker(markerPath,recordsWritten,true,hooks);
    phase='AUDIT';
    const event=migrationAuditEvent(parsed.records.length,now);
    await hooks.beforeAuditAppend?.([event]);
    await appendValidatedAuditEvents(root,[event]);
    phase='COMPLETE';
    await writeMarker(markerPath,completed,true,hooks);
    return{success:true,alreadyMigrated:false,importedIds,auditReferences:[MIGRATION_AUDIT_ID],errors:[]};
  }catch(error:unknown){
    if(phase==='COMPLETE')return fail('RECOVERY_REQUIRED','Migration records and audit were persisted, but completion marking failed. Re-run the identical source to reconcile without duplication.');
    await rollbackMigration(root,markerPath,created,now);
    return fail('MIGRATION_FAILED',safeFailureMessage(error));
  }
}

async function reconcileExistingMigration(
  root:string,
  markerPath:string,
  marker:Marker,
  now:string,
  hooks:MigrationOperationHooks,
):Promise<BootstrapMigrationResult>{
  if(marker.status==='PREPARED')return fail('RECOVERY_REQUIRED','A prepared migration may contain an interrupted partial write. Inspect the marker and canonical store; automatic replay is blocked.');
  const consistency=await verifyImportedRecords(root,marker);
  if(!consistency.success)return fail('MIGRATION_INCONSISTENT',consistency.message);
  const auditCount=await countAuditEvent(root,marker.auditReference);
  if(auditCount<0)return fail('MIGRATION_INCONSISTENT','The audit history is malformed or unreadable; migration reconciliation was blocked.');
  if(auditCount>1)return fail('MIGRATION_INCONSISTENT','The migration audit reference occurs more than once.');
  if(marker.status==='COMPLETED'){
    if(auditCount!==1)return fail('MIGRATION_INCONSISTENT','Completed migration state does not have exactly one matching audit event.');
    return{success:true,alreadyMigrated:true,importedIds:marker.importedIds,auditReferences:[marker.auditReference],errors:[]};
  }
  try{
    if(auditCount===0){
      const event=migrationAuditEvent(marker.importedIds.length,marker.preparedAt);
      await hooks.beforeAuditAppend?.([event]);
      await appendValidatedAuditEvents(root,[event]);
    }
    const completed:Marker={...marker,status:'COMPLETED',completedAt:now};
    await writeMarker(markerPath,completed,true,hooks);
    return{success:true,alreadyMigrated:true,importedIds:marker.importedIds,auditReferences:[marker.auditReference],errors:[]};
  }catch{
    return fail('RECOVERY_REQUIRED','Migration reconciliation did not complete. Re-run the identical source after inspecting controlled state.');
  }
}

async function rollbackMigration(root:string,markerPath:string,created:readonly string[],now:string):Promise<void>{
  for(const path of [...created].reverse())try{await unlink(path);}catch{}
  try{await unlink(markerPath);}catch{}
  try{await rebuildMemoryIndex(root,()=>now);}catch{}
}

async function verifyImportedRecords(root:string,marker:Marker):Promise<{success:true}|{success:false;message:string}>{
  const loaded=await loadAllRecords(root);
  if(loaded.errors.length)return{success:false,message:'Canonical storage is invalid.'};
  const records=new Map(loaded.records.map((record)=>[record.id,record]));
  for(const id of marker.importedIds){
    const record=records.get(id);
    if(!record||recordFingerprint(record)!==marker.recordFingerprints[id])return{success:false,message:'An imported record is missing or differs from its recorded fingerprint.'};
  }
  return{success:true};
}
function parseClaims(markdown:string,now:string):{success:true;records:MemoryRecord[]}|{success:false;errors:ValidationIssue[]}{
  const headings=[...markdown.matchAll(/^## (DM-CLAIM-\d{3})\s*$/gm)];
  if(!headings.length)return{success:false,errors:[issue('','NO_CLAIMS','No canonical claim sections were found.')]};
  const headingIds=headings.map((match)=>match[1]!);
  const duplicateId=headingIds.find((id,index)=>headingIds.indexOf(id)!==index);
  if(duplicateId)return{success:false,errors:[issue(duplicateId,'DUPLICATE_ID','The bootstrap source contains a duplicate claim identifier.')]};

  const records:MemoryRecord[]=[], errors:ValidationIssue[]=[];
  for(let index=0;index<headings.length;index+=1){
    const match=headings[index]!, id=match[1]!;
    const start=(match.index??0)+match[0].length, end=headings[index+1]?.index??markdown.length;
    const fields=new Map<string,string>();
    for(const line of markdown.slice(start,end).split(/\r?\n/)){
      const trimmed=line.trim();
      if(trimmed==='')continue;
      if(trimmed==='---')break;
      const fieldMatch=line.match(/^- ([a-z_]+):\s*(.*)$/);
      if(!fieldMatch){errors.push(issue(id,'MALFORMED_LINE','A claim section contains unsupported Markdown structure.'));continue;}
      const key=fieldMatch[1]!, value=fieldMatch[2]!.trim();
      if(!ALLOWED_KEYS.has(key)){errors.push(issue(id,'UNKNOWN_FIELD','A claim contains an unknown field; raw field names were not echoed.'));continue;}
      if(fields.has(key)){errors.push(issue(id,'DUPLICATE_FIELD','A claim contains a duplicate field.'));continue;}
      fields.set(key,unquote(value));
    }
    const required=['claim','source_type','source_reference','status','confidence','last_verified','sensitivity','action_permission'];
    for(const key of required)if(!fields.get(key))errors.push(issue(id,'MISSING_REQUIRED','Claim '+id+' is missing '+key+'.'));

    const sourceType=SOURCE_MAP[fields.get('source_type')??''];
    const status=STATUS_MAP[fields.get('status')??''];
    const confidence=CONFIDENCE_MAP[fields.get('confidence')??''];
    const sensitivity=SENSITIVITY_MAP[fields.get('sensitivity')??''];
    const permission=PERMISSION_MAP[fields.get('action_permission')??''];
    if(!sourceType)errors.push(issue(id,'UNKNOWN_SOURCE_TYPE','Claim '+id+' has an unmapped source type.'));
    if(!status)errors.push(issue(id,'UNKNOWN_STATUS','Claim '+id+' has an unsupported verification status.'));
    if(!confidence)errors.push(issue(id,'UNKNOWN_CONFIDENCE','Claim '+id+' has an unsupported confidence value.'));
    if(!sensitivity)errors.push(issue(id,'UNKNOWN_SENSITIVITY','Claim '+id+' has an unsupported sensitivity value.'));
    if(!permission)errors.push(issue(id,'UNKNOWN_ACTION_PERMISSION','Claim '+id+' has an unsupported action permission.'));

    const date=fields.get('last_verified')??'';
    const timestamp=/^\d{4}-\d{2}-\d{2}$/.test(date)?date+'T00:00:00.000Z':date;
    if(!isIso8601(timestamp))errors.push(issue(id,'INVALID_LAST_VERIFIED','Claim '+id+' has an invalid verification date.'));
    const superseded=(fields.get('superseded_by')??'').split(',').map((value)=>value.trim()).filter(Boolean);
    if(superseded.some((value)=>!isSafeArtifactId(value)))errors.push(issue(id,'INVALID_RELATIONSHIP','Claim '+id+' has an unsafe supersession identifier.'));

    const record:MemoryRecord={
      scope:{kind:'PROJECT'},
      schemaVersion:CURRENT_SCHEMA_VERSION,
      id,
      kind:kindFor(status??'UNKNOWN'),
      statement:fields.get('claim')??'',
      source:{type:sourceType??'DOCUMENT_REFERENCE',reference:fields.get('source_reference')??''},
      verificationStatus:status??'UNKNOWN',
      confidence:confidence??'LOW',
      freshness:{lastVerified:timestamp||now,...(fields.get('review_after')?{reviewAfter:fields.get('review_after')!}:{})},
      sensitivity:sensitivity??'INTERNAL',
      actionPermission:permission??'MUST_NOT_ACT',
      relationships:{
        ...(superseded[0]?{supersededBy:superseded[0]}:{}),
        ...(superseded.length>1?{relatedTo:superseded.slice(1)}:{}),
      },
      tags:['bootstrap','project-memory'],
      ...(fields.get('recheck_method')?{recheckMethod:fields.get('recheck_method')!}:{}),
      ...(fields.get('notes')?{notes:fields.get('notes')!}:{}),
      createdAt:timestamp||now,
      updatedAt:timestamp||now,
    };
    const valid=validateMemoryRecord(record);
    const privacy=scanMemoryRecord(record);
    if(!valid.valid)errors.push(...valid.issues.map((entry)=>({...entry,field:id+'.'+entry.field})));
    if(privacy.secretLike)errors.push(issue(id,'SECRET_LIKE_CONTENT','Claim '+id+' contains secret-like content.'));
    records.push(record);
  }
  return errors.length?{success:false,errors}:{success:true,records};
}

function kindFor(status:VerificationStatus):MemoryKind{
  return status==='INFERRED'?'ASSUMPTION':status==='OWNER_CONFIRMED'||status==='REVOKED'?'DECISION':'OBSERVATION';
}
function unquote(value:string):string{
  const quote=String.fromCharCode(96);
  return value.startsWith(quote)&&value.endsWith(quote)?value.slice(1,-1):value;
}

async function writeMarker(path:string,marker:Marker,allowOverwrite:boolean,hooks:MigrationOperationHooks):Promise<void>{
  if(!validateBootstrapMigrationMarker(marker))throw new Error('INVALID_MARKER');
  await hooks.beforeMarkerWrite?.(marker);
  await atomicWriteJson(path,marker,{allowOverwrite});
}
async function readMarker(path:string):Promise<{success:true;marker:Marker|null}|{success:false;message:string}>{
  try{
    const info=await lstat(path);
    if(info.isSymbolicLink()||!info.isFile()||info.size>MAX_BOOTSTRAP_BYTES)return{success:false,message:'Bootstrap migration marker is not a safe regular file.'};
    const value:unknown=JSON.parse(await readFile(path,'utf8'));
    if(!validateBootstrapMigrationMarker(value))return{success:false,message:'Bootstrap migration marker failed strict validation and was preserved.'};
    return{success:true,marker:value};
  }catch(error:unknown){
    if(error instanceof Error&&'code'in error&&(error as NodeJS.ErrnoException).code==='ENOENT')return{success:true,marker:null};
    return{success:false,message:'Bootstrap migration marker could not be read or parsed safely and was preserved.'};
  }
}
export function validateBootstrapMigrationMarker(value:unknown):value is Marker{
  if(!isObject(value))return false;
  const allowed=new Set(['schemaVersion','sourceFingerprint','status','importedIds','recordFingerprints','auditReference','preparedAt','completedAt']);
  if(Object.keys(value).some((key)=>!allowed.has(key)))return false;
  if(value['schemaVersion']!==CURRENT_SCHEMA_VERSION||typeof value['sourceFingerprint']!=='string'||!/^[a-f0-9]{64}$/.test(value['sourceFingerprint']))return false;
  if(value['status']!=='PREPARED'&&value['status']!=='RECORDS_WRITTEN'&&value['status']!=='COMPLETED')return false;
  if(!Array.isArray(value['importedIds'])||value['importedIds'].length===0||!value['importedIds'].every(isSafeArtifactId)||new Set(value['importedIds']).size!==value['importedIds'].length)return false;
  if(!isObject(value['recordFingerprints']))return false;
  const fingerprintKeys=Object.keys(value['recordFingerprints']).sort(compareOrdinal);
  const ids=[...value['importedIds']].sort(compareOrdinal);
  if(fingerprintKeys.length!==ids.length||fingerprintKeys.some((key,index)=>key!==ids[index]))return false;
  if(!Object.values(value['recordFingerprints']).every((item)=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item)))return false;
  if(!isSafeArtifactId(value['auditReference'])||!isIso8601(value['preparedAt']))return false;
  if(value['status']==='COMPLETED'){
    if(!isIso8601(value['completedAt'])||Date.parse(value['completedAt'])<Date.parse(value['preparedAt']))return false;
  }else if(value['completedAt']!==undefined)return false;
  return true;
}

async function countAuditEvent(root:string,eventId:string):Promise<number>{
  try{
    const raw=await readFile(join(root,STORAGE_DIR,'audits','history.jsonl'),'utf8');
    let count=0;
    for(const line of raw.split(/\r?\n/).filter(Boolean)){
      const value:unknown=JSON.parse(line);
      if(!isObject(value)||typeof value['eventId']!=='string')return -1;
      if(value['eventId']===eventId)count+=1;
    }
    return count;
  }catch{return -1;}
}
function migrationAuditEvent(recordCount:number,timestamp:string):AuditEvent{
  return{
    schemaVersion:CURRENT_SCHEMA_VERSION,
    eventId:MIGRATION_AUDIT_ID,
    timestamp,
    memoryId:'bootstrap-migration',
    outcome:'RECHECK',
    triggeredRules:['DM-RULE-MIGRATE-001'],
    evidenceExamined:[],
    explanation:'Imported '+recordCount+' validated records from the preserved bootstrap ledger.',
    permissionConsequence:'Imported authority and action permissions remain unchanged and subject to normal audit.',
    recommendedAction:'Audit imported records before reliance.',
    auditor:ENGINE_AUDITOR,
    engineVersion:ENGINE_VERSION,
  };
}
function recordFingerprint(record:MemoryRecord):string{return sha256(stableStringify(record));}
function sha256(value:string):string{return createHash('sha256').update(value,'utf8').digest('hex');}
function stableStringify(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
  if(value&&typeof value==='object'){
    const object=value as Record<string,unknown>;
    return '{'+Object.keys(object).sort(compareOrdinal).map((key)=>JSON.stringify(key)+':'+stableStringify(object[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}
function safeFailureMessage(error:unknown):string{
  if(error instanceof Error&&(error.message==='PATH_SAFETY'||error.message==='INDEX_FAILED'||error.message==='INVALID_MARKER'))return 'Migration stopped at a controlled persistence boundary: '+error.message+'.';
  return 'Migration stopped at a controlled persistence boundary; partial record writes were rolled back.';
}
function isObject(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function sourceFail(code:string,message:string):BootstrapSourceResult{return{success:false,markdown:null,path:null,errors:[issue('',code,message)]};}
function fail(code:string,message:string):BootstrapMigrationResult{return{success:false,alreadyMigrated:false,importedIds:[],auditReferences:[],errors:[issue('',code,message)]};}
function issue(field:string,code:string,message:string):ValidationIssue{return{field,code,message};}
function compareOrdinal(left:string,right:string):number{return left<right?-1:left>right?1:0;}