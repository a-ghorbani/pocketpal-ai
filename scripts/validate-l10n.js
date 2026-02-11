#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../src/locales');
const EN_PATH = path.join(LOCALES_DIR, 'en.json');

function getKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys.push(...getKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getPlaceholders(str) {
  const matches = str.match(/\{\{(\w+)\}\}/g) || [];
  return matches.sort();
}

function getValueAtPath(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => o && o[k], obj);
}

let errors = 0;

// 1. Validate JSON parsing
let en;
try {
  en = JSON.parse(fs.readFileSync(EN_PATH, 'utf-8'));
  console.log('en.json: valid JSON');
} catch (e) {
  console.error('en.json: INVALID JSON:', e);
  process.exit(1);
}

const enKeys = getKeys(en);
console.log(`en.json: ${enKeys.length} keys`);

for (const lang of ['ja', 'zh']) {
  const langPath = path.join(LOCALES_DIR, `${lang}.json`);
  let langData;

  try {
    langData = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
    console.log(`${lang}.json: valid JSON`);
  } catch (e) {
    console.error(`${lang}.json: INVALID JSON:`, e);
    errors++;
    continue;
  }

  const langKeys = getKeys(langData);

  // 2. Check missing keys (warnings, not errors - fallback handles them)
  const missingKeys = enKeys.filter(k => !langKeys.includes(k));
  if (missingKeys.length > 0) {
    console.warn(
      `${lang}.json: ${missingKeys.length} missing keys (will fall back to English)`,
    );
  }

  // 3. Check placeholder consistency (errors - mismatched placeholders are bugs)
  for (const key of langKeys) {
    const enValue = getValueAtPath(en, key);
    const langValue = getValueAtPath(langData, key);

    if (typeof enValue === 'string' && typeof langValue === 'string') {
      const enPlaceholders = getPlaceholders(enValue);
      const langPlaceholders = getPlaceholders(langValue);

      if (
        JSON.stringify(enPlaceholders) !== JSON.stringify(langPlaceholders)
      ) {
        console.error(
          `${lang}.json: placeholder mismatch at "${key}": ` +
            `en has [${enPlaceholders.join(', ')}] but ${lang} has [${langPlaceholders.join(', ')}]`,
        );
        errors++;
      }
    }
  }
}

if (errors > 0) {
  console.error(`\nValidation failed with ${errors} error(s)`);
  process.exit(1);
} else {
  console.log('\nAll l10n files valid');
}
