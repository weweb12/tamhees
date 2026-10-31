import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { beginLifecycle, finalizeLifecycle } from '../src/core/lifecycle.js';
import { initTamhees, loadAllRecords } from '../src/core/store.js';
import { loadAllEvidence, storeEvidenceRecord } from '../src/core/evidence.js';
import { applyUpdateCandidate } from '../src/core/mutations.js';
import { compileContext } from '../src/core/context.js';
import { auditRecord } from '../src/core/audit.js';
import { normalizeLegacyMemory, scopeMatches, validMemoryScope, validTaskScope } from '../src/core/scope.js';
import { validateContextPack, validateMemoryRecord } from '../src/core/validation.js';
import { createMcpTools, MCP_TOOL_NAMES } from '../src/mcp/tools.js';
import type { EvidenceRecord, LifecycleFinalizationInput, LifecycleFinalizeResult, MemoryRecord, UpdateCandidate } from '../src/core/types.js';
const T = '2026-09-20T10:00:00.000Z', T2 = '2026-09-20T11:00:00.000Z';
const clock = () => T, later = () => T2;
const cli = resolve('dist/src/cli.js');
const exec = promisify(execFile);
let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tamhees-submission-')); assert.equal((await initTamhees(dir, clock)).success, true); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
function memory(id = 'DM-MEM-NEW'): MemoryRecord {
  return { schemaVersion: '1.0.0', id, scope: { kind: 'PROJECT' }, kind: 'CONVENTION', statement: 'Parser uses strict JSON validation.', source: { type: 'REPOSITORY_STATE', reference: 'src/parser.ts' }, verificationStatus: 'REPO_VERIFIED', confidence: 'HIGH', freshness: { lastVerified: T }, sensitivity: 'INTERNAL', actionPermission: 'MAY_ACT', relationships: { supportedBy: ['DM-EVIDENCE-NEW'] }, tags: ['parser'], createdAt: T, updatedAt: T };
}
function evidence(id = 'DM-EVIDENCE-NEW', target = 'DM-MEM-NEW'): EvidenceRecord {
  return { schemaVersion: '1.0.0', id, type: 'REPOSITORY_STATE', source: 'src/parser.ts', content: 'Parser delegates JSON validation to the canonical validator.', relationship: 'SUPPORTS', memoryIds: [target], collectedAt: T, collectedBy: 'agent' };
}
function candidate(record = memory()): UpdateCandidate {
  return { schemaVersion: '1.0.0', action: 'CREATE', proposedRecord: record, evidence: ['DM-EVIDENCE-NEW'], proposedBy: 'agent', authorityLevel: 'REPO_VERIFIED', requiresOwnerApproval: false, reason: 'Record inspected parser behavior.', timestamp: T };
}
function bundle(): LifecycleFinalizationInput {
  return { schemaVersion: '1.0.0', lifecycleId: 'lc-bundle', proposer: { type: 'AGENT', id: 'agent' }, proposedUpdates: [candidate()], proposedEvidence: [evidence()] };
}
async function begin() { assert.equal((await beginLifecycle(dir, 'parser behavior', clock, () => 'lc-bundle')).success, true); }
async function snapshot(): Promise<string> {
  const data: Record<string, string> = {};
  async function visit(path: string) { for (const item of await readdir(path, { withFileTypes: true })) { const child = join(path, item.name); if (item.isDirectory()) await visit(child); else data[child.slice(dir.length)] = await readFile(child, 'utf8'); } }
  await visit(join(dir, '.tamhees')); return JSON.stringify(Object.fromEntries(Object.entries(data).sort()));
}
async function rejectUnchanged(input: unknown) { await begin(); const before = await snapshot(); const result = await finalizeLifecycle(dir, input, later); assert.equal(result.success, false); assert.equal(await snapshot(), before); }

