#!/usr/bin/env node
'use strict';

const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const sqlPath = resolve(__dirname, '../../../internal-docs/schema.sql');
const outPath = resolve(__dirname, '../src/db/schema.ts');
const check = process.argv.includes('--check');

const raw = readFileSync(sqlPath, 'utf8');

const lines = raw
  .split('\n')
  .map((line) => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx).trimEnd();
  });

// For each blank line, decide whether to keep it:
//   - Always drop if the immediately-previous kept line is also blank (collapse runs).
//   - Also drop if either surrounding non-blank neighbour is indented (blank is an
//     artefact of a stripped continuation/inline comment inside a CREATE TABLE body).
const filtered = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.trim() !== '') {
    filtered.push(line);
    continue;
  }
  if ((filtered.at(-1) ?? '').trim() === '') continue; // collapse consecutive blanks
  const prevNonBlank = [...filtered].reverse().find((l) => l.trim() !== '') ?? '';
  const nextNonBlank = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
  if (prevNonBlank.startsWith(' ') || nextNonBlank.startsWith(' ')) continue;
  filtered.push(line);
}

const stripped = filtered.join('\n').trim();

const content =
  '// Generated from ../../../../internal-docs/schema.sql. Do not edit by hand.\n' +
  'export const SCHEMA_SQL = `\n' +
  stripped +
  '\n`;\n';

if (check) {
  const current = readFileSync(outPath, 'utf8');
  if (current !== content) {
    console.error('schema.ts is stale — run: npm run generate:schema');
    process.exit(1);
  }
  console.log('schema.ts is up to date');
} else {
  writeFileSync(outPath, content, 'utf8');
  console.log('Generated', outPath);
}
