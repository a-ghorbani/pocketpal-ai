import {runInAction} from 'mobx';

import {mockCustomToolStore} from '../../../__mocks__/stores/customToolStore';
import type {CustomToolDefinition} from '../../services/customTools/types';

/**
 * The mock store's `okTools` is what component tests see. It drifted from the
 * real getter once already, and nothing read it, so the drift was invisible.
 */
const tool = (
  overrides: Partial<CustomToolDefinition> = {},
): CustomToolDefinition => ({
  id: 'tool-1',
  name: 'get_time',
  description: 'Read the demo server clock',
  parameters: {type: 'object', properties: {}},
  request: {method: 'GET', url: 'http://127.0.0.1:8765/time'},
  timeoutMs: 15000,
  requiresConfirmation: true,
  ...overrides,
});

describe('mockCustomToolStore', () => {
  afterEach(() => {
    runInAction(() => {
      mockCustomToolStore.tools = [];
    });
  });

  it('keeps only the registrable tools in okTools, as the real getter does', () => {
    runInAction(() => {
      mockCustomToolStore.tools = [
        tool(),
        tool({id: 'tool-2', name: 'calculate'}),
      ];
    });

    expect(mockCustomToolStore.okTools.map(entry => entry.id)).toEqual([
      'tool-1',
    ]);
  });
});
