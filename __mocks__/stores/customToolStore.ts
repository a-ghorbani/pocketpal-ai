import {makeAutoObservable} from 'mobx';

import {toolStatus} from '../../src/services/customTools/toolStatus';
import type {CustomToolDefinition} from '../../src/services/customTools/types';

class MockCustomToolStore {
  tools: CustomToolDefinition[] = [];

  addTool: jest.Mock;
  updateTool: jest.Mock;
  removeTool: jest.Mock;
  importTools: jest.Mock;
  exportTools: jest.Mock;
  setSecrets: jest.Mock;
  getSecrets: jest.Mock;
  getSecretNames: jest.Mock;

  constructor() {
    // These stay out of the annotation: makeAutoObservable would wrap a
    // jest.fn() class field into an action and it would stop being a mock.
    makeAutoObservable(this, {
      addTool: false,
      updateTool: false,
      removeTool: false,
      importTools: false,
      exportTools: false,
      setSecrets: false,
      getSecrets: false,
      getSecretNames: false,
    });

    this.addTool = jest.fn();
    this.updateTool = jest.fn();
    this.removeTool = jest.fn().mockResolvedValue(undefined);
    this.importTools = jest.fn().mockReturnValue({imported: [], rejected: []});
    this.exportTools = jest.fn().mockReturnValue({version: 1, tools: []});
    this.setSecrets = jest.fn().mockResolvedValue(true);
    this.getSecrets = jest.fn().mockResolvedValue({});
    this.getSecretNames = jest.fn().mockResolvedValue([]);
  }

  get toolCount(): number {
    return this.tools.length;
  }

  get okTools(): CustomToolDefinition[] {
    return this.tools.filter(
      tool => toolStatus(tool, this.tools).kind === 'ok',
    );
  }

  peerNamesExcluding(id?: string): string[] {
    return this.tools.filter(tool => tool.id !== id).map(tool => tool.name);
  }
}

export const mockCustomToolStore = new MockCustomToolStore();
