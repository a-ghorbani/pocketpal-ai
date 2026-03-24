#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_LOCALES_DIR = path.join(__dirname, '../src/locales');

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

function validateL10n(options = {}) {
  const localesDir = options.localesDir || DEFAULT_LOCALES_DIR;
  const logger = options.logger || console;
  const enPath = path.join(localesDir, 'en.json');
  let errors = 0;

  let en;
  try {
    en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    logger.log('en.json: valid JSON');
  } catch (e) {
    logger.error('en.json: INVALID JSON:', e);
    return 1;
  }

  const enKeys = getKeys(en);
  logger.log(`en.json: ${enKeys.length} keys`);

  let langFiles;
  const indexPath = path.join(localesDir, 'index.ts');
  if (fs.existsSync(indexPath)) {
    const indexSrc = fs.readFileSync(indexPath, 'utf-8');
    const registryMatch = indexSrc.match(
      /const languageRegistry\s*=\s*\{([\s\S]*?)\}\s*(?:as const|;)/,
    );
    if (registryMatch) {
      langFiles = [...registryMatch[1].matchAll(/^\s*(\w+)\s*:/gm)]
        .map(m => m[1])
        .filter(l => l !== 'en');
    }
  }
  if (!langFiles) {
    langFiles = fs
      .readdirSync(localesDir)
      .filter(f => f.endsWith('.json') && f !== 'en.json')
      .map(f => f.replace('.json', ''));
  }

  for (const lang of langFiles) {
    const langPath = path.join(localesDir, `${lang}.json`);
    let langData;

    try {
      langData = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
      logger.log(`${lang}.json: valid JSON`);
    } catch (e) {
      logger.error(`${lang}.json: INVALID JSON:`, e);
      errors++;
      continue;
    }

    const langKeys = getKeys(langData);
    const missingKeys = enKeys.filter(k => !langKeys.includes(k));
    if (missingKeys.length > 0) {
      logger.warn(
        `${lang}.json: ${missingKeys.length} missing keys (will fall back to English)`,
      );
    }

    for (const key of langKeys) {
      const enValue = getValueAtPath(en, key);
      const langValue = getValueAtPath(langData, key);

      if (typeof enValue === 'string' && typeof langValue === 'string') {
        const enPlaceholders = getPlaceholders(enValue);
        const langPlaceholders = getPlaceholders(langValue);

        if (
          JSON.stringify(enPlaceholders) !== JSON.stringify(langPlaceholders)
        ) {
          logger.error(
            `${lang}.json: placeholder mismatch at "${key}": ` +
              `en has [${enPlaceholders.join(', ')}] but ${lang} has [${langPlaceholders.join(', ')}]`,
          );
          errors++;
        }
      }
    }
  }

  if (errors > 0) {
    logger.error(`\nValidation failed with ${errors} error(s)`);
    return 1;
  }

  logger.log('\nAll l10n files valid');
  return 0;
}

if (require.main === module) {
  process.exit(validateL10n());
}

module.exports = {
  validateL10n,
  getKeys,
  getPlaceholders,
  getValueAtPath,
};
