import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, readdir, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { beginLifecycle, finalizeLifecycle, formatLifecycleBeginAsMarkdown, formatLifecycleFinalizeAsMarkdown } from '../src/core/lifecycle.js';
import { loadBootstrapMigrationSource, migrateBootstrapClaims } from '../src/core/migration.js';
import { storeEvidenceRecord } from '../src/core/evidence.js';
import { initGptbrain, loadAllRecords } from '../src/core/store.js';
import { CURRENT_SCHEMA_VERSION, fixedClock, type EvidenceRecord, type LifecycleFinalizationInput, type MemoryRecord, type UpdateCandidate } from '../src/core/types.js';
import { validateLifecycleFinalizationInput, validateLifecycleMetadata } from '../src/core/validation.js';

const T1='2026-07-22T12:00:00.000Z', T2='2026-07-22T13:00:00.000Z';
const clock1=fixedClock(T1), clock2=fixedClock(T2);
function record(id:string, overrides:Partial<MemoryRecord>={}):MemoryRecord{return{schemaVersion:CURRENT_SCHEMA_VERSION,id,kind:'OBSERVATION',statement:'A local lifecycle observation.',source:{type:'AGENT_INFERENCE',reference:'controlled lifecycle proposal',agent:'phase4-agent'},verificationStatus:'UNKNOWN',confidence:'LOW',freshness:{lastVerified:T1},sensitivity:'INTERNAL',actionPermission:'ACT_WITH_CAUTION',relationships:{},tags:['lifecycle'],recheckMethod:'Inspect canonical local state.',createdAt:T1,updatedAt:T1,...overrides};}
function candidate(id:string, overrides:Partial<UpdateCandidate>={}):UpdateCandidate{return{schemaVersion:CURRENT_SCHEMA_VERSION,action:'CREATE',proposedRecord:record(id),evidence:[],proposedBy:'phase4-agent',authorityLevel:'INFERRED',requiresOwnerApproval:false,reason:'Record a bounded non-authoritative lifecycle observation.',timestamp:T1,...overrides};}
function finalization(id:string, updates:readonly UpdateCandidate[]):LifecycleFinalizationInput{return{schemaVersion:CURRENT_SCHEMA_VERSION,lifecycleId:id,proposer:{type:'AGENT',id:'phase4-agent'},proposedUpdates:updates,reason:'Finalize controlled work.'};}
async function begin(dir:string,id='lc-phase4-test'){return beginLifecycle(dir,'implement retrieval lifecycle behavior',clock1,()=>id,{maxTokens:400});}

let projectDir:string;
beforeEach(async()=>{projectDir=await mkdtemp(join(tmpdir(),'doubtful-memory-p4-'));const result=await initGptbrain(projectDir,clock1);assert.equal(result.success,true);});
afterEach(async()=>{await rm(projectDir,{recursive:true,force:true});});

describe('Phase 4 lifecycle begin',()=>{
  it('returns context but persists only privacy-safe metadata',async()=>{const result=await begin(projectDir);assert.equal(result.success,true);assert.equal(result.status,'OPEN');const path=join(projectDir,'.gptbrain','episodes','lc-phase4-test.json');const raw=await readFile(path,'utf8');assert.doesNotMatch(raw,/implement retrieval lifecycle behavior/);assert.doesNotMatch(raw,/taskDescription|statement/);assert.equal(validateLifecycleMetadata(JSON.parse(raw)).valid,true);});
  it('rejects secret-like task input before creating metadata or audit',async()=>{const history=await readFile(join(projectDir,'.gptbrain','audits','history.jsonl'),'utf8');const result=await beginLifecycle(projectDir,'token ghp_abcdefghijklmnopqrstuvwxyz123456',clock1,()=> 'lc-secret');assert.equal(result.success,false);assert.equal(result.errors[0]?.code,'SECRET_LIKE_CONTENT');assert.equal(await readFile(join(projectDir,'.gptbrain','audits','history.jsonl'),'utf8'),history);assert.equal((await readdir(join(projectDir,'.gptbrain','episodes'))).length,0);});
  it('enforces generated ID safety and duplicate IDs',async()=>{assert.equal((await beginLifecycle(projectDir,'safe task',clock1,()=> '../bad')).errors[0]?.code,'UNSAFE_ID');assert.equal((await begin(projectDir,'lc-duplicate')).success,true);assert.equal((await begin(projectDir,'lc-duplicate')).errors[0]?.code,'DUPLICATE_ID');});
  it('is deterministic with injected clocks and IDs and supports simultaneous open lifecycles',async()=>{const a=await begin(projectDir,'lc-open-a');const b=await begin(projectDir,'lc-open-b');assert.equal(a.openedAt,T1);assert.equal(a.lifecycleId,'lc-open-a');assert.equal(b.lifecycleId,'lc-open-b');assert.deepEqual((await readdir(join(projectDir,'.gptbrain','episodes'))).sort(),['lc-open-a.json','lc-open-b.json']);});
  it('formats safe begin output as Markdown and JSON-compatible data',async()=>{const result=await begin(projectDir,'lc-format');const markdown=formatLifecycleBeginAsMarkdown(result);assert.match(markdown,/Lifecycle lc-format/);assert.match(markdown,/Budget/);assert.equal(JSON.parse(JSON.stringify(result)).lifecycleId,'lc-format');});  it('enforces the hard context budget without persisting a pack',async()=>{const result=await beginLifecycle(projectDir,'unrelated task',clock1,()=> 'lc-budget',{maxTokens:1});assert.equal(result.success,true);assert.equal(result.contextPack?.budget.maxTokens,1);assert.equal(result.contextPack?.budget.compliant,true);assert.equal(result.contextPack?.selected.length,0);});
});

