#!/usr/bin/env bash
# Usage: yarn test:perf:compare [base]   (base defaults to the merge-base with origin/main)
# Everything runs inside main(): checking out the base replaces this file, and
# bash reads a script as it executes it.
set -euo pipefail

START_REF=''
BASE=''
HEAD_SHA=''
REINSTALL=0
HEAD_INSTALL_PENDING=0
FAILED_SIDE=''
GATE_RAN=0

log() {
  echo "perf-compare: $*"
}

install_deps() {
  rm -rf node_modules
  yarn install --frozen-lockfile
}

has_perf_script() {
  git show "$1:package.json" |
    node -e "const p = JSON.parse(require('fs').readFileSync(0, 'utf8'));
             process.exit(p.scripts && p.scripts['test:perf'] ? 0 : 1)"
}

run_side() {
  local side=$1
  shift
  yarn test:perf "$@" 2>&1 | tee ".reassure/$side-run.log"
}

run_failed_cause() {
  if [ ! -f ".reassure/$FAILED_SIDE-run.log" ]; then
    echo 'checkout or install failure'
  elif grep -q 'duplicated names' ".reassure/$FAILED_SIDE-run.log"; then
    echo 'Reassure: records with duplicated names'
  else
    echo 'Jest or Reassure failure'
  fi
}

has_verdict() {
  grep -q '^\*\*Render-perf gate:' .reassure/gate.md 2>/dev/null
}

on_exit() {
  local status=$?
  set +e
  git checkout -q "$START_REF" || status=1
  if [ "$HEAD_INSTALL_PENDING" = 1 ]; then
    if [ -n "${CI:-}" ]; then
      log "not reinstalling the dependencies of $START_REF in CI"
    else
      log "restoring dependencies of $START_REF"
      install_deps || status=1
    fi
  fi
  if [ -n "$FAILED_SIDE" ]; then
    node scripts/perf-gate.js --head "$HEAD_SHA" \
      --run-failed "$FAILED_SIDE: $(run_failed_cause)"
  elif [ "$GATE_RAN" = 1 ] && ! has_verdict; then
    node scripts/perf-gate.js --head "$HEAD_SHA" \
      --run-failed 'gate: perf-gate.js failed'
  fi
  if ! has_verdict; then
    mkdir -p .reassure
    printf '## Render-perf gate\n\n**Render-perf gate: FAIL** (run-failed)\n' >.reassure/gate.md
    cat .reassure/gate.md
    status=1
  fi
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    cat .reassure/gate.md >>"$GITHUB_STEP_SUMMARY"
  fi
  exit "$status"
}

main() {
  cd "$(git rev-parse --show-toplevel)"

  BASE=$(git rev-parse --verify "${1:-$(git merge-base HEAD origin/main)}^{commit}")
  HEAD_SHA=$(git rev-parse HEAD)

  if [ -z "${CI:-}" ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    log 'tracked changes; commit or stash them first' >&2
    return 1
  fi

  rm -rf .reassure
  mkdir -p .reassure

  START_REF=$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)
  trap on_exit EXIT

  local bootstrap_flag=''
  local test_inputs_flag=''
  if ! has_perf_script "$BASE"; then
    bootstrap_flag='--bootstrap'
    log "base $BASE has no test:perf script: measuring head only"
  else
    if [ -n "$(git diff --name-only "$BASE" "$HEAD_SHA" -- '*.perf-test.tsx' jest \
      ':(glob)**/__mocks__/**' jest.config.js babel.config.js)" ]; then
      test_inputs_flag='--test-inputs-changed'
    fi
    if ! git diff --quiet "$BASE" "$HEAD_SHA" -- yarn.lock patches/; then
      REINSTALL=1
      log 'yarn.lock or patches/ differ from base: node_modules is wiped and reinstalled for base, then for head'
    fi
  fi

  if [ -n "${PERF_HEAD_INSTALL:-}" ] && [ "$REINSTALL" = 0 ]; then
    FAILED_SIDE=head
    install_deps
  fi

  if [ -z "$bootstrap_flag" ]; then
    FAILED_SIDE=base
    git checkout -q --detach "$BASE"
    if [ "$REINSTALL" = 1 ]; then
      HEAD_INSTALL_PENDING=1
      install_deps
    fi
    run_side base --baseline

    FAILED_SIDE=head
    git checkout -q "$START_REF"
    if [ "$REINSTALL" = 1 ]; then
      install_deps
      HEAD_INSTALL_PENDING=0
    fi
  fi

  FAILED_SIDE=head
  run_side head
  FAILED_SIDE=''

  GATE_RAN=1
  node scripts/perf-gate.js ${bootstrap_flag:+"$bootstrap_flag"} \
    ${test_inputs_flag:+"$test_inputs_flag"} --head "$HEAD_SHA"
}

main "$@"; exit $?
