#!/usr/bin/env node
'use strict';

const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const sqlPath = resolve(__dirname, '../../../internal-docs/schema.sql');
const outPath = resolve(__dirname, '../src/db/schema.ts');
const check = process.argv.includes('--check');

const sql = readFileSync(sqlPath, 'utf8').trimEnd();

const content = [
  '// Generated from ../../../../internal-docs/schema.sql. Do not edit by hand.',
  `export const SCHEMA_SQL = ${JSON.stringify(sql)};`,
  '',
].join('\n');

if (check) {
  const current = readFileSync(outPath, 'utf8');
  if (current !== content) {
    console.error('schema.ts is stale. Run: npm run generate:schema');
    process.exit(1);
  }
  console.log('schema.ts is up to date');
} else {
  writeFileSync(outPath, content, 'utf8');
  console.log('Generated', outPath);
}