describe('Scope applicability and privacy', () => {
  it('validates exact project and composable restricted scopes', () => {
    assert.equal(validMemoryScope({ kind: 'PROJECT' }), true);
    assert.equal(validMemoryScope({ kind: 'RESTRICTED', environment: 'production', component: 'parser', path: 'src/parser' }), true);
    for (const scope of [null, {}, {kind:'RESTRICTED'}, {kind:'PROJECT',environment:'prod'}, {kind:'RESTRICTED',path:'../src'}, {kind:'RESTRICTED',path:'src//parser'}, {kind:'RESTRICTED',path:'C:\\private'}, {kind:'RESTRICTED',environment:'*'}, {kind:'RESTRICTED',user:'alice'}]) assert.equal(validMemoryScope(scope), false);
    assert.equal(validTaskScope({environment:'prod',unknown:true}), false);
  });
  it('matches constraints conjunctively and path segments exactly', () => {
    const scope = { kind: 'RESTRICTED' as const, environment: 'prod', component: 'parser', path: 'src/parser' };
    assert.equal(scopeMatches(scope, {environment:'prod',component:'parser',path:'src/parser/main.ts'}), true);
    for (const task of [{environment:'staging',component:'parser',path:'src/parser'}, {environment:'prod',component:'other',path:'src/parser'}, {environment:'prod',component:'parser',path:'src/parser2'}, {}]) assert.equal(scopeMatches(scope, task), false);
    assert.equal(scopeMatches({kind:'PROJECT'}, {}), true);
  });
  it('excludes mismatches before lexical ranking; tags cannot bypass; ordering is deterministic', () => {
    const restricted = {...memory(),scope:{kind:'RESTRICTED' as const,environment:'prod'}};
    const global = {...memory('DM-MEM-GLOBAL'),relationships:{}};
    const a = compileContext('parser', [restricted, global], clock, [evidence()], {scope:{environment:'staging'}});
    assert.equal(a.excluded.find(x => x.memoryId === restricted.id)?.reasonCode, 'out-of-scope');
    assert.ok(a.selected.some(x => x.memoryId === global.id));
    assert.deepEqual(a, compileContext('parser', [global, restricted], clock, [evidence()], {scope:{environment:'staging'}}));
    const matched = compileContext('parser', [restricted], clock, [evidence()], {scope:{environment:'prod'}});
    assert.deepEqual(matched.selected[0]?.scope, restricted.scope);
    assert.equal(validateContextPack(matched).valid, true);
    assert.throws(() => compileContext('parser', [restricted], clock, [], {scope:{path:'../bad'}}));
  });
  it('keeps scoped revocation blocking and stale matching memory at RECHECK', () => {
    const record = {...memory(),scope:{kind:'RESTRICTED' as const,component:'parser'}};
    const revoked = {...record,verificationStatus:'REVOKED' as const,actionPermission:'MUST_NOT_ACT' as const};
    assert.equal(compileContext('parser',[revoked],clock,[evidence()],{scope:{component:'parser'}}).excluded[0]?.reasonCode,'revoked');
    const stale = {...record,freshness:{lastVerified:T,reviewAfter:T}};
    assert.equal(compileContext('parser',[stale],later,[evidence()],{scope:{component:'parser'}}).selected[0]?.auditOutcome,'RECHECK');
  });
  it('normalizes missing legacy scope without rewriting disk and writes explicit scope on mutation', async () => {
    const old = {...memory(),verificationStatus:'UNKNOWN',relationships:{}} as Record<string,unknown>; delete old['scope'];
    const path = join(dir,'.tamhees/memories/records/DM-MEM-NEW.json'); const raw=JSON.stringify(old); await writeFile(path,raw);
    const loaded=(await loadAllRecords(dir)).records.find(x=>x.id==='DM-MEM-NEW')!;
    assert.deepEqual(loaded.scope,{kind:'PROJECT'}); assert.equal(await readFile(path,'utf8'),raw);
    assert.equal(validateMemoryRecord(old).valid,false); assert.equal(validateMemoryRecord(normalizeLegacyMemory(old)).valid,true);
    const update={...candidate({...loaded,statement:'Parser is bounded.'}),action:'UPDATE',memoryId:loaded.id,evidence:[]};
    assert.equal((await applyUpdateCandidate(dir,update,later)).success,true);
    assert.deepEqual(JSON.parse(await readFile(path,'utf8')).scope,{kind:'PROJECT'});
  });
  it('preserves narrower scope on legacy UPDATE, serializes it, and erases it under REDACT', async () => {
    await begin(); const record={...memory(),scope:{kind:'RESTRICTED' as const,component:'parser'}};
    assert.equal((await finalizeLifecycle(dir,{...bundle(),proposedUpdates:[candidate(record)]},later)).success,true);
    const current=(await loadAllRecords(dir)).records.find(x=>x.id===record.id)!;
    const legacy={...current,statement:'Parser remains strict.'} as Record<string,unknown>;delete legacy['scope'];
    const updated=await applyUpdateCandidate(dir,{...candidate(),action:'UPDATE',memoryId:record.id,proposedRecord:legacy},()=> '2026-09-20T12:00:00.000Z');
    assert.equal(updated.success,true);assert.deepEqual(updated.record?.scope,record.scope);
    const redacted=await applyUpdateCandidate(dir,{schemaVersion:'1.0.0',action:'REDACT',memoryId:record.id,evidence:[],proposedBy:'agent',authorityLevel:'REPO_VERIFIED',requiresOwnerApproval:false,reason:'Remove retained content.',timestamp:T2},later);
    assert.equal(redacted.success,true);assert.deepEqual(redacted.record?.scope,{kind:'PROJECT'});assert.equal(auditRecord(redacted.record!,[],T2)?.outcome,'FORGET_OR_REDACT');
  });
  it('rejects secret scope labels and raw sensitive scope retention', async () => {
    await rejectUnchanged({...bundle(),proposedUpdates:[candidate({...memory(),scope:{kind:'RESTRICTED',component:'ghp_abcdefghijklmnopqrstuvwxyz123456'}})]});
  });
});

