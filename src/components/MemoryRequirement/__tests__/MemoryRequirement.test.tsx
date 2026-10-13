import React from 'react';
import {runInAction} from 'mobx';

import {render} from '../../../../jest/test-utils';
import {basicModel} from '../../../../jest/fixtures/models';

import {modelStore} from '../../../store';
import {formatBytes} from '../../../utils';
import {getModelMemoryRequirement} from '../../../utils/memoryEstimator';
import {Model} from '../../../utils/types';

import {MemoryRequirement} from '../MemoryRequirement';

const swaModel: Model = {
  ...basicModel,
  size: 806 * 1e6,
  ggufMetadata: {
    architecture: 'gemma3',
    n_layers: 26,
    n_embd: 1152,
    n_head: 4,
    n_head_kv: 1,
    n_vocab: 262144,
    n_embd_head_k: 256,
    n_embd_head_v: 256,
    sliding_window: 512,
  },
};

describe('MemoryRequirement', () => {
  afterEach(() => {
    runInAction(() => {
      modelStore.deviceTier = null;
    });
  });

  it('shows the estimate including the tier checkpoint budget for an SWA model', () => {
    runInAction(() => {
      modelStore.deviceTier = 'low';
    });
    const withBudget = formatBytes(
      getModelMemoryRequirement(
        swaModel,
        undefined,
        modelStore.memoryEstimateSettings,
      ),
      1,
    );
    const withoutBudget = formatBytes(
      getModelMemoryRequirement(swaModel, undefined, {
        ...modelStore.contextInitParams,
        state_cache_budget_mb: 0,
      }),
      1,
    );

    const {getByTestId} = render(<MemoryRequirement model={swaModel} />);

    expect(withBudget).not.toBe(withoutBudget);
    expect(getByTestId('memory-requirement')).toHaveTextContent(withBudget, {
      exact: false,
    });
  });
});
