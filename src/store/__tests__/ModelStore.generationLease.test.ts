jest.unmock('../../store');

import {runInAction} from 'mobx';
import {LlamaContext} from 'llama.rn';

import {modelStore} from '..';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {basicModel} from '../../../jest/fixtures/models';

jest.mock('../../utils/deviceCapabilities', () => ({
  ...jest.requireActual('../../utils/deviceCapabilities'),
  getCpuCoreCount: jest.fn().mockResolvedValue(8),
  getRecommendedThreadCount: jest.fn().mockResolvedValue(6),
  checkGpuSupport: jest.fn().mockResolvedValue({isSupported: false}),
  isHighEndDevice: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../services/downloads', () => ({
  DownloadCancelledError: class extends Error {},
  downloadManager: {
    isDownloading: jest.fn().mockReturnValue(false),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    setCallbacks: jest.fn(),
    syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));

const flush = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const waitUntil = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  expect(condition()).toBe(true);
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return {promise, resolve};
}

function loadFakeModel({multimodal = false} = {}) {
  const context = {
    id: 1,
    release: jest.fn().mockResolvedValue(undefined),
    releaseMultimodal: jest.fn().mockResolvedValue(undefined),
    stopCompletion: jest.fn().mockResolvedValue(undefined),
    completion: jest.fn(),
    isMultimodalEnabled: jest.fn().mockResolvedValue(multimodal),
  };
  const engine = {
    completion: jest.fn(),
    stopCompletion: jest.fn().mockResolvedValue(undefined),
  };
  runInAction(() => {
    modelStore.context = context as unknown as LlamaContext;
    modelStore.engine = engine;
    modelStore.isMultimodalActive = multimodal;
  });
  return {context, engine};
}

describe('ModelStore generation lease', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      modelStore.models = [];
      modelStore.activeModelId = undefined;
      modelStore.context = undefined;
      modelStore.engine = undefined;
      modelStore.isMultimodalActive = false;
      modelStore.inferencing = false;
      modelStore.isStreaming = false;
    });
  });

  afterEach(async () => {
    modelStore.abortActiveGeneration();
    await modelStore.releaseContext(true);
  });

  it('grants nothing without a loaded model', async () => {
    expect(await modelStore.acquireGeneration()).toBeNull();
    expect(modelStore.tryAcquireGeneration()).toBeNull();
  });

  it('release aborts the held lease and frees the context only after it ends', async () => {
    const {context} = loadFakeModel();
    const lease = await modelStore.acquireGeneration();
    expect(lease).not.toBeNull();

    const releasing = modelStore.releaseContext();
    await flush();

    expect(lease!.signal.aborted).toBe(true);
    expect(context.release).not.toHaveBeenCalled();
    expect(context.stopCompletion).not.toHaveBeenCalled();

    lease!.end();
    await releasing;
    expect(context.release).toHaveBeenCalledTimes(1);
    expect(modelStore.engine).toBeUndefined();
  });

  it('grants no lease while a release is between abort and free', async () => {
    loadFakeModel();
    const lease = await modelStore.acquireGeneration();
    const releasing = modelStore.releaseContext();
    await flush();

    lease!.end();
    expect(modelStore.tryAcquireGeneration()).toBeNull();
    await releasing;
  });

  it('a send waiting during an unload resolves null once the release is done', async () => {
    const {context} = loadFakeModel();
    const lease1 = await modelStore.acquireGeneration();
    const order: string[] = [];
    context.release.mockImplementation(async () => {
      order.push('release');
    });

    const send2 = modelStore.acquireGeneration().then(lease => {
      order.push('send2');
      return lease;
    });
    const unloading = modelStore.manualReleaseContext();
    await waitUntil(() => lease1!.signal.aborted);
    lease1!.end();

    expect(await send2).toBeNull();
    await unloading;
    expect(order).toEqual(['release', 'send2']);
  });

  it('a send waiting during a model switch gets a lease on the new model', async () => {
    const {context: oldContext, engine: oldEngine} = loadFakeModel();
    const lease1 = await modelStore.acquireGeneration();
    const {initLlama} = require('llama.rn');
    (initLlama as jest.Mock).mockReset();
    (initLlama as jest.Mock).mockResolvedValue({
      id: 2,
      release: jest.fn().mockResolvedValue(undefined),
      isMultimodalEnabled: jest.fn().mockResolvedValue(false),
    });

    const send2 = modelStore.acquireGeneration();
    const switching = modelStore.initContext(basicModel);
    await waitUntil(() => lease1!.signal.aborted);
    expect(oldContext.release).not.toHaveBeenCalled();
    lease1!.end();

    const lease2 = await send2;
    await switching;
    expect(oldContext.release).toHaveBeenCalledTimes(1);
    expect(lease2).not.toBeNull();
    expect(lease2!.engine).not.toBe(oldEngine);
    expect(lease2!.engine).toBe(modelStore.engine);
    lease2!.end();
  });

  it('a lease holder never waits on the context mutex, so a queued release completes', async () => {
    const {context} = loadFakeModel();
    const lease = await modelStore.acquireGeneration();
    const releasing = modelStore.releaseContext();
    await waitUntil(() => lease!.signal.aborted);

    modelStore.reprobeRemoteCapsAfterCompletion();
    lease!.end();

    await releasing;
    expect(context.release).toHaveBeenCalledTimes(1);
  });

  describe('VideoPal image completion', () => {
    it('skips frames while a completion holds the lease, stops it on abort, and release waits only for it', async () => {
      const {context} = loadFakeModel({multimodal: true});
      const firstFrame = deferred<{text: string}>();
      context.completion.mockReturnValueOnce(firstFrame.promise);
      const onComplete = jest.fn();

      const running = modelStore.startImageCompletion({
        prompt: 'what is this?',
        image_path: '/frame1.jpg',
        onComplete,
      });
      await waitUntil(() => context.completion.mock.calls.length === 1);
      expect(modelStore.inferencing).toBe(true);

      await modelStore.startImageCompletion({
        prompt: 'what is this?',
        image_path: '/frame2.jpg',
      });
      expect(context.completion).toHaveBeenCalledTimes(1);

      modelStore.abortActiveGeneration();
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(context.stopCompletion).toHaveBeenCalledTimes(1);

      const releasing = modelStore.releaseContext();
      await flush();
      expect(context.release).not.toHaveBeenCalled();

      firstFrame.resolve({text: 'a cat'});
      await running;
      await releasing;
      expect(onComplete).toHaveBeenCalledWith('a cat');
      expect(modelStore.inferencing).toBe(false);
      expect(context.releaseMultimodal).toHaveBeenCalledTimes(1);
      expect(context.release).toHaveBeenCalledTimes(1);
    });

    it('skips the completion when the lease is aborted while settings load', async () => {
      const {context} = loadFakeModel({multimodal: true});
      const settings = deferred<any>();
      jest
        .spyOn(chatSessionRepository, 'getGlobalCompletionSettings')
        .mockReturnValueOnce(settings.promise);

      const running = modelStore.startImageCompletion({
        prompt: 'what is this?',
        image_path: '/frame1.jpg',
      });
      await flush();
      modelStore.abortActiveGeneration();
      settings.resolve({});
      await running;

      expect(context.completion).not.toHaveBeenCalled();
      expect(context.stopCompletion).not.toHaveBeenCalled();
      expect(modelStore.inferencing).toBe(false);
      const next = modelStore.tryAcquireGeneration();
      expect(next).not.toBeNull();
      next?.end();
    });

    it.each([
      [
        'throws synchronously',
        () => {
          throw new Error('Context not found');
        },
      ],
      ['returns undefined', () => undefined],
    ])(
      'an abort whose stopCompletion %s does not throw, and the completion still settles',
      async (_label, stop) => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const {context} = loadFakeModel({multimodal: true});
        context.stopCompletion.mockImplementation(stop);
        const frame = deferred<{text: string}>();
        context.completion.mockReturnValueOnce(frame.promise);
        const onComplete = jest.fn();

        const running = modelStore.startImageCompletion({
          prompt: 'what is this?',
          image_path: '/frame1.jpg',
          onComplete,
        });
        await waitUntil(() => context.completion.mock.calls.length === 1);

        expect(() => modelStore.abortActiveGeneration()).not.toThrow();
        frame.resolve({text: 'a cat'});
        await running;

        expect(context.stopCompletion).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledWith('a cat');
        expect(modelStore.inferencing).toBe(false);
        warn.mockRestore();
      },
    );
  });
});
