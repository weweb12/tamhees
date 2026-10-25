import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MCP_PROTOCOL_VERSION, MCP_SUPPORTED_PROTOCOL_VERSIONS, McpSession, type McpToolProvider } from '../src/mcp/protocol.js';

// Real MCP clients differ in protocol revision and in optional fields they send.
// Rejecting them means the integration silently fails to connect.

const tools: McpToolProvider = {
  list: () => [{ name: 'tamhees_status', description: 'status', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }],
  call: async () => ({ content: [{ type: 'text', text: '{}' }] }),
};
const parse = (line: string | null) => JSON.parse(line ?? 'null');

async function handshake(initParams: Record<string, unknown>) {
  const session = new McpSession(tools);
  const init = parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams })));
  await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  return { session, init };
}

describe('MCP compatibility with real clients', () => {
  for (const version of MCP_SUPPORTED_PROTOCOL_VERSIONS) {
    it(`accepts protocol revision ${version} and answers with the same revision`, async () => {
      const { session, init } = await handshake({ protocolVersion: version, capabilities: {}, clientInfo: { name: 'client', version: '1.0' } });
      assert.equal(init.result.protocolVersion, version);
      const list = parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })));
      assert.equal(list.result.tools.length, 1);
    });
  }

  it('answers an unknown revision with the latest one instead of failing', async () => {
    const { init } = await handshake({ protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'client', version: '1.0' } });
    assert.equal(init.result.protocolVersion, MCP_PROTOCOL_VERSION);
  });

  it('accepts optional fields that newer clients send', async () => {
    const { session, init } = await handshake({
      protocolVersion: '2025-11-25',
      capabilities: { roots: { listChanged: true }, sampling: {}, elicitation: {} },
      clientInfo: { name: 'client', version: '1.0', title: 'Client App', websiteUrl: 'https://example.invalid' },
      _meta: { trace: 'x' },
    });
    assert.equal(init.result.protocolVersion, '2025-11-25');
    const replies = await Promise.all([
      session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { cursor: 'next', _meta: {} } })),
      session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'tamhees_status', arguments: {}, _meta: { progressToken: 7 } } })),
      session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping', params: { _meta: {} } })),
    ]);
    for (const reply of replies) assert.equal(parse(reply).error, undefined, String(reply));
  });

  it('still rejects malformed required fields', async () => {
    const session = new McpSession(tools);
    let nextId = 100;
    for (const params of [
      { protocolVersion: '', capabilities: {}, clientInfo: { name: 'c', version: '1' } },
      { protocolVersion: '2025-11-25', clientInfo: { name: 'c', version: '1' } },
      { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { version: '1' } },
      { protocolVersion: '2025-11-25', capabilities: [], clientInfo: { name: 'c', version: '1' } },
      { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'c', version: '1' }, unexpected: true },
      { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'c', version: '1', unexpected: true } },
    ]) {
      const reply = parse(await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'initialize', params })));
      assert.equal(reply.error?.code, -32602, JSON.stringify(params));
    }
    const ready = await handshake({ protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'c', version: '1' } });
    const badCall = parse(await ready.session.receiveLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'tamhees_status', unexpected: true } })));
    assert.equal(badCall.error.code, -32602);
  });
});
