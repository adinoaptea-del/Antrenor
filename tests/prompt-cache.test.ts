import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropicClient, systemBlocks } from '../src/agents/runner.js';

test('system-ul trimis cu puncte de cache', () => {
  assert.deepEqual(systemBlocks({ system: 'abc' }), [{ type: 'text', text: 'abc', cache_control: { type: 'ephemeral' } }]);
  const b = systemBlocks({ system: 'stabilvariabil', systemStable: 6 });
  assert.deepEqual(b.map((x) => x.text), ['stabil', 'variabil']);
  assert.ok(b.every((x) => x.cache_control.type === 'ephemeral'));
  assert.equal(systemBlocks({ system: 'abc', systemStable: 3 }).length, 1);
});

test('clientul trimite cache_control și raportează tokenii din cache', async () => {
  let body: any;
  let usage: any;
  const fake = (async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":1}' }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 4000 } }));
  }) as unknown as typeof fetch;
  await anthropicClient('k', fake, (_m, u) => (usage = u)).json({ model: 'm', system: 'S', user: 'U', schema: {} });
  assert.equal(body.system[0].cache_control.type, 'ephemeral');
  assert.equal(usage.cache_read_input_tokens, 4000);
});