describe('Phase 4 lifecycle finalization',()=>{
  it('applies an authorized proposal through canonical mutation storage',async()=>{await begin(projectDir);const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[candidate('DM-MEM-P4-001')]),clock2);assert.equal(result.success,true);assert.equal(result.status,'COMPLETED');assert.equal(result.dispositions[0]?.disposition,'APPLIED');assert.equal(result.storageChanged,true);assert.ok((await loadAllRecords(projectDir)).records.some(r=>r.id==='DM-MEM-P4-001'));});
  it('is idempotent for identical completed input and rejects different replay',async()=>{await begin(projectDir);const input=finalization('lc-phase4-test',[candidate('DM-MEM-P4-IDEM')]);assert.equal((await finalizeLifecycle(projectDir,input,clock2)).success,true);const replay=await finalizeLifecycle(projectDir,input,clock2);assert.equal(replay.success,true);assert.equal(replay.alreadyFinalized,true);const changed={...input,reason:'Different finalization.'};assert.equal((await finalizeLifecycle(projectDir,changed,clock2)).errors[0]?.code,'ALREADY_FINALIZED');assert.equal((await loadAllRecords(projectDir)).records.filter(r=>r.id==='DM-MEM-P4-IDEM').length,1);});
  it('completes an empty proposal set without storage changes',async()=>{await begin(projectDir);const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[]),clock2);assert.equal(result.status,'COMPLETED');assert.equal(result.storageChanged,false);assert.deepEqual(result.dispositions,[]);});
  it('holds owner-policy proposals instead of applying them',async()=>{await begin(projectDir);const proposal=candidate('DM-MEM-P4-OWNER',{requiresOwnerApproval:true,reason:'Change project architecture scope.'});const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[proposal]),clock2);assert.equal(result.status,'COMPLETED_WITH_HELD_ITEMS');assert.equal(result.dispositions[0]?.disposition,'HELD_FOR_OWNER');assert.equal(result.storageChanged,false);assert.ok(!(await loadAllRecords(projectDir)).records.some(r=>r.id==='DM-MEM-P4-OWNER'));});
  it('rejects missing evidence and preserves other independent dispositions',async()=>{await begin(projectDir);const missing=candidate('DM-MEM-P4-MISSING',{evidence:['DM-EV-MISSING']});const good=candidate('DM-MEM-P4-GOOD');const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[missing,good]),clock2);assert.equal(result.success,true);assert.deepEqual(result.dispositions.map(x=>x.disposition),['REJECTED','APPLIED']);assert.ok((await loadAllRecords(projectDir)).records.some(r=>r.id==='DM-MEM-P4-GOOD'));});
  it('rejects secret-like finalization before journal mutation',async()=>{await begin(projectDir);const input={...finalization('lc-phase4-test',[]),reason:'ghp_abcdefghijklmnopqrstuvwxyz123456'};const result=await finalizeLifecycle(projectDir,input,clock2);assert.equal(result.errors[0]?.code,'SECRET_LIKE_CONTENT');const metadata=JSON.parse(await readFile(join(projectDir,'.gptbrain','episodes','lc-phase4-test.json'),'utf8')) as {status:string};assert.equal(metadata.status,'OPEN');});
  it('blocks automatic replay of an interrupted FINALIZING journal',async()=>{await begin(projectDir);const path=join(projectDir,'.gptbrain','episodes','lc-phase4-test.json');const metadata=JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>;metadata['status']='FINALIZING';metadata['updatedAt']=T2;metadata['finalization']={fingerprint:'a'.repeat(64),proposer:{type:'AGENT',id:'phase4-agent'},startedAt:T2,dispositions:[]};await writeFile(path,JSON.stringify(metadata,null,2)+'\n');const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[]),clock2);assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');});
  it('rejects unknown fields without echoing their names',()=>{const input={...finalization('lc-x',[]),'ghp_private_field':'value'};const result=validateLifecycleFinalizationInput(input);assert.equal(result.valid,false);assert.ok(result.issues.some(x=>x.code==='UNKNOWN_FIELD'));assert.ok(result.issues.every(x=>!x.field.includes('ghp_private_field')&&!x.message.includes('ghp_private_field')));});
  it('rejects ambiguous same-target proposals before any mutation',async()=>{await begin(projectDir);const a=candidate('DM-MEM-P4-DUP');const b={...candidate('DM-MEM-P4-DUP'),reason:'Second proposal.'};const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[a,b]),clock2);assert.equal(result.success,false);assert.ok(result.errors.some(x=>x.code==='AMBIGUOUS_TARGET'));assert.ok(!(await loadAllRecords(projectDir)).records.some(r=>r.id==='DM-MEM-P4-DUP'));});
  it('classifies applied, held, rejected, and no-change proposals in one plan',async()=>{await begin(projectDir);const records=await loadAllRecords(projectDir);const bootstrap=records.records.find(r=>r.id==='DM-MEM-000001')!;const unchanged:UpdateCandidate={schemaVersion:CURRENT_SCHEMA_VERSION,action:'UPDATE',memoryId:bootstrap.id,proposedRecord:bootstrap,evidence:[],proposedBy:'phase4-agent',authorityLevel:'OBSERVED',requiresOwnerApproval:false,reason:'No material change.',timestamp:T1};const heldProposal=candidate('DM-MEM-P4-MIX-HOLD',{requiresOwnerApproval:true});const rejectedProposal=candidate('DM-MEM-P4-MIX-REJECT',{evidence:['missing-evidence']});const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[candidate('DM-MEM-P4-MIX-APPLY'),heldProposal,rejectedProposal,unchanged]),clock2);assert.deepEqual(result.dispositions.map(x=>x.disposition),['APPLIED','HELD_FOR_OWNER','REJECTED','NO_CHANGE']);assert.equal(result.status,'COMPLETED_WITH_HELD_ITEMS');});
  it('rejects stale optimistic-concurrency input without changing the target',async()=>{await begin(projectDir);const bootstrap=(await loadAllRecords(projectDir)).records.find(r=>r.id==='DM-MEM-000001')!;const stale={...bootstrap,statement:'stale change',updatedAt:'2026-07-21T00:00:00.000Z'};const proposal:UpdateCandidate={schemaVersion:CURRENT_SCHEMA_VERSION,action:'UPDATE',memoryId:bootstrap.id,proposedRecord:stale,evidence:[],proposedBy:'phase4-agent',authorityLevel:'OBSERVED',requiresOwnerApproval:false,reason:'Try stale update.',timestamp:T1};const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[proposal]),clock2);assert.equal(result.dispositions[0]?.reasonCode,'STALE_UPDATE');assert.equal((await loadAllRecords(projectDir)).records.find(r=>r.id===bootstrap.id)?.statement,bootstrap.statement);});
  it('holds repository-evidenced owner policy rather than treating repository state as approval',async()=>{await begin(projectDir);const bootstrap=(await loadAllRecords(projectDir)).records.find(r=>r.id==='DM-MEM-000001')!;const ev:EvidenceRecord={schemaVersion:CURRENT_SCHEMA_VERSION,id:'DM-EV-P4-REPO',type:'REPOSITORY_STATE',source:'docs/ARCHITECTURE.md',content:'Repository contains this implementation.',relationship:'SUPPORTS',memoryIds:[bootstrap.id],collectedAt:T1,collectedBy:'phase4-agent'};assert.equal((await storeEvidenceRecord(projectDir,ev)).success,true);const proposed={...bootstrap,statement:'Change architecture scope.',source:{type:'REPOSITORY_STATE' as const,reference:'docs/ARCHITECTURE.md'},verificationStatus:'REPO_VERIFIED' as const};const proposal:UpdateCandidate={schemaVersion:CURRENT_SCHEMA_VERSION,action:'UPDATE',memoryId:bootstrap.id,proposedRecord:proposed,evidence:[ev.id],proposedBy:'phase4-agent',authorityLevel:'REPO_VERIFIED',requiresOwnerApproval:false,reason:'Repository evidence for architecture scope.',timestamp:T1};const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[proposal]),clock2);assert.equal(result.dispositions[0]?.disposition,'HELD_FOR_OWNER');});
  it('rejects engine-generated material as independent observed evidence',async()=>{await begin(projectDir);const bootstrap=(await loadAllRecords(projectDir)).records.find(r=>r.id==='DM-MEM-000001')!;const ev:EvidenceRecord={schemaVersion:CURRENT_SCHEMA_VERSION,id:'DM-EV-P4-GENERATED',type:'AGENT_OBSERVATION',source:'generated context pack',content:'Generated summary from lifecycle result.',relationship:'SUPPORTS',memoryIds:[bootstrap.id],collectedAt:T1,collectedBy:'phase4-agent'};assert.equal((await storeEvidenceRecord(projectDir,ev)).success,true);const proposed={...bootstrap,statement:'Generated observation.',source:{type:'AGENT_OBSERVATION' as const,reference:'generated context pack'},verificationStatus:'OBSERVED' as const};const proposal:UpdateCandidate={schemaVersion:CURRENT_SCHEMA_VERSION,action:'UPDATE',memoryId:bootstrap.id,proposedRecord:proposed,evidence:[ev.id],proposedBy:'phase4-agent',authorityLevel:'OBSERVED',requiresOwnerApproval:false,reason:'Generated evidence must not authorize.',timestamp:T1};const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[proposal]),clock2);assert.equal(result.dispositions[0]?.disposition,'REJECTED');assert.equal(result.dispositions[0]?.reasonCode,'INSUFFICIENT_AUTHORITY');});
  it('fails safely for missing and malformed lifecycle artifacts',async()=>{assert.equal((await finalizeLifecycle(projectDir,finalization('lc-missing',[]),clock2)).errors[0]?.code,'NOT_FOUND');await begin(projectDir);const path=join(projectDir,'.gptbrain','episodes','lc-phase4-test.json');await writeFile(path,'{"schemaVersion":"9.9.9"}\n');const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[]),clock2);assert.equal(result.errors[0]?.code,'INVALID_ARTIFACT');assert.equal(await readFile(path,'utf8'),'{"schemaVersion":"9.9.9"}\n');});
  it('rejects unsupported finalization schema while preserving OPEN bytes',async()=>{await begin(projectDir);const path=join(projectDir,'.gptbrain','episodes','lc-phase4-test.json');const before=await readFile(path);const input={...finalization('lc-phase4-test',[]),schemaVersion:'9.9.9'};const result=await finalizeLifecycle(projectDir,input,clock2);assert.equal(result.success,false);assert.equal(result.errors[0]?.code,'UNSUPPORTED_SCHEMA');assert.deepEqual(await readFile(path),before);});
  it('formats terminal results without exposing proposal records',async()=>{await begin(projectDir);const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[candidate('DM-MEM-P4-FORMAT')]),clock2);const markdown=formatLifecycleFinalizeAsMarkdown(result);assert.match(markdown,/APPLIED/);assert.doesNotMatch(markdown,/A local lifecycle observation/);});  it('gives privacy rejection precedence over ordinary automatic application',async()=>{await begin(projectDir);const raw=record('DM-MEM-P4-PRIVATE',{sensitivity:'SECRET',statement:'raw private material',source:{type:'AGENT_INFERENCE',reference:'raw private material'},actionPermission:'FORGET_OR_REDACT'});const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[candidate(raw.id,{proposedRecord:raw})]),clock2);assert.equal(result.dispositions[0]?.reasonCode,'PRIVACY_REDACTION');assert.equal(result.storageChanged,false);});
});

