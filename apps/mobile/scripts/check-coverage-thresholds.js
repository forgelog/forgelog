const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const summaryPath = path.join(rootDir, 'coverage', 'coverage-summary.json');

const thresholds = [
  { label: 'global lines', metric: 'lines', min: 70 },
  { label: 'src/db branches', metric: 'branches', min: 68, prefix: 'src/db/' },
  { label: 'src/domain branches', metric: 'branches', min: 86, prefix: 'src/domain/' },
  { label: 'src/application branches', metric: 'branches', min: 80, prefix: 'src/application/' },
  { label: 'src/sync branches', metric: 'branches', min: 90, prefix: 'src/sync/' },
  { label: 'src/validation branches', metric: 'branches', min: 90, prefix: 'src/validation/' },
];

function readSummary() {
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Coverage summary not found at ${summaryPath}. Run Jest with --coverage first.`);
  }
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function relativeCoveragePath(filePath) {
  const normalized = path.isAbsolute(filePath) ? path.relative(rootDir, filePath) : filePath;
  return normalized.split(path.sep).join('/');
}

function aggregate(summary, threshold) {
  if (!threshold.prefix) return summary.total[threshold.metric];

  const result = { total: 0, covered: 0 };
  for (const [filePath, metrics] of Object.entries(summary)) {
    if (filePath === 'total') continue;
    if (!relativeCoveragePath(filePath).startsWith(threshold.prefix)) continue;
    result.total += metrics[threshold.metric].total;
    result.covered += metrics[threshold.metric].covered;
  }
  if (result.total === 0) {
    throw new Error(`No coverage entries matched ${threshold.prefix}`);
  }
  return { ...result, pct: (result.covered / result.total) * 100 };
}

function main() {
  const summary = readSummary();
  const failures = [];

  for (const threshold of thresholds) {
    const metric = aggregate(summary, threshold);
    const pct = metric.pct;
    const message = `${threshold.label}: ${pct.toFixed(2)}% (${metric.covered}/${metric.total}), required >= ${threshold.min}%`;
    console.log(message);
    if (pct < threshold.min) failures.push(message);
  }

  if (failures.length > 0) {
    console.error('\nCoverage thresholds not met:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
}

main();
