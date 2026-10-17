import {runInAction} from 'mobx';
import {LlamaContext} from 'llama.rn';

import {modelStore} from '../../store';
import {documentCountingOptions} from '../documentCounting';

describe('documentCountingOptions', () => {
  afterEach(() => {
    runInAction(() => {
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
    });
  });

  it('is undefined without a local context (remote model)', () => {
    runInAction(() => {
      modelStore.activeModelId = 'remote-model';
    });
    expect(documentCountingOptions()).toBeUndefined();
  });

  it('counts with the loaded context for the active model', async () => {
    const context = new (LlamaContext as any)({contextId: 1});
    context.tokenize.mockResolvedValue({tokens: [1, 2, 3], has_media: false});
    runInAction(() => {
      modelStore.context = context;
      modelStore.activeModelId = 'local-model';
    });

    const counting = documentCountingOptions();

    expect(counting?.modelId).toBe('local-model');
    expect(await counting?.tokenize('abc')).toBe(3);
    expect(context.tokenize).toHaveBeenCalledWith('abc');
  });
});