describe('Phase 4 bootstrap migration',()=>{
  const markdown='# Memory Claims\n\n## DM-CLAIM-901\n\n- claim: A preserved local fact.\n- source_type: Repository inspection\n- source_reference: `package.json`\n- status: REPO_VERIFIED\n- confidence: HIGH\n- last_verified: 2026-07-22\n- sensitivity: INTERNAL\n- action_permission: MAY_ACT\n- recheck_method: Inspect package.json.\n';
  it('imports valid claims once, preserves source text, and is idempotent',async()=>{const first=await migrateBootstrapClaims(projectDir,markdown,clock2);assert.equal(first.success,true);assert.deepEqual(first.importedIds,['DM-CLAIM-901']);const second=await migrateBootstrapClaims(projectDir,markdown,clock2);assert.equal(second.success,true);assert.equal(second.alreadyMigrated,true);assert.equal((await loadAllRecords(projectDir)).records.filter(r=>r.id==='DM-CLAIM-901').length,1);});
  it('rejects changed source after completion',async()=>{assert.equal((await migrateBootstrapClaims(projectDir,markdown,clock2)).success,true);const result=await migrateBootstrapClaims(projectDir,markdown+'\n',clock2);assert.equal(result.errors[0]?.code,'MIGRATION_SOURCE_CHANGED');});
  it('rejects ambiguous or unmapped Markdown before writing records',async()=>{const bad=markdown.replace('Repository inspection','Unknown source').replace('- claim:','- mystery:');const result=await migrateBootstrapClaims(projectDir,bad,clock2);assert.equal(result.success,false);assert.ok(!(await loadAllRecords(projectDir)).records.some(r=>r.id==='DM-CLAIM-901'));});
});
function reverseObjectKeys(value:unknown):unknown{
  if(Array.isArray(value))return value.map(reverseObjectKeys);
  if(value&&typeof value==='object'){
    const result:Record<string,unknown>={};
    for(const key of Object.keys(value as Record<string,unknown>).reverse())result[key]=reverseObjectKeys((value as Record<string,unknown>)[key]);
    return result;
  }
  return value;
}
async function controlledText(root:string):Promise<string>{
  const chunks:string[]=[];
  async function visit(path:string):Promise<void>{
    for(const entry of await readdir(path,{withFileTypes:true})){
      const child=join(path,entry.name);
      if(entry.isDirectory())await visit(child);
      else if(entry.isFile())chunks.push(await readFile(child,'utf8'));
    }
  }
  await visit(join(root,'.gptbrain'));
  return chunks.join('\n');
}
async function migrationAuditCount(root:string):Promise<number>{
  const raw=await readFile(join(root,'.gptbrain','audits','history.jsonl'),'utf8');
  return raw.split(/\r?\n/).filter(Boolean).map((line)=>JSON.parse(line) as {eventId:string}).filter((event)=>event.eventId==='evt-bootstrap-migration').length;
}
function secondClaim(source:string):string{
  return source+'\n## DM-CLAIM-902\n\n- claim: A second preserved local fact.\n- source_type: Repository inspection\n- source_reference: package.json\n- status: REPO_VERIFIED\n- confidence: MEDIUM\n- last_verified: 2026-07-22\n- sensitivity: INTERNAL\n- action_permission: ACT_WITH_CAUTION\n';
}

