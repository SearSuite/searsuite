import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const coverageFinalPath = join(process.cwd(), 'coverage', 'coverage-final.json');
// Shared Sheet runtime tests run separately in searsuite-test.
const thresholds = {
  branches: 79,
  functions: 80,
  lines: 80,
  statements: 80,
};

function readCoverageFinal() {
  if (!existsSync(coverageFinalPath)) {
    throw new Error('coverage/coverage-final.json not found. Run Jest with --coverage before checking coverage.');
  }
  return JSON.parse(readFileSync(coverageFinalPath, 'utf8'));
}

function percentage(covered, total) {
  return total > 0 ? Math.floor((covered / total) * 10000) / 100 : 100;
}

function createEmptyCounter() {
  return { total: 0, covered: 0, pct: 100 };
}

function summarizeCoverage(coverage) {
  const totals = {
    branches: createEmptyCounter(),
    functions: createEmptyCounter(),
    lines: createEmptyCounter(),
    statements: createEmptyCounter(),
  };

  for (const fileCoverage of Object.values(coverage)) {
    for (const count of Object.values(fileCoverage.s ?? {})) {
      totals.statements.total += 1;
      if (count > 0) totals.statements.covered += 1;
    }

    for (const count of Object.values(fileCoverage.f ?? {})) {
      totals.functions.total += 1;
      if (count > 0) totals.functions.covered += 1;
    }

    for (const branchCounts of Object.values(fileCoverage.b ?? {})) {
      for (const count of branchCounts) {
        totals.branches.total += 1;
        if (count > 0) totals.branches.covered += 1;
      }
    }

    const lineCounts = new Map();
    for (const [statementId, location] of Object.entries(fileCoverage.statementMap ?? {})) {
      const line = location.start.line;
      lineCounts.set(line, Math.max(lineCounts.get(line) ?? 0, fileCoverage.s?.[statementId] ?? 0));
    }
    for (const count of lineCounts.values()) {
      totals.lines.total += 1;
      if (count > 0) totals.lines.covered += 1;
    }
  }

  for (const counter of Object.values(totals)) {
    counter.pct = percentage(counter.covered, counter.total);
  }

  return totals;
}

function main() {
  const total = summarizeCoverage(readCoverageFinal());
  const failures = [];

  for (const [metric, threshold] of Object.entries(thresholds)) {
    const pct = total[metric]?.pct;
    if (typeof pct !== 'number') {
      failures.push(`${metric}: missing from coverage summary`);
    } else if (pct < threshold) {
      failures.push(`${metric}: ${pct}% is below ${threshold}%`);
    }
  }

  if (failures.length) {
    console.error('Coverage check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  const result = Object.entries(thresholds)
    .map(([metric, threshold]) => `${metric} ${total[metric].pct}% >= ${threshold}%`)
    .join(', ');
  console.log(`Coverage check passed: ${result}.`);
}

main();
