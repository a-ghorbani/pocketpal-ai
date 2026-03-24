#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {createCoverageMap} = require('istanbul-lib-coverage');

const COVERAGE_FILE = path.join(__dirname, '..', 'coverage', 'coverage-final.json');
const MIN_BRANCH_PCT = 61;

function main() {
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error(`Coverage file not found: ${COVERAGE_FILE}`);
    process.exit(1);
  }

  const rawCoverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf-8'));
  const coverageMap = createCoverageMap(rawCoverage);
  const summary = coverageMap.getCoverageSummary().toJSON();
  const branchPct = summary.branches.pct;

  console.log(
    `Local coverage gate: branches ${branchPct}% (required >= ${MIN_BRANCH_PCT}%)`,
  );

  if (branchPct < MIN_BRANCH_PCT) {
    console.error(
      `Local preflight requires branch coverage >= ${MIN_BRANCH_PCT}%, got ${branchPct}%`,
    );
    process.exit(1);
  }
}

main();
