// Costul AI pe model (21.10.2026): head coach pe Opus 5.5, restul pe Sonnet 5.5; tarifele publicate de Anthropic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costUsd, priceOf } from '../server/_lib/usage.js';

test('tariful pe model: Sonnet 2/10, Opus 4/20, necunoscut = Opus (pesimist)', () => {
  assert.deepEqual(priceOf('claude-sonnet-5-5'), [2, 10]);
  assert.deepEqual(priceOf('claude-opus-5-5'), [4, 20]);
  assert.deepEqual(priceOf('model-nou'), [4, 20]);
  assert.equal(costUsd(1_000_000, 0, 0, 0, 'claude-opus-5-5'), 4);
  assert.equal(costUsd(0, 1_000_000, 0, 0, 'claude-sonnet-5-5'), 10);
  assert.equal(costUsd(0, 0, 1_000_000, 1_000_000, 'claude-opus-5-5'), 4 * 1.25 + 4 * 0.1);
});
