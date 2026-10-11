import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTravelTime, normalizeTravelMessage } from './travel-input.js';

const now = new Date('2026-10-11T12:00:00Z');
test('pasted line breaks and invisible spacing preserve journey names', () => {
  const text =
    'Sverige: Jag vill resa från Göteborg central till Vällingby T-\r\nbana imorgon vid 07 tiden.';
  const expected =
    'Sverige: Jag vill resa från Göteborg central till Vällingby T-bana';
  assert.equal(parseTravelTime(text, now).clean, expected);
  assert.equal(parseTravelTime(text, now).time, '07:00');
  assert.equal(
    normalizeTravelMessage(
      'från Göteborg\ncentral\u00a0till Vällingby\u200b T-bana',
    ),
    'från Göteborg central till Vällingby T-bana',
  );
});
test('user journey request preserves both stop names and departure at 07', () => {
  assert.deepEqual(
    parseTravelTime(
      'Jag vill resa från Göteborg central till Vällingby T-bana imorgon vid 07 tiden.',
      now,
    ),
    {
      date: '2026-10-12',
      time: '07:00',
      clean: 'Jag vill resa från Göteborg central till Vällingby T-bana',
    },
  );
});
test('hour-only and minute-based Swedish time expressions', () => {
  for (const suffix of [
    'vid 07 tiden',
    'vid 7-tiden',
    'kl 7',
    'kl. 07',
    'klockan 7',
    'vid 07:00',
    'vid 7.00',
  ]) {
    const result = parseTravelTime(
      'Jag vill resa från Göteborg central till Vällingby T-bana ' +
        suffix +
        '.',
      now,
    );
    assert.equal(result.time, '07:00', suffix);
    assert.equal(
      result.clean,
      'Jag vill resa från Göteborg central till Vällingby T-bana',
      suffix,
    );
  }
  assert.equal(parseTravelTime('resa imorgon kl 07:35', now).time, '07:35');
  assert.equal(parseTravelTime('resa imorgon', now).time, undefined);
});
test('invalid or incomplete explicit times never silently become departure now', () => {
  for (const suffix of ['vid 25 tiden', 'kl 07:60', 'vid 07:5', 'vid 7-9'])
    assert.throws(
      () => parseTravelTime('resa imorgon ' + suffix, now),
      /tid|Tiden/,
    );
});
test('tomorrow follows the Stockholm calendar over spring daylight-saving change', () => {
  assert.equal(
    parseTravelTime('resa imorgon vid 7', new Date('2026-03-28T22:30:00Z'))
      .date,
    '2026-03-29',
  );
});