describe('Phase 4 owner-verification lifecycle invariants',()=>{
  it('normalizes object-key order in the finalization fingerprint without duplicating effects',async()=>{
    await begin(projectDir);
    const input=finalization('lc-phase4-test',[candidate('DM-MEM-P4-KEYORDER')]);
    assert.equal((await finalizeLifecycle(projectDir,input,clock2)).success,true);
    const replay=await finalizeLifecycle(projectDir,reverseObjectKeys(input),clock2);
    assert.equal(replay.success,true);
    assert.equal(replay.alreadyFinalized,true);
    assert.equal((await loadAllRecords(projectDir)).records.filter((item)=>item.id==='DM-MEM-P4-KEYORDER').length,1);
  });

  it('rejects out-of-order lifecycle timestamps and mismatched disposition indices',async()=>{
    await begin(projectDir);
    const path=join(projectDir,'.gptbrain','episodes','lc-phase4-test.json');
    const open=JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>;
    assert.equal(validateLifecycleMetadata({...open,updatedAt:'2026-07-22T11:00:00.000Z'}).valid,false);
    assert.equal(validateLifecycleMetadata({...open,unexpected:true}).valid,false);
    const finalizing={...open,status:'FINALIZING',updatedAt:T2,finalization:{fingerprint:'a'.repeat(64),proposer:{type:'AGENT',id:'phase4-agent'},startedAt:T2,dispositions:[{proposalIndex:1,action:'CREATE',memoryId:'DM-MEM-X',disposition:'REJECTED',reasonCode:'INVALID_CANDIDATE',explanation:'Safe.',triggeredRules:['rule'],storageChanged:false,auditReferences:[],recommendedAction:'Review.'}]}};
    assert.equal(validateLifecycleMetadata(finalizing).valid,false);
  });

  it('rejects lifecycle metadata whose identity does not match its controlled filename',async()=>{
    await begin(projectDir);
    const path=join(projectDir,'.gptbrain','episodes','lc-phase4-test.json');
    const metadata=JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>;
    metadata['lifecycleId']='lc-other-safe';
    await writeFile(path,JSON.stringify(metadata,null,2)+'\n');
    const before=await readFile(path);
    const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[]),clock2);
    assert.equal(result.errors[0]?.code,'INVALID_ARTIFACT');
    assert.deepEqual(await readFile(path),before);
  });

  it('records a fail-safe FAILED journal when interrupted before the first mutation',async()=>{
    await begin(projectDir);
    const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[candidate('DM-MEM-P4-BEFORE')]),clock2,{beforeMutation:()=>{throw new Error('injected');}});
    assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');
    assert.ok(!(await loadAllRecords(projectDir)).records.some((item)=>item.id==='DM-MEM-P4-BEFORE'));
    const metadata=JSON.parse(await readFile(join(projectDir,'.gptbrain','episodes','lc-phase4-test.json'),'utf8')) as {status:string;failureCode:string};
    assert.equal(metadata.status,'FAILED');
    assert.equal(metadata.failureCode,'MUTATION_FAILED');
  });

  it('accounts for an applied mutation when its progress-journal write fails and blocks replay',async()=>{
    await begin(projectDir);
    let writes=0;
    const input=finalization('lc-phase4-test',[candidate('DM-MEM-P4-JOURNAL')]);
    const result=await finalizeLifecycle(projectDir,input,clock2,{beforeMetadataWrite:(metadata)=>{if(metadata.status==='FINALIZING'&&++writes===2)throw new Error('injected');}});
    assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');
    assert.equal((await loadAllRecords(projectDir)).records.filter((item)=>item.id==='DM-MEM-P4-JOURNAL').length,1);
    const metadata=JSON.parse(await readFile(join(projectDir,'.gptbrain','episodes','lc-phase4-test.json'),'utf8')) as {status:string;finalization:{dispositions:{storageChanged:boolean}[]}};
    assert.equal(metadata.status,'FAILED');
    assert.equal(metadata.finalization.dispositions[0]?.storageChanged,true);
    assert.equal((await finalizeLifecycle(projectDir,input,clock2)).errors[0]?.code,'FAILED_LIFECYCLE');
    assert.equal((await loadAllRecords(projectDir)).records.filter((item)=>item.id==='DM-MEM-P4-JOURNAL').length,1);
  });

  it('fails closed when finalization audit persistence is interrupted',async()=>{
    await begin(projectDir);
    const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[candidate('DM-MEM-P4-AUDITFAIL')]),clock2,{beforeAuditAppend:()=>{throw new Error('injected');}});
    assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');
    const metadata=JSON.parse(await readFile(join(projectDir,'.gptbrain','episodes','lc-phase4-test.json'),'utf8')) as {status:string;failureCode:string};
    assert.equal(metadata.status,'FAILED');
    assert.equal(metadata.failureCode,'FINALIZE_AUDIT_FAILED');
    assert.equal((await readFile(join(projectDir,'.gptbrain','audits','history.jsonl'),'utf8')).includes('DM-RULE-LIFE-FINALIZE-001'),false);
  });

  it('retains the final audit reference when terminal-journal persistence is interrupted',async()=>{
    await begin(projectDir);
    const input=finalization('lc-phase4-test',[candidate('DM-MEM-P4-TERMINAL')]);
    const result=await finalizeLifecycle(projectDir,input,clock2,{beforeMetadataWrite:(metadata)=>{if(metadata.status==='COMPLETED')throw new Error('injected');}});
    assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');
    const metadata=JSON.parse(await readFile(join(projectDir,'.gptbrain','episodes','lc-phase4-test.json'),'utf8')) as {status:string;failureCode:string;auditReferences:string[]};
    assert.equal(metadata.status,'FAILED');
    assert.equal(metadata.failureCode,'TERMINAL_JOURNAL_FAILED');
    const finalAudit=metadata.auditReferences.find((id)=>id.endsWith('-finalize'));
    assert.ok(finalAudit);
    const history=await readFile(join(projectDir,'.gptbrain','audits','history.jsonl'),'utf8');
    assert.equal(history.split(/\r?\n/).filter((line)=>line.includes(finalAudit!)).length,1);
    assert.equal((await finalizeLifecycle(projectDir,input,clock2)).errors[0]?.code,'FAILED_LIFECYCLE');
  });

  it('does not persist held proposal content in state, audit, archive, or result output',async()=>{
    await begin(projectDir);
    const marker='private-held-proposal-marker-7741';
    const proposed=candidate('DM-MEM-P4-HELD-LEAK',{requiresOwnerApproval:true,proposedRecord:record('DM-MEM-P4-HELD-LEAK',{statement:marker})});
    const result=await finalizeLifecycle(projectDir,finalization('lc-phase4-test',[proposed]),clock2);
    assert.equal(result.dispositions[0]?.disposition,'HELD_FOR_OWNER');
    assert.equal(JSON.stringify(result).includes(marker),false);
    assert.equal((await controlledText(projectDir)).includes(marker),false);
  });
});