describe('Bundled evidence, authority and interruption', () => {
  it('creates repository evidence and verified memory together; replay changes no bytes', async () => {
    await begin(); const request=bundle();const result=await finalizeLifecycle(dir,request,later); assert.equal(result.success,true,JSON.stringify(result));
    const record=(await loadAllRecords(dir)).records.find(x=>x.id==='DM-MEM-NEW')!;
    assert.equal(record.verificationStatus,'REPO_VERIFIED');assert.equal((await loadAllEvidence(dir)).evidence.length,1);assert.equal(compileContext('parser',[record],later,[evidence()]).selected[0]?.auditOutcome,'TRUST');
    const before=await snapshot();assert.equal((await finalizeLifecycle(dir,request,later)).alreadyFinalized,true);assert.equal(await snapshot(),before);
    assert.equal((await finalizeLifecycle(dir,{...request,reason:'changed'},later)).errors[0]?.code,'ALREADY_FINALIZED');
  });
  it('creates test-verified memory only with test evidence', async () => {
    await begin();const record={...memory(),verificationStatus:'TEST_VERIFIED' as const,source:{type:'TEST_RESULT' as const,reference:'node --test parser.test.js'}};
    const request={...bundle(),proposedEvidence:[{...evidence(),type:'TEST_RESULT' as const}],proposedUpdates:[{...candidate(record),authorityLevel:'TEST_VERIFIED' as const}]};
    assert.equal((await finalizeLifecycle(dir,request,later)).success,true);
  });
  const invalid: [string, () => unknown][] = [
    ['missing evidence',()=>({...bundle(),proposedEvidence:[]})],
    ['wrong evidence type',()=>({...bundle(),proposedEvidence:[{...evidence(),type:'TEST_RESULT'}]})],
    ['non-supporting evidence',()=>({...bundle(),proposedEvidence:[{...evidence(),relationship:'NEUTRAL'}]})],
    ['unknown referenced memory',()=>({...bundle(),proposedEvidence:[{...evidence(),memoryIds:['DM-MEM-NOT-THERE']}]})],
    ['duplicate evidence IDs',()=>({...bundle(),proposedEvidence:[evidence(),evidence()]})],
    ['duplicate memory targets',()=>({...bundle(),proposedUpdates:[candidate(),candidate()]})],
    ['mismatched proposer',()=>({...bundle(),proposedUpdates:[{...candidate(),proposedBy:'other'}]})],
    ['mismatched collector',()=>({...bundle(),proposedEvidence:[{...evidence(),collectedBy:'other'}]})],
    ['generated evidence',()=>({...bundle(),proposedEvidence:[{...evidence(),source:'generated summary'}]})],
    ['agent-created owner evidence',()=>({...bundle(),proposedEvidence:[{...evidence(),type:'OWNER_INSTRUCTION'}]})],
    ['secret evidence',()=>({...bundle(),proposedEvidence:[{...evidence(),content:'ghp_abcdefghijklmnopqrstuvwxyz123456'}]})],
    ['missing relationship evidence',()=>({...bundle(),proposedUpdates:[candidate({...memory(),relationships:{supportedBy:['missing']}})]})],
    ['source authority mismatch',()=>({...bundle(),proposedUpdates:[candidate({...memory(),source:{type:'AGENT_INFERENCE',reference:'guess'}})]})],
    ['invalid scope',()=>({...bundle(),proposedUpdates:[candidate({...memory(),scope:{kind:'RESTRICTED',path:'../bad'}})]})],
  ];
  for (const [name,input] of invalid) it(`rejects ${name} without any canonical or journal write`,async()=>rejectUnchanged(input()));
  it('preflights a later invalid item before applying an earlier valid one',async()=> {
    const bad={...candidate(memory('DM-MEM-SECOND')),evidence:['missing']};await rejectUnchanged({...bundle(),proposedUpdates:[candidate(),bad]});
  });
  it('rejects a duplicate stored memory without writing evidence',async()=> {
    await writeFile(join(dir,'.tamhees/memories/records/DM-MEM-NEW.json'),JSON.stringify(memory()));await rejectUnchanged(bundle());
  });
  it('rejects duplicate stored evidence IDs',async()=> {
    const stored={...evidence(),memoryIds:['DM-MEM-000001']};assert.equal((await storeEvidenceRecord(dir,stored)).success,true);await rejectUnchanged(bundle());
  });
  it('holds repository-evidenced owner policy without storing evidence or raw proposals',async()=> {
    await begin();const result=await finalizeLifecycle(dir,{...bundle(),proposedUpdates:[candidate({...memory(),statement:'Architecture policy permits external services.'})]},later);
    assert.equal(result.dispositions[0]?.disposition,'HELD_FOR_OWNER');assert.equal((await loadAllEvidence(dir)).evidence.length,0);assert.doesNotMatch(await snapshot(),/Architecture policy permits/);
  });
  it('cannot use owner evidence attached to an AGENT proposer to elevate memory',async()=> {
    const record={...memory(),verificationStatus:'OWNER_CONFIRMED' as const,source:{type:'OWNER_INSTRUCTION' as const,reference:'owner'}};
    await rejectUnchanged({...bundle(),proposedEvidence:[{...evidence(),type:'OWNER_INSTRUCTION'}],proposedUpdates:[{...candidate(record),authorityLevel:'OWNER_CONFIRMED'}]});
  });
  it('records planned evidence IDs and blocks replay after evidence interruption',async()=> {
    await begin();const request=bundle();const result=await finalizeLifecycle(dir,request,later,{beforeEvidenceWrite:()=>{throw Error('injected');}});
    assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');assert.equal((await loadAllEvidence(dir)).evidence.length,0);
    const journal=JSON.parse(await readFile(join(dir,'.tamhees/episodes/lc-bundle.json'),'utf8'));assert.equal(journal.status,'FAILED');assert.deepEqual(journal.finalization.evidenceIds,['DM-EVIDENCE-NEW']);
    assert.equal((await finalizeLifecycle(dir,request,later)).errors[0]?.code,'FAILED_LIFECYCLE');
  });
  it('keeps written evidence for inspection when interruption precedes memory write',async()=> {
    await begin();const result=await finalizeLifecycle(dir,bundle(),later,{beforeMutation:()=>{throw Error('injected');}});
    assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');assert.equal((await loadAllEvidence(dir)).evidence.length,1);assert.ok(!(await loadAllRecords(dir)).records.some(x=>x.id==='DM-MEM-NEW'));
  });
  it('runtime stale target cannot be overwritten and requires recovery',async()=> {
    await begin();const result=await finalizeLifecycle(dir,bundle(),later,{beforeMutation:async()=>{await writeFile(join(dir,'.tamhees/memories/records/DM-MEM-NEW.json'),JSON.stringify({...memory(),statement:'Concurrent record.'}));}});
    assert.equal(result.errors[0]?.code,'RECOVERY_REQUIRED');assert.equal((await loadAllRecords(dir)).records.find(x=>x.id==='DM-MEM-NEW')?.statement,'Concurrent record.');
  });
});

