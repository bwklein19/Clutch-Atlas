import { describe, expect, it } from 'vitest';
import { parseMcpEventStream } from './mcp';

describe('Clutch MCP response parser', () => {
  it('parses a streamable HTTP JSON-RPC event', () => {
    expect(parseMcpEventStream('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n')).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });

  it('rejects an empty event stream', () => {
    expect(() => parseMcpEventStream('event: ping\n\n')).toThrow('empty event stream');
  });
});