describe('Phase 4 owner-verification migration invariants',()=>{
  const source='# Memory Claims\n\n## DM-CLAIM-901\n\n- claim: A preserved local fact.\n- source_type: Repository inspection\n- source_reference: package.json\n- status: REPO_VERIFIED\n- confidence: HIGH\n- last_verified: 2026-07-22\n- sensitivity: INTERNAL\n- action_permission: MAY_ACT\n';

  it('rejects a malformed middle claim and duplicate identifiers before any record write',async()=>{
    const malformed=source+'\n## DM-CLAIM-902\n\nunsupported prose\n'+secondClaim(source).replace(source,'');
    const bad=await migrateBootstrapClaims(projectDir,malformed,clock2);
    assert.equal(bad.success,false);
    assert.equal((await loadAllRecords(projectDir)).records.some((item)=>item.id.startsWith('DM-CLAIM-9')),false);
    const duplicate=await migrateBootstrapClaims(projectDir,source+source,clock2);
    assert.equal(duplicate.errors[0]?.code,'DUPLICATE_ID');
    assert.equal((await loadAllRecords(projectDir)).records.some((item)=>item.id==='DM-CLAIM-901'),false);
  });

  it('rolls back all records, marker state, and index after an injected record failure',async()=>{
    const result=await migrateBootstrapClaims(projectDir,secondClaim(source),clock2,{beforeRecordWrite:(_record,index)=>{if(index===1)throw new Error('injected');}});
    assert.equal(result.success,false);
    assert.equal((await loadAllRecords(projectDir)).records.some((item)=>item.id.startsWith('DM-CLAIM-9')),false);
    await assert.rejects(readFile(join(projectDir,'.gptbrain','episodes','bootstrap-migration.json'),'utf8'));
  });

  it('rolls back imported records when migration audit persistence fails',async()=>{
    const result=await migrateBootstrapClaims(projectDir,source,clock2,{beforeAuditAppend:()=>{throw new Error('injected');}});
    assert.equal(result.success,false);
    assert.equal((await loadAllRecords(projectDir)).records.some((item)=>item.id==='DM-CLAIM-901'),false);
    assert.equal(await migrationAuditCount(projectDir),0);
  });

  it('reconciles a failed completion marker without duplicating records or audit events',async()=>{
    const interrupted=await migrateBootstrapClaims(projectDir,source,clock2,{beforeMarkerWrite:(marker)=>{if(marker.status==='COMPLETED')throw new Error('injected');}});
    assert.equal(interrupted.errors[0]?.code,'RECOVERY_REQUIRED');
    assert.equal(await migrationAuditCount(projectDir),1);
    const replay=await migrateBootstrapClaims(projectDir,source,clock2);
    assert.equal(replay.success,true);
    assert.equal(replay.alreadyMigrated,true);
    assert.equal((await loadAllRecords(projectDir)).records.filter((item)=>item.id==='DM-CLAIM-901').length,1);
    assert.equal(await migrationAuditCount(projectDir),1);
  });

  it('blocks reconciliation when audit history is malformed',async()=>{
    const interrupted=await migrateBootstrapClaims(projectDir,source,clock2,{beforeMarkerWrite:(marker)=>{if(marker.status==='COMPLETED')throw new Error('injected');}});
    assert.equal(interrupted.errors[0]?.code,'RECOVERY_REQUIRED');
    const historyPath=join(projectDir,'.gptbrain','audits','history.jsonl');
    await writeFile(historyPath,'not-json'+String.fromCharCode(10));
    const before=await readFile(join(projectDir,'.gptbrain','episodes','bootstrap-migration.json'));
    const replay=await migrateBootstrapClaims(projectDir,source,clock2);
    assert.equal(replay.errors[0]?.code,'MIGRATION_INCONSISTENT');
    assert.deepEqual(await readFile(join(projectDir,'.gptbrain','episodes','bootstrap-migration.json')),before);
  });

  it('rejects an invalid marker as a controlled artifact without overwriting it',async()=>{
    const markerPath=join(projectDir,'.gptbrain','episodes','bootstrap-migration.json');
    await writeFile(markerPath,'{\"unexpected\":true}\n');
    const before=await readFile(markerPath);
    const result=await migrateBootstrapClaims(projectDir,source,clock2);
    assert.equal(result.errors[0]?.code,'INVALID_MIGRATION_MARKER');
    assert.deepEqual(await readFile(markerPath),before);
  });

  it('detects an existing-record collision before creating migration state',async()=>{
    assert.equal((await migrateBootstrapClaims(projectDir,source,clock2)).success,true);
    const recordPath=join(projectDir,'.gptbrain','memories','records','DM-CLAIM-901.json');
    const before=await readFile(recordPath);
    await rm(join(projectDir,'.gptbrain','episodes','bootstrap-migration.json'));
    const result=await migrateBootstrapClaims(projectDir,source,clock2);
    assert.equal(result.errors[0]?.code,'DUPLICATE_ID');
    assert.deepEqual(await readFile(recordPath),before);
  });

  it('rejects outside-project and symbolic-link bootstrap sources',async(t)=>{
    const outsideDir=await mkdtemp(join(tmpdir(),'doubtful-memory-p4-outside-'));
    try{
      const outside=join(outsideDir,'claims.md');
      await writeFile(outside,source);
      assert.equal((await loadBootstrapMigrationSource(projectDir,outside)).errors[0]?.code,'PATH_SAFETY');
      const memoryDir=join(projectDir,'memory');
      await mkdir(memoryDir,{recursive:true});
      const link=join(memoryDir,'linked-claims.md');
      try{await symlink(outside,link,'file');}catch(error:unknown){
        if(error instanceof Error&&'code'in error&&['EPERM','EACCES'].includes(String((error as NodeJS.ErrnoException).code))){t.skip('Symbolic-link creation is unavailable in this Windows environment.');return;}
        throw error;
      }
      assert.equal((await loadBootstrapMigrationSource(projectDir,link)).errors[0]?.code,'PATH_SAFETY');
    }finally{await rm(outsideDir,{recursive:true,force:true});}
  });

  it('loads valid UTF-8 source bytes from a safe in-project regular file without modifying them',async()=>{
    const memoryDir=join(projectDir,'memory');
    await mkdir(memoryDir,{recursive:true});
    const path=join(memoryDir,'claims.md');
    await writeFile(path,source,'utf8');
    const before=await readFile(path);
    const loaded=await loadBootstrapMigrationSource(projectDir,path);
    assert.equal(loaded.success,true);
    assert.equal(loaded.markdown,source);
    assert.deepEqual(await readFile(path),before);
  });
});