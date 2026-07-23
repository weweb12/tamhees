import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { MCP_MAX_LINE_BYTES, MCP_PROTOCOL_VERSION, McpLineFramer, McpSession, decodeMcpLine, parseErrorLine, type McpToolProvider } from '../src/mcp/protocol.js';
import { createMcpTools, MCP_TOOL_NAMES } from '../src/mcp/tools.js';

const roots: string[] = [];
afterEach(async () => { while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }); });
const init = (id: number|string = 1) => JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } });
const initialized = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
const parse = (line: string|null) => JSON.parse(line!) as Record<string, any>;

describe('Phase 6 MCP JSON-RPC conformance', () => {
  it('negotiates the exact protocol revision and advertises all required tools', async () => {
    const project = await mkdtemp(join(tmpdir(), 'dm-mcp-')); roots.push(project);
    const session = new McpSession(createMcpTools(project));
    const response = parse(await session.receiveLine(init()));
    assert.equal(response.result.protocolVersion, '2025-11-25');
    assert.equal(await session.receiveLine(initialized), null);
    const listed = parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })));
    assert.deepEqual(listed.result.tools.map((tool: {name:string}) => tool.name), MCP_TOOL_NAMES);
  });

  it('keeps ping available and notifications silent', async () => {
    const session = new McpSession(fakeTools());
    assert.deepEqual(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 'p', method: 'ping' }))).result, {});
    assert.equal(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', method: 'unknown/notification' })), null);
  });

  it('returns standard parse, invalid request, method, params, and internal errors', async () => {
    const provider: McpToolProvider = { list: () => [], async call(name) { if (name === 'explode') throw new Error('private detail'); throw new (await import('../src/mcp/protocol.js')).McpInvalidParamsError(); } };
    const session = new McpSession(provider);
    assert.equal(parse(await session.receiveLine('{')).error.code, -32700);
    assert.equal(parse(await session.receiveLine('[]')).error.code, -32600);
    await session.receiveLine(init(10)); await session.receiveLine(initialized);
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'missing' }))).error.code, -32601);
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 1 } }))).error.code, -32602);
    const internal = parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'explode', arguments: {} } })));
    assert.equal(internal.error.code, -32603); assert.doesNotMatch(JSON.stringify(internal), /private detail/);
  });

  it('rejects pre-initialize calls, unsupported versions, and duplicate IDs', async () => {
    const session = new McpSession(fakeTools());
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).error.code, -32600);
    const bad = JSON.parse(init(2)); bad.params.protocolVersion = '2024-01-01';
    assert.equal(parse(await session.receiveLine(JSON.stringify(bad))).error.code, -32602);
    const second = new McpSession(fakeTools()); await second.receiveLine(init('same'));
    assert.equal(parse(await second.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 'same', method: 'ping' }))).error.code, -32600);
  });

  it('initializes storage and reports privacy-safe status through real tools', async () => {
    const project = await mkdtemp(join(tmpdir(), 'dm-mcp-tool-')); roots.push(project);
    const session = new McpSession(createMcpTools(project)); await session.receiveLine(init()); await session.receiveLine(initialized);
    const call = (id: number, name: string, args = {}) => session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }));
    const created = parse(await call(2, MCP_TOOL_NAMES[0])); assert.equal(created.result.structuredContent.success, true);
    const status = parse(await call(3, MCP_TOOL_NAMES[3]));
    assert.deepEqual(status.result.structuredContent, { ready: true, memoryCount: 1, evidenceCount: 0, errorCount: 0 });
    assert.equal(parse(await call(4, 'unknown')).error.code, -32602);
  });
});

describe('Phase 6 MCP byte framing', () => {
  it('reassembles fragmented multibyte UTF-8 and accepts CRLF', () => {
    const framer = new McpLineFramer(); const bytes = Buffer.from('{"task":"ذاكرة"}\r\n', 'utf8');
    const split = bytes.indexOf(Buffer.from('ذ', 'utf8')) + 1;
    assert.deepEqual(framer.push(bytes.subarray(0, split)), []);
    const frames = framer.push(bytes.subarray(split)); assert.equal(frames.length, 1);
    const frame = frames[0]!; assert.ok('line' in frame); assert.equal(decodeMcpLine(frame.line), '{"task":"ذاكرة"}');
  });

  it('rejects invalid UTF-8 and over-limit lines with parse errors', () => {
    assert.equal(decodeMcpLine(Buffer.from([0xc3, 0x28])), null);
    assert.equal(parse(parseErrorLine()).error.code, -32700);
    const framer = new McpLineFramer(); const frames = framer.push(Buffer.concat([Buffer.alloc(MCP_MAX_LINE_BYTES + 1, 0x61), Buffer.from('\n{}\n')]));
    assert.ok(frames.some((frame) => 'error' in frame));
    assert.ok(frames.some((frame) => 'line' in frame && frame.line.toString() === '{}'));
  });
});

function fakeTools(): McpToolProvider { return { list: () => [], async call() { return { content: [{ type: 'text', text: '{}' }] }; } }; }
