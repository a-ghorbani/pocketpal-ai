import * as fs from 'fs';
import * as path from 'path';

import {LLAMARN_ERROR_PATTERNS} from '../../src/utils/llamaRnErrors';

const ROOT = path.join(__dirname, '..', '..');
const LLAMA_RN = path.join(ROOT, 'node_modules', 'llama.rn');
const NATIVE_ROOTS = [
  path.join(LLAMA_RN, 'cpp'),
  path.join(LLAMA_RN, 'vendor', 'llama.cpp', 'common'),
];
const SOURCE_EXT = /\.(c|cpp|h|hpp)$/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(full);
    }
    return SOURCE_EXT.test(entry.name) ? [full] : [];
  });
}

const thrownLiterals = NATIVE_ROOTS.flatMap(sources).flatMap(file =>
  [
    ...fs
      .readFileSync(file, 'utf-8')
      .matchAll(/runtime_error\(\s*"((?:[^"\\]|\\.)*)"/g),
  ].map(match => match[1]),
);

describe('the parse itself', () => {
  it('finds runtime_error literals in the installed llama.rn', () => {
    expect(thrownLiterals.length).toBeGreaterThan(0);
  });

  it('has patterns to check', () => {
    expect(Object.keys(LLAMARN_ERROR_PATTERNS).length).toBeGreaterThan(0);
  });
});

describe('each llama.rn error pattern', () => {
  it.each(Object.entries(LLAMARN_ERROR_PATTERNS))(
    '%s matches a runtime_error the installed llama.rn throws',
    (_key, pattern) => {
      expect(
        thrownLiterals.filter(literal => pattern.test(literal)),
      ).not.toEqual([]);
    },
  );
});
