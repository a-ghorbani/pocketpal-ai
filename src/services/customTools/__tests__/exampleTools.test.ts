import fs from 'fs';
import path from 'path';

import {isNonLoopback} from '../toolStatus';
import type {CustomToolDefinition} from '../types';

// The shared async-storage mock resolves its own import back through
// moduleNameMapper, so its default export is undefined.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {getItem: jest.fn(), setItem: jest.fn()},
}));

import {CustomToolStore} from '../../../store/CustomToolStore';

const examplePath = path.join(
  __dirname,
  '../../../../docs/custom-tools/example-tools.json',
);

describe('docs/custom-tools/example-tools.json', () => {
  const file = JSON.parse(fs.readFileSync(examplePath, 'utf8'));

  it('imports with zero rejections', () => {
    const store = new CustomToolStore();
    const report = store.importTools(file);

    expect(report.rejected).toEqual([]);
    expect(report.imported).toHaveLength(file.tools.length);
    expect(report.imported.map(tool => tool.name).sort()).toEqual([
      'add_note',
      'get_time',
    ]);
  });

  it('points every tool at loopback only', () => {
    const store = new CustomToolStore();
    for (const tool of store.importTools(file).imported) {
      expect(isNonLoopback(tool as CustomToolDefinition)).toBe(false);
    }
  });

  it('ships with confirmation on, whatever the file asked for', () => {
    const store = new CustomToolStore();
    for (const tool of store.importTools(file).imported) {
      expect(tool.requiresConfirmation).toBe(true);
    }
  });
});
