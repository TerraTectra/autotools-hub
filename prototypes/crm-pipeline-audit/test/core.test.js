import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, normalizeRecord, analyze, parseMoney } from '../src/core.js';

test('parses quoted CSV values', () => {
  const rows = parseCsv('id,name,amount\n1,"Компания, ООО","12 500"\n');
  assert.equal(rows[0].name, 'Компания, ООО');
});

test('parses money', () => {
  assert.equal(parseMoney('125 500,50 ₽'), 125500.5);
});

test('normalizes common export columns', () => {
  const record = normalizeRecord({ lead_id: '7', title: 'Test', stage_name: 'Новая', responsible_name: 'Анна', price: '1000' });
  assert.equal(record.id, '7');
  assert.equal(record.owner, 'Анна');
  assert.equal(record.amount, 1000);
});

test('detects stale lead without task', () => {
  const records = [normalizeRecord({ id: '1', name: 'Lead', status: 'Новая', owner: 'Иван', amount: '5000', created_at: '2026-06-01', updated_at: '2026-06-10' })];
  const report = analyze(records, { now: '2026-07-14T00:00:00Z', staleDays: 7, noTaskDays: 2 });
  assert.equal(report.totals.risky, 1);
  assert.equal(report.totals.amountAtRisk, 5000);
});

test('ignores closed leads', () => {
  const records = [normalizeRecord({ id: '1', status: 'Успешно реализовано', amount: '9000', updated_at: '2026-01-01' })];
  const report = analyze(records, { now: '2026-07-14T00:00:00Z' });
  assert.equal(report.totals.active, 0);
});
