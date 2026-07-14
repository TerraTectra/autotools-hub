import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, normalizeEmail, normalizePhone, cleanRecords, toCsv } from '../src/core.js';

test('parses quoted commas', () => {
  const parsed = parseCsv('name,email\n"ООО, Ромашка",A@EXAMPLE.COM\n');
  assert.equal(parsed.records[0].name, 'ООО, Ромашка');
});

test('normalizes email', () => {
  assert.deepEqual(normalizeEmail(' Test@Example.COM ').value, 'test@example.com');
  assert.equal(normalizeEmail('bad').valid, false);
});

test('normalizes Russian phones', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67').value, '+79991234567');
  assert.equal(normalizePhone('9991234567').value, '+79991234567');
});

test('merges duplicates by email and fills missing data', () => {
  const result = cleanRecords([
    { source: 'a.csv', record: { name: 'Иван', email: 'A@EXAMPLE.COM', phone: '' } },
    { source: 'b.csv', record: { name: '', email: 'a@example.com', phone: '89991234567' } },
  ]);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].phone, '+79991234567');
  assert.equal(result.report.duplicatesMerged, 1);
});

test('reports invalid contacts', () => {
  const result = cleanRecords([{ source: 'x.csv', record: { email: 'bad', phone: '12' } }]);
  assert.equal(result.report.invalidEmails, 1);
  assert.equal(result.report.invalidPhones, 1);
  assert.equal(result.report.rowsWithoutContact, 1);
});

test('escapes CSV output', () => {
  const csv = toCsv([{ name: 'ООО, Тест', email: 'a@example.com' }]);
  assert.match(csv, /"ООО, Тест"/);
});
