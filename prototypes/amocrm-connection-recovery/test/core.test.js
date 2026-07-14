import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCheck, maskSecret, normalizeBaseUrl } from '../src/core.js';

test('normalizes account URL', () => {
  assert.equal(normalizeBaseUrl('demo.amocrm.ru/path'), 'https://demo.amocrm.ru');
});

test('rejects insecure URL', () => {
  assert.throws(() => normalizeBaseUrl('http://demo.amocrm.ru'), /HTTPS/);
});

test('classifies unauthorized access', () => {
  assert.equal(classifyCheck(401).code, 'unauthorized');
});

test('classifies forbidden access', () => {
  assert.equal(classifyCheck(403).code, 'forbidden');
});

test('classifies rate limiting', () => {
  assert.equal(classifyCheck(429).code, 'rate-limited');
});

test('masks sensitive values', () => {
  assert.equal(maskSecret('1234567890'), '1234...7890'.replace('...', '…'));
});