describe('MCP and CLI encoding',()=> {
  it('MCP alone creates evidence and scoped verified memory and retrieves matching context',async()=> {
    const mcp=createMcpTools(dir);await mcp.call(MCP_TOOL_NAMES[0],{});
    const beginResult=await mcp.call(MCP_TOOL_NAMES[1],{task:'parser',scope:{environment:'prod'}});
    const lifecycleId=(beginResult.structuredContent as {lifecycleId:string}).lifecycleId;
    const request={...bundle(),lifecycleId,proposedUpdates:[candidate({...memory(),scope:{kind:'RESTRICTED' as const,environment:'prod'}})]};
    const result=await mcp.call(MCP_TOOL_NAMES[2],{input:request});assert.equal((result.structuredContent as LifecycleFinalizeResult).success,true,JSON.stringify(result));
    const status=await mcp.call(MCP_TOOL_NAMES[3],{});assert.equal((status.structuredContent as {evidenceCount:number}).evidenceCount,1);
    const matched=await mcp.call(MCP_TOOL_NAMES[1],{task:'parser',scope:{environment:'prod'}});assert.match(JSON.stringify(matched),/DM-MEM-NEW/);
    const mismatch=await mcp.call(MCP_TOOL_NAMES[1],{task:'parser',scope:{environment:'staging'}});assert.match(JSON.stringify(mismatch),/out-of-scope/);
  });
  it('MCP malformed and secret inputs fail safely',async()=> {
    const mcp=createMcpTools(dir);await assert.rejects(()=>mcp.call(MCP_TOOL_NAMES[1],{task:'parser',scope:{path:'../bad'}}));
    const result=await mcp.call(MCP_TOOL_NAMES[2],{input:{...bundle(),proposedEvidence:'wrong'}});assert.equal(result.isError,true);
    const secret='ghp_abcdefghijklmnopqrstuvwxyz123456';const privateResult=await mcp.call(MCP_TOOL_NAMES[2],{input:{...bundle(),reason:secret}});assert.equal(privateResult.isError,true);assert.ok(!JSON.stringify(privateResult).includes(secret));
  });
  for (const bom of ['', '\uFEFF']) it(`CLI accepts ${bom?'one leading BOM':'ordinary UTF-8'} without altering embedded BOM`,async()=> {
    const record={...memory(),verificationStatus:'UNKNOWN' as const,relationships:{},statement:'Parser \uFEFF marker is retained.'};
    const input=join(dir,'candidate.json');await writeFile(input,bom+JSON.stringify({...candidate(record),evidence:[]}));
    await exec(process.execPath,[cli,'memory','apply','--input',input],{cwd:dir});
    assert.equal((await loadAllRecords(dir)).records.find(x=>x.id===record.id)?.statement,record.statement);
  });
  for (const content of ['\uFEFF{broken','\uFEFF\uFEFF{}',' \uFEFF{}']) it(`CLI rejects malformed encoding/input ${JSON.stringify(content)}`,async()=> {
    const input=join(dir,'bad.json');await writeFile(input,content);await assert.rejects(()=>exec(process.execPath,[cli,'memory','apply','--input',input],{cwd:dir}));
  });
});

