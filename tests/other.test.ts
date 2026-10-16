import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOther } from '../src/collector/other.js';

describe('recuperarea și mișcarea în plus', () => {
  it('saună, baie rece, yoga = recuperare; plimbare, tenis = mișcare în plus', () => {
    assert.deepEqual(classifyOther('sauna'), { kind: 'recuperare', name: 'saună' });
    assert.deepEqual(classifyOther('Ice Bath'), { kind: 'recuperare', name: 'baie rece' });
    assert.equal(classifyOther('Yoga')?.kind, 'recuperare');
    assert.equal(classifyOther('Walk')?.kind, 'activ');
    assert.equal(classifyOther('tennis')?.name, 'sport cu racheta');
    assert.equal(classifyOther('activity'), null);
  });
});
