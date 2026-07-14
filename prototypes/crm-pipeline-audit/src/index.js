import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseCsv, normalizeRecord, analyze, renderHtml } from './core.js';

function parseArgs(argv) {
  const args = { input: '', output: 'output/audit-report.html', staleDays: 7, noTaskDays: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--input') args.input = argv[++i];
    else if (value === '--output') args.output = argv[++i];
    else if (value === '--stale-days') args.staleDays = Number(argv[++i]);
    else if (value === '--no-task-days') args.noTaskDays = Number(argv[++i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error('Usage: node src/index.js --input sample/leads.csv [--output output/report.html] [--stale-days 7]');
  process.exit(1);
}

const input = resolve(args.input);
const output = resolve(args.output);
const csv = await readFile(input, 'utf8');
const records = parseCsv(csv).map((row) => normalizeRecord(row));
if (!records.length) throw new Error('CSV does not contain data rows');
const report = analyze(records, args);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, renderHtml(report), 'utf8');
await writeFile(output.replace(/\.html$/i, '.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`Audit complete: ${output}`);
console.log(JSON.stringify(report.totals, null, 2));
