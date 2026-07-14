import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRecords, detectDelimiter, normalizeEmail, normalizePhone, parseDate, parseDelimited } from '../core.js';

test('detects semicolon and parses quoted values', () => {
  const text = 'name;email\n"ООО; Тест";A@EXAMPLE.COM\n';
  assert.equal(detectDelimiter(text), ';');
  assert.equal(parseDelimited(text).records[0].name, 'ООО; Тест');
});

test('normalizes contacts', () => {
  assert.equal(normalizeEmail(' A@Example.COM ').value, 'a@example.com');
  assert.equal(normalizePhone('8 (999) 123-45-67').value, '+79991234567');
});

test('parses unix and russian dates', () => {
  assert.equal(parseDate('1720951200') instanceof Date, true);
  assert.equal(parseDate('14.07.2026') instanceof Date, true);
});

test('finds duplicates and contact problems', () => {
  const report = analyzeRecords([
    { email: 'A@example.com', phone: '89991234567' },
    { email: 'a@example.com', phone: '+7 999 123-45-67' },
    { email: 'bad', phone: '12' },
  ]);
  assert.equal(report.duplicateEmails, 1);
  assert.equal(report.duplicatePhones, 1);
  assert.equal(report.invalidEmails, 1);
  assert.equal(report.invalidPhones, 1);
});

test('finds stale deals and risk amount', () => {
  const report = analyzeRecords([
    { status: 'В работе', amount: '120 000', updated_at: '2026-06-01', next_task_at: '' },
    { status: 'Успешно реализовано', amount: '50 000', updated_at: '2026-01-01' },
  ], { now: new Date('2026-07-14T12:00:00Z'), staleDays: 7 });
  assert.equal(report.detectedDeals, 1);
  assert.equal(report.staleDeals, 1);
  assert.equal(report.missingNextTask, 1);
  assert.equal(report.riskAmount, 120000);
});
