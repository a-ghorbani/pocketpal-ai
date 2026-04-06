#!/bin/bash
set -euo pipefail

usage() {
  echo "Usage: $0 <commit-sha|owner/repo#sha|npm-version>"
  echo ""
  echo "Examples:"
  echo "  $0 0ee4fe686aacb534cd2759ee09ca382a4cf41624  # git commit (mybigday/llama.rn)"
  echo "  $0 myfork/llama.rn#abc123def                   # fork ref (source build)"
  echo "  $0 0.12.0-rc.3                                  # npm version (prebuilt)"
  exit 1
}

[ $# -ne 1 ] && usage

VERSION_OR_REF="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_JSON="$PROJECT_ROOT/package.json"
GRADLE_PROPS="$PROJECT_ROOT/android/gradle.properties"

# Detect: semver-like = npm, contains "/" = full GitHub ref, otherwise = bare commit hash
if echo "$VERSION_OR_REF" | grep -qE '^[0-9]+\.[0-9]+'; then
  # npm version (e.g., "0.12.0-rc.3")
  echo "Setting llama.rn to npm version: $VERSION_OR_REF"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
    pkg.dependencies['llama.rn'] = '$VERSION_OR_REF';
    fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
  "
  # Comment out rnllamaBuildFromSource
  sed -i '' 's/^rnllamaBuildFromSource=true/# rnllamaBuildFromSource=true/' "$GRADLE_PROPS"
  echo "Disabled rnllamaBuildFromSource in gradle.properties"
  echo ""
  echo "Next steps:"
  echo "  yarn install"
  echo "  cd ios && pod install"
elif echo "$VERSION_OR_REF" | grep -q '/'; then
  # Full GitHub ref (e.g., "myfork/llama.rn#abc123")
  echo "Setting llama.rn to GitHub ref: $VERSION_OR_REF"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
    pkg.dependencies['llama.rn'] = '$VERSION_OR_REF';
    fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
  "
  # Uncomment rnllamaBuildFromSource
  sed -i '' 's/^# rnllamaBuildFromSource=true/rnllamaBuildFromSource=true/' "$GRADLE_PROPS"
  echo "Enabled rnllamaBuildFromSource in gradle.properties"
  echo ""
  echo "Next steps:"
  echo "  yarn install"
  echo "  RNLLAMA_BUILD_FROM_SOURCE=1 pod install --project-directory=ios"
else
  # Bare commit hash — prefix with mybigday/llama.rn#
  echo "Setting llama.rn to git commit: mybigday/llama.rn#$VERSION_OR_REF"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
    pkg.dependencies['llama.rn'] = 'mybigday/llama.rn#$VERSION_OR_REF';
    fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
  "
  # Uncomment rnllamaBuildFromSource
  sed -i '' 's/^# rnllamaBuildFromSource=true/rnllamaBuildFromSource=true/' "$GRADLE_PROPS"
  echo "Enabled rnllamaBuildFromSource in gradle.properties"
  echo ""
  echo "Next steps:"
  echo "  yarn install"
  echo "  RNLLAMA_BUILD_FROM_SOURCE=1 pod install --project-directory=ios"
fi