describe('Review regressions',()=> {
  it('initializes an old store without rewriting a missing bootstrap scope',async()=> {
    const path=join(dir,'.tamhees/memories/records/DM-MEM-000001.json');const old=JSON.parse(await readFile(path,'utf8'));delete old.scope;const raw=JSON.stringify(old);await writeFile(path,raw);
    assert.equal((await initTamhees(dir,later)).success,true);assert.equal(await readFile(path,'utf8'),raw);
  });
  it('blocks simultaneous finalization in the same process and allows completed replay',async()=> {
    await begin();let release!:()=>void;let entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const started=new Promise<void>(r=>{entered=r;});
    const first=finalizeLifecycle(dir,bundle(),later,{beforeEvidenceWrite:async()=>{entered();await gate;}});await started;
    const second=await finalizeLifecycle(dir,bundle(),later);assert.equal(second.errors[0]?.code,'CONCURRENT_FINALIZATION');release();assert.equal((await first).success,true);assert.equal((await finalizeLifecycle(dir,bundle(),later)).alreadyFinalized,true);
  });
  it('does not persist restricted scope on sensitive tombstone input',async()=> {
    const record={...memory(),verificationStatus:'UNKNOWN' as const,scope:{kind:'RESTRICTED' as const,component:'private-team'},statement:'[REDACTED]',source:{type:'AGENT_INFERENCE' as const,reference:'[REDACTED]'},sensitivity:'SENSITIVE' as const,tags:['redacted'],relationships:{}};
    await rejectUnchanged({...bundle(),proposedEvidence:[],proposedUpdates:[{...candidate(record),evidence:[]}]});
  });
  it('rejects evidence attached to a different memory even when another evidence item verifies the claim',async()=> {
    const bad={...evidence('DM-EVIDENCE-OTHER','DM-MEM-000001')};
    await rejectUnchanged({...bundle(),proposedEvidence:[evidence(),bad],proposedUpdates:[{...candidate({...memory(),relationships:{supportedBy:[bad.id]}}),evidence:['DM-EVIDENCE-NEW',bad.id]}]});
  });
  it('CLI scope file selects matching memories and excludes mismatches',async()=> {
    await begin();assert.equal((await finalizeLifecycle(dir,{...bundle(),proposedUpdates:[candidate({...memory(),scope:{kind:'RESTRICTED',environment:'prod'}})]},later)).success,true);
    const path=join(dir,'task-scope.json');await writeFile(path,'\uFEFF'+JSON.stringify({environment:'staging'}));
    const result=await exec(process.execPath,[cli,'context','--task','parser','--scope-input',path],{cwd:dir});const context=JSON.parse(result.stdout);assert.equal(context.excluded.find((x:{memoryId:string})=>x.memoryId==='DM-MEM-NEW').reasonCode,'out-of-scope');
    await writeFile(path,JSON.stringify({environment:'prod'}));const matched=await exec(process.execPath,[cli,'lifecycle','begin','--task','parser','--scope-input',path],{cwd:dir});assert.ok(JSON.parse(matched.stdout).contextPack.selected.some((x:{memoryId:string})=>x.memoryId==='DM-MEM-NEW'));
  });
  it('scope cannot evade a matching contradictory evidence block',()=> {
    const record={...memory(),scope:{kind:'RESTRICTED' as const,component:'parser'}};
    const pack=compileContext('parser',[record],clock,[{...evidence(),relationship:'CONTRADICTS'}],{scope:{component:'parser'}});
    assert.equal(pack.selected.length,0);assert.equal(pack.excluded[0]?.reasonCode,'conflicted');
  });
});
