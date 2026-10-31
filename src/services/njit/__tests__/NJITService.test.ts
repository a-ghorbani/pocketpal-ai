import {NJITService} from '../NJITService';
import {NJIT_MAGIC, NJITTensorType} from '../types';

describe('NJITService', () => {
  it('parses valid NJIT binary containers correctly', () => {
    const service = NJITService.getInstance();
    const sampleShard = NJITService.createSampleShard('test-shard', 'mobile-rag', 'Sample Knowledge', 2048, 24, 64);

    const header = service.parseHeader(sampleShard.data);
    expect(header.magic).toBe(NJIT_MAGIC);
    expect(header.seqLen).toBe(2048);
    expect(header.numLayers).toBe(24);
    expect(header.headDim).toBe(64);
    expect(header.tensorType).toBe(NJITTensorType.KV_CACHE_Q8_0);
  });

  it('rejects corrupt headers', () => {
    const service = NJITService.getInstance();
    const badData = new Uint8Array(10);
    expect(() => service.parseHeader(badData)).toThrow('Invalid NJIT container');
  });

  it('registers and executes atomic memory grafting', () => {
    const service = NJITService.getInstance();
    const sampleShard = NJITService.createSampleShard('qwen-doc-1', 'offline-docs', 'Qwen 0.5B Docs', 1024);

    service.registerShard(sampleShard);
    const result = service.graftToContext('qwen-doc-1');

    expect(result.success).toBe(true);
    expect(result.tokensInjected).toBe(1024);
    expect(result.latencyMicroseconds).toBeGreaterThanOrEqual(0);
  });
});

import { SQLiteShardProvider } from '../SQLiteShardProvider';

describe('SQLiteShardProvider (Air-Gapped Local RAG)', () => {
  it('stores and loads shards into NJITService without tool-calling', async () => {
    const provider = new SQLiteShardProvider();
    const service = NJITService.getInstance();

    const sampleShard = NJITService.createSampleShard(
      'ahyeon-profile',
      'kpop-ahyeon',
      'Ahyeon Vocal Stems & Profile',
      1024
    );

    await provider.putShard(sampleShard);
    const loaded = await provider.loadShardToNJIT('ahyeon-profile');
    expect(loaded).toBe(true);

    const grafted = service.graftToContext('ahyeon-profile');
    expect(grafted.success).toBe(true);
    expect(grafted.tokensInjected).toBe(1024);
  });
});
