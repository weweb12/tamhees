import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MCP_MAX_LINE_BYTES,
  MCP_PROTOCOL_VERSION,
  McpLineFramer,
  McpSession,
  decodeMcpLine,
  type McpToolProvider,
} from '../src/mcp/protocol.js';

const tools: McpToolProvider = {
  list: () => [],
  async call() {
    return { content: [{ type: 'text', text: '{}' }] };
  },
};
const parse = (value: string | null) => JSON.parse(value!) as Record<string, any>;
const initialize = (id: string | number = 1, extra: Record<string, unknown> = {}) => JSON.stringify({
  jsonrpc: '2.0',
  id,
  method: 'initialize',
  params: {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'owner-verification', version: '1.0.0' },
    ...extra,
  },
});

describe('MCP session boundaries', () => {
  it('preserves valid string and integer IDs and rejects invalid ID shapes', async () => {
    const session = new McpSession(tools);
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 'alpha', method: 'ping' }))).id, 'alpha');
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }))).id, 7);
    for (const id of [null, 1.5, [], {}, '']) {
      const result = parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id, method: 'ping' })));
      assert.equal(result.error.code, -32600);
      assert.equal(result.id, null);
    }
    assert.equal(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', method: 'ping' })), null);
  });

  it('rejects batches and unknown properties in strict initialization and method params', async () => {
    const session = new McpSession(tools);
    assert.equal(parse(await session.receiveLine('[]')).error.code, -32600);
    assert.equal(parse(await session.receiveLine(initialize(1, { unexpected: true }))).error.code, -32602);
    assert.equal(parse(await session.receiveLine(initialize(2))).result.protocolVersion, MCP_PROTOCOL_VERSION);
    await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
    assert.equal(parse(await session.receiveLine(JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/list', params: { unexpected: true },
    }))).error.code, -32602);
    assert.equal(parse(await session.receiveLine(JSON.stringify({
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'x', arguments: {}, unexpected: true },
    }))).error.code, -32602);
  });

  it('requires initialization readiness and repeated initialization cannot corrupt state', async () => {
    const session = new McpSession(tools);
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).error.code, -32600);
    assert.equal(parse(await session.receiveLine(initialize(2))).result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }))).error.code, -32600);
    assert.equal(parse(await session.receiveLine(initialize(4))).error.code, -32602);
    await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
    assert.deepEqual(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }))).result, { tools: [] });
  });

  it('bounds duplicate-ID tracking and permits reuse after the documented rolling window', async () => {
    const session = new McpSession(tools, 3);
    for (const id of [1, 2, 3]) assert.deepEqual(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id, method: 'ping' }))).result, {});
    assert.equal(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }))).error.code, -32600);
    assert.deepEqual(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }))).result, {});
    assert.deepEqual(parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }))).result, {});
  });

  it('never returns responses to notifications, including invalid and unknown notifications', async () => {
    const session = new McpSession(tools);
    for (const line of [
      { jsonrpc: '2.0', method: 'missing' },
      { jsonrpc: '1.0', method: 'missing' },
      { jsonrpc: '2.0', method: 12 },
    ]) {
      assert.equal(await session.receiveLine(JSON.stringify(line)), null);
    }
  });
});

describe('MCP framing boundaries', () => {
  it('handles LF, CRLF, multiple messages per chunk, fragmentation, and final EOF data', () => {
    const framer = new McpLineFramer();
    const first = framer.push(Buffer.from('{}\n{\"a\":1}\r\n{\"unicode\":\"ذا', 'utf8'));
    assert.deepEqual(first.map((frame) => 'line' in frame ? decodeMcpLine(frame.line) : frame.error), ['{}', '{"a":1}']);
    const second = framer.push(Buffer.from('كرة\"}', 'utf8'));
    assert.deepEqual(second, []);
    const final = framer.finish();
    assert.equal(final.length, 1);
    assert.equal('line' in final[0]! ? decodeMcpLine(final[0].line) : null, '{"unicode":"ذاكرة"}');
    assert.deepEqual(framer.finish(), []);
  });

  it('discards an oversized line through its delimiter without treating hidden bytes as a request', () => {
    const framer = new McpLineFramer();
    const first = framer.push(Buffer.alloc(MCP_MAX_LINE_BYTES, 0x61));
    assert.deepEqual(first, []);
    const second = framer.push(Buffer.from('hidden-request\n{}\n'));
    assert.equal(second.filter((frame) => 'error' in frame).length, 1);
    assert.deepEqual(
      second.filter((frame): frame is { line: Buffer } => 'line' in frame).map((frame) => frame.line.toString('utf8')),
      ['{}'],
    );
    assert.deepEqual(framer.finish(), []);
  });
});
