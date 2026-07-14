export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); if (row.some((v) => v.trim() !== '')) rows.push(row); }
  if (rows.length < 2) return { headers: [], records: [] };
  const headers = rows[0].map(normalizeHeader);
  const records = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, i) => [header, (values[i] ?? '').trim()])));
  return { headers, records };
}

export function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/[\s./-]+/g, '_');
}

export function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return { value: '', valid: false, empty: true };
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email);
  return { value: valid ? email : '', valid, empty: false, original: email };
}

export function normalizePhone(value, defaultCountryCode = '7') {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: '', valid: false, empty: true };
  let digits = raw.replace(/\D/g, '');
  if (defaultCountryCode === '7') {
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    else if (digits.length === 10) digits = `7${digits}`;
  }
  const valid = digits.length >= 10 && digits.length <= 15;
  return { value: valid ? `+${digits}` : '', valid, empty: false, original: raw };
}

export function findField(record, candidates) {
  for (const key of candidates) {
    if (record[key] !== undefined && String(record[key]).trim() !== '') return String(record[key]).trim();
  }
  return '';
}

export function normalizeRecord(record, source, options = {}) {
  const emailRaw = findField(record, ['email', 'e_mail', 'mail', 'contact_email']);
  const phoneRaw = findField(record, ['phone', 'telephone', 'mobile', 'contact_phone', 'телефон']);
  const email = normalizeEmail(emailRaw);
  const phone = normalizePhone(phoneRaw, options.defaultCountryCode ?? '7');
  return {
    ...record,
    email: email.value,
    phone: phone.value,
    _emailInvalid: !email.empty && !email.valid,
    _phoneInvalid: !phone.empty && !phone.valid,
    _source: source,
  };
}

function firstNonEmpty(a, b) {
  return String(a ?? '').trim() !== '' ? a : b;
}

export function mergeRecords(base, incoming) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (key.startsWith('_')) continue;
    merged[key] = firstNonEmpty(merged[key], value);
  }
  const sources = new Set([...(base._sources ?? [base._source]).filter(Boolean), ...(incoming._sources ?? [incoming._source]).filter(Boolean)]);
  merged._sources = [...sources];
  merged._duplicateCount = (base._duplicateCount ?? 0) + 1 + (incoming._duplicateCount ?? 0);
  merged._emailInvalid = Boolean(base._emailInvalid && incoming._emailInvalid);
  merged._phoneInvalid = Boolean(base._phoneInvalid && incoming._phoneInvalid);
  return merged;
}

export function cleanRecords(records, options = {}) {
  const normalized = records.map((item) => normalizeRecord(item.record, item.source, options));
  const output = [];
  const index = new Map();
  let duplicates = 0;

  for (const record of normalized) {
    const keys = [];
    if (record.email) keys.push(`email:${record.email}`);
    if (record.phone) keys.push(`phone:${record.phone}`);
    const existingIndex = keys.map((key) => index.get(key)).find((value) => value !== undefined);
    if (existingIndex !== undefined) {
      output[existingIndex] = mergeRecords(output[existingIndex], record);
      for (const key of keys) index.set(key, existingIndex);
      duplicates += 1;
    } else {
      const next = { ...record, _sources: record._source ? [record._source] : [], _duplicateCount: 0 };
      const position = output.push(next) - 1;
      for (const key of keys) index.set(key, position);
    }
  }

  const clean = output.map((record) => {
    const result = {};
    for (const [key, value] of Object.entries(record)) if (!key.startsWith('_')) result[key] = value;
    result.source_files = record._sources.join('; ');
    result.merged_duplicates = String(record._duplicateCount);
    return result;
  });

  return {
    records: clean,
    report: {
      inputRows: records.length,
      outputRows: clean.length,
      duplicatesMerged: duplicates,
      invalidEmails: normalized.filter((r) => r._emailInvalid).length,
      invalidPhones: normalized.filter((r) => r._phoneInvalid).length,
      rowsWithoutContact: normalized.filter((r) => !r.email && !r.phone).length,
      uniqueEmails: new Set(clean.map((r) => r.email).filter(Boolean)).size,
      uniquePhones: new Set(clean.map((r) => r.phone).filter(Boolean)).size,
    },
  };
}

export function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(records) {
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return [headers.join(','), ...records.map((record) => headers.map((header) => escapeCsv(record[header])).join(','))].join('\n') + '\n';
}
