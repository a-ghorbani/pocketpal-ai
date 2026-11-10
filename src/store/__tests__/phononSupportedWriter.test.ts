import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '../..');
const ASSIGNMENT = /\bphononSupported\s*=(?!=)/g;

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });

describe('phononSupported writer', () => {
  it('is assigned only by TTSStore.refreshPhononSupport', () => {
    const assignments = sourceFiles(SRC).flatMap(file => {
      const text = fs.readFileSync(file, 'utf8');
      return [...text.matchAll(ASSIGNMENT)].map(match => ({
        file: path.relative(SRC, file),
        index: match.index!,
        text,
      }));
    });

    expect(assignments.map(w => w.file)).toEqual(['store/TTSStore.ts']);

    const [{text, index}] = assignments;
    const methodStart = text.indexOf('async refreshPhononSupport(');
    const methodEnd = text.indexOf('private refreshAfterPhononFailure(');
    expect(methodStart).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(methodStart);
    expect(index).toBeLessThan(methodEnd);
  });
});
