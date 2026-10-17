#!/usr/bin/env bash
# Usage: yarn test:perf:compare [base]   (base defaults to the merge-base with origin/main)
# Everything runs inside main(): checking out the base replaces this file, and
# bash reads a script as it executes it.
set -euo pipefail

START_REF=''
BASE=''
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

run_failed_line() {
  local cause='Jest or Reassure failure'
  if grep -q 'duplicated names' ".reassure/$FAILED_SIDE-run.log" 2>/dev/null; then
    cause='Reassure: records with duplicated names'
  fi
  echo "run-failed on $FAILED_SIDE ($cause), see job log"
}

write_summary() {
  if [ -f .reassure/output.md ]; then
    cat .reassure/output.md >>"$GITHUB_STEP_SUMMARY"
  fi
  if [ "$GATE_RAN" = 1 ]; then
    cat .reassure/gate.md >>"$GITHUB_STEP_SUMMARY"
  elif [ -n "$FAILED_SIDE" ]; then
    run_failed_line >>"$GITHUB_STEP_SUMMARY"
  fi
}

on_exit() {
  local status=$?
  set +e
  git checkout -q "$START_REF" || status=1
  if [ "$HEAD_INSTALL_PENDING" = 1 ]; then
    log "restoring dependencies of $START_REF"
    install_deps || status=1
  fi
  if [ -n "$FAILED_SIDE" ]; then
    log "$(run_failed_line)"
  fi
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    write_summary
  fi
  exit "$status"
}

main() {
  cd "$(git rev-parse --show-toplevel)"

  BASE=$(git rev-parse --verify "${1:-$(git merge-base HEAD origin/main)}^{commit}")
  local head_sha
  head_sha=$(git rev-parse HEAD)

  rm -rf .reassure
  mkdir -p .reassure

  if [ -z "${CI:-}" ] && [ -n "$(git status --porcelain)" ]; then
    log 'the working tree has changes; commit or stash them first' >&2
    return 1
  fi

  START_REF=$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)
  trap on_exit EXIT

  local bootstrap=0
  if ! has_perf_script "$BASE"; then
    bootstrap=1
    log "base $BASE has no test:perf script: measuring head only"
  elif ! git diff --quiet "$BASE" "$head_sha" -- yarn.lock patches/; then
    REINSTALL=1
    log 'yarn.lock or patches/ differ from base: node_modules is wiped and reinstalled for base, then for head'
  fi

  if [ -n "${PERF_HEAD_INSTALL:-}" ] && [ "$REINSTALL" = 0 ]; then
    install_deps
  fi

  if [ "$bootstrap" = 0 ]; then
    git checkout -q --detach "$BASE"
    if [ "$REINSTALL" = 1 ]; then
      HEAD_INSTALL_PENDING=1
      install_deps
    fi
    FAILED_SIDE=base
    run_side base --baseline
    FAILED_SIDE=''

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
  if [ "$bootstrap" = 1 ]; then
    node scripts/perf-gate.js --bootstrap | tee .reassure/gate.md
  else
    node scripts/perf-gate.js | tee .reassure/gate.md
  fi
}

main "$@"; exit $?
