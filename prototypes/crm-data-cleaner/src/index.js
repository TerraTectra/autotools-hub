import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { parseCsv, cleanRecords, toCsv } from './core.js';

function parseArgs(argv) {
  const args = { inputs: [], output: 'output/cleaned.csv', report: 'output/report.json', defaultCountryCode: '7' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.inputs.push(argv[++i]);
    else if (argv[i] === '--output') args.output = argv[++i];
    else if (argv[i] === '--report') args.report = argv[++i];
    else if (argv[i] === '--country-code') args.defaultCountryCode = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.inputs.length) {
  console.error('Usage: node src/index.js --input file1.csv [--input file2.csv] --output cleaned.csv');
  process.exit(1);
}

const rows = [];
for (const input of args.inputs) {
  const path = resolve(input);
  const parsed = parseCsv(await readFile(path, 'utf8'));
  for (const record of parsed.records) rows.push({ record, source: basename(path) });
}

const result = cleanRecords(rows, { defaultCountryCode: args.defaultCountryCode });
await mkdir(dirname(resolve(args.output)), { recursive: true });
await mkdir(dirname(resolve(args.report)), { recursive: true });
await writeFile(resolve(args.output), toCsv(result.records), 'utf8');
await writeFile(resolve(args.report), JSON.stringify(result.report, null, 2), 'utf8');
console.log(JSON.stringify(result.report, null, 2));
