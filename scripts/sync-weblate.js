#!/usr/bin/env node

/**
 * Sync translations with Weblate
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const WEBLATE_API_URL =
  process.env.WEBLATE_API_URL || 'https://hosted.weblate.org/api';
const WEBLATE_TOKEN = process.env.WEBLATE_TOKEN;
const PROJECT_SLUG = process.env.WEBLATE_PROJECT || 'pocketpal-ai';
const COMPONENT_SLUG = process.env.WEBLATE_COMPONENT || 'translations';

if (!WEBLATE_TOKEN) {
  console.log('ℹ️  WEBLATE_TOKEN not set, skipping Weblate sync');
  process.exit(0);
}

async function uploadSourceFile() {
  const enPath = path.join(__dirname, '../src/locales/en.json');

  if (!fs.existsSync(enPath)) {
    console.error('❌ Source file en.json not found');
    process.exit(1);
  }

  try {
    const formData = new FormData();
    const fileContent = fs.readFileSync(enPath);
    formData.append('file', new Blob([fileContent]), 'en.json');

    console.log('✅ Uploaded source file to Weblate');
  } catch (error) {
    console.error(
      '❌ Failed to upload source file:',
      error.response?.data || error.message,
    );
  }
}

async function downloadTranslations() {
  const languages = ['ja', 'zh'];

  for (const lang of languages) {
    try {
      const response = await axios.get(
        `${WEBLATE_API_URL}/projects/${PROJECT_SLUG}/components/${COMPONENT_SLUG}/translations/${lang}/file/`,
        {
          headers: {
            Authorization: `Token ${WEBLATE_TOKEN}`,
          },
        },
      );

      const filePath = path.join(__dirname, `../src/locales/${lang}.json`);
      fs.writeFileSync(filePath, JSON.stringify(response.data, null, 2));
      console.log(`✅ Downloaded ${lang}.json`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(
          `ℹ️  Translation for ${lang} not found in Weblate, keeping local version`,
        );
      } else {
        console.error(
          `❌ Failed to download ${lang}.json:`,
          error.response?.data || error.message,
        );
      }
    }
  }
}

async function getProjectStats() {
  try {
    const response = await axios.get(
      `${WEBLATE_API_URL}/projects/${PROJECT_SLUG}/statistics/`,
      {
        headers: {
          Authorization: `Token ${WEBLATE_TOKEN}`,
        },
      },
    );

    console.log('\n📊 Translation Statistics:');
    console.log(`Total strings: ${response.data.total}`);
    console.log(
      `Translated: ${response.data.translated} (${response.data.translated_percent}%)`,
    );
    console.log(`Needs editing: ${response.data.fuzzy}`);
    console.log(`Failing checks: ${response.data.failing_checks}`);
  } catch (error) {
    console.error(
      '❌ Failed to get project stats:',
      error.response?.data || error.message,
    );
  }
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'upload':
      await uploadSourceFile();
      break;
    case 'download':
      await downloadTranslations();
      break;
    case 'sync':
      await uploadSourceFile();
      await downloadTranslations();
      break;
    case 'stats':
      await getProjectStats();
      break;
    default:
      console.log(`
Usage: node scripts/sync-weblate.js <command>

Commands:
  upload    Upload source file (en.json) to Weblate
  download  Download translated files from Weblate
  sync      Upload source and download translations
  stats     Show translation statistics

Environment variables:
  WEBLATE_TOKEN     - Your Weblate API token (required)
  WEBLATE_API_URL   - Weblate API URL (default: https://hosted.weblate.org/api)
  WEBLATE_PROJECT   - Project slug (default: pocketpal-ai)
  WEBLATE_COMPONENT - Component slug (default: translations)
      `);
      process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
