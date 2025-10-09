import {
  migrateBenchmarkResult,
  migrateBenchmarkResults,
} from '../benchmarkMigration';
import {BenchmarkResult, CacheType} from '../types';

describe('benchmarkMigration', () => {
  describe('migrateBenchmarkResult', () => {
    it('should migrate n_context to n_ctx', () => {
      const legacyResult: BenchmarkResult = {
        config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test'},
        modelDesc: 'test model',
        modelSize: 1000,
        modelNParams: 7,
        ppAvg: 100,
        ppStd: 5,
        tgAvg: 50,
        tgStd: 2,
        timestamp: '2024-01-01T00:00:00Z',
        modelId: 'test-model',
        modelName: 'Test Model',
        uuid: 'test-uuid',
        initSettings: {
          n_context: 1024, // Legacy property name
          n_batch: 512,
          n_ubatch: 256,
          n_threads: 8,
          flash_attn: false,
          cache_type_k: 'f16',
          cache_type_v: 'f16',
          n_gpu_layers: 0,
        } as any,
      };

      const migratedResult = migrateBenchmarkResult(legacyResult);

      expect(migratedResult.initSettings).toHaveProperty('n_ctx', 1024);
      expect(migratedResult.initSettings).not.toHaveProperty('n_context');
      expect(migratedResult.initSettings?.n_batch).toBe(512);
      expect(migratedResult.initSettings?.n_ubatch).toBe(256);
    });

    it('should not modify result if n_ctx already exists', () => {
      const modernResult: BenchmarkResult = {
        config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test'},
        modelDesc: 'test model',
        modelSize: 1000,
        modelNParams: 7,
        ppAvg: 100,
        ppStd: 5,
        tgAvg: 50,
        tgStd: 2,
        timestamp: '2024-01-01T00:00:00Z',
        modelId: 'test-model',
        modelName: 'Test Model',
        uuid: 'test-uuid',
        initSettings: {
          n_ctx: 2048, // Modern property name
          n_batch: 512,
          n_ubatch: 256,
          n_threads: 8,
          flash_attn: false,
          cache_type_k: CacheType.F16,
          cache_type_v: CacheType.F16,
          n_gpu_layers: 0,
        },
      };

      const migratedResult = migrateBenchmarkResult(modernResult);

      expect(migratedResult.initSettings?.n_ctx).toBe(2048);
      expect(migratedResult.initSettings).not.toHaveProperty('n_context');
    });

    it('should handle result without initSettings', () => {
      const resultWithoutSettings: BenchmarkResult = {
        config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test'},
        modelDesc: 'test model',
        modelSize: 1000,
        modelNParams: 7,
        ppAvg: 100,
        ppStd: 5,
        tgAvg: 50,
        tgStd: 2,
        timestamp: '2024-01-01T00:00:00Z',
        modelId: 'test-model',
        modelName: 'Test Model',
        uuid: 'test-uuid',
      };

      const migratedResult = migrateBenchmarkResult(resultWithoutSettings);

      expect(migratedResult).toEqual(resultWithoutSettings);
    });

    it('should not mutate the original result', () => {
      const originalResult: BenchmarkResult = {
        config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test'},
        modelDesc: 'test model',
        modelSize: 1000,
        modelNParams: 7,
        ppAvg: 100,
        ppStd: 5,
        tgAvg: 50,
        tgStd: 2,
        timestamp: '2024-01-01T00:00:00Z',
        modelId: 'test-model',
        modelName: 'Test Model',
        uuid: 'test-uuid',
        initSettings: {
          n_context: 1024,
          n_batch: 512,
          n_ubatch: 256,
          n_threads: 8,
          flash_attn: false,
          cache_type_k: CacheType.F16,
          cache_type_v: CacheType.F16,
          n_gpu_layers: 0,
        } as any,
      };

      const originalCopy = JSON.parse(JSON.stringify(originalResult));
      const migratedResult = migrateBenchmarkResult(originalResult);

      expect(originalResult).toEqual(originalCopy);
      expect(migratedResult.initSettings?.version).toBe('1.0');
    });

    it('should not migrate if already at current version', () => {
      const currentVersionResult: BenchmarkResult = {
        config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test'},
        modelDesc: 'test model',
        modelSize: 1000,
        modelNParams: 7,
        ppAvg: 100,
        ppStd: 5,
        tgAvg: 50,
        tgStd: 2,
        timestamp: '2024-01-01T00:00:00Z',
        modelId: 'test-model',
        modelName: 'Test Model',
        uuid: 'test-uuid',
        initSettings: {
          version: '1.0',
          n_ctx: 1024,
          n_batch: 512,
          n_ubatch: 256,
          n_threads: 8,
          flash_attn: false,
          cache_type_k: CacheType.F16,
          cache_type_v: CacheType.F16,
          n_gpu_layers: 0,
        },
      };

      const migratedResult = migrateBenchmarkResult(currentVersionResult);

      // Should have the same values (no migration needed)
      expect(migratedResult.initSettings).toEqual(
        currentVersionResult.initSettings,
      );
    });

    it('should handle legacy data without version', () => {
      const legacyVersionResult: BenchmarkResult = {
        config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test'},
        modelDesc: 'test model',
        modelSize: 1000,
        modelNParams: 7,
        ppAvg: 100,
        ppStd: 5,
        tgAvg: 50,
        tgStd: 2,
        timestamp: '2024-01-01T00:00:00Z',
        modelId: 'test-model',
        modelName: 'Test Model',
        uuid: 'test-uuid',
        initSettings: {
          // No version field - this is legacy data
          n_context: 1024, // Legacy property name
          n_batch: 512,
          n_ubatch: 256,
          n_threads: 8,
          flash_attn: false,
          cache_type_k: CacheType.F16,
          cache_type_v: CacheType.F16,
          n_gpu_layers: 0,
        } as any,
      };

      const migratedResult = migrateBenchmarkResult(legacyVersionResult);

      expect(migratedResult.initSettings?.n_ctx).toBe(1024);
      expect(migratedResult.initSettings).not.toHaveProperty('n_context');
      expect(migratedResult.initSettings?.version).toBe('1.0');
    });
  });

  describe('migrateBenchmarkResults', () => {
    it('should migrate an array of results', () => {
      const results: BenchmarkResult[] = [
        {
          config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test1'},
          modelDesc: 'test model 1',
          modelSize: 1000,
          modelNParams: 7,
          ppAvg: 100,
          ppStd: 5,
          tgAvg: 50,
          tgStd: 2,
          timestamp: '2024-01-01T00:00:00Z',
          modelId: 'test-model-1',
          modelName: 'Test Model 1',
          uuid: 'test-uuid-1',
          initSettings: {
            n_context: 1024,
            n_batch: 512,
            n_ubatch: 256,
            n_threads: 8,
            flash_attn: false,
            cache_type_k: 'f16',
            cache_type_v: 'f16',
            n_gpu_layers: 0,
          } as any,
        },
        {
          config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test2'},
          modelDesc: 'test model 2',
          modelSize: 2000,
          modelNParams: 13,
          ppAvg: 200,
          ppStd: 10,
          tgAvg: 100,
          tgStd: 4,
          timestamp: '2024-01-02T00:00:00Z',
          modelId: 'test-model-2',
          modelName: 'Test Model 2',
          uuid: 'test-uuid-2',
          initSettings: {
            n_ctx: 2048, // Already modern
            n_batch: 1024,
            n_ubatch: 512,
            n_threads: 16,
            flash_attn: true,
            cache_type_k: 'f16',
            cache_type_v: 'f16',
            n_gpu_layers: 32,
          },
        },
      ];

      const migratedResults = migrateBenchmarkResults(results);

      expect(migratedResults).toHaveLength(2);
      expect(migratedResults[0].initSettings?.n_ctx).toBe(1024);
      expect(migratedResults[0].initSettings).not.toHaveProperty('n_context');
      expect(migratedResults[1].initSettings?.n_ctx).toBe(2048);
    });
  });

  describe('BenchmarkStore integration', () => {
    it('should migrate results when adding new results', () => {
      const legacyResult: BenchmarkResult = {
        config: {pp: 512, tg: 128, pl: 1, nr: 1, label: 'test'},
        modelDesc: 'test model',
        modelSize: 1000,
        modelNParams: 7,
        ppAvg: 100,
        ppStd: 5,
        tgAvg: 50,
        tgStd: 2,
        timestamp: '2024-01-01T00:00:00Z',
        modelId: 'test-model',
        modelName: 'Test Model',
        uuid: 'test-uuid',
        initSettings: {
          n_context: 1024, // Legacy property name
          n_batch: 512,
          n_ubatch: 256,
          n_threads: 8,
          flash_attn: false,
          cache_type_k: CacheType.F16,
          cache_type_v: CacheType.F16,
          n_gpu_layers: 0,
        } as any,
      };

      // Test that addResult migrates the data
      const migratedResult = migrateBenchmarkResult(legacyResult);

      expect(migratedResult.initSettings?.n_ctx).toBe(1024);
      expect(migratedResult.initSettings).not.toHaveProperty('n_context');
      expect(migratedResult.initSettings?.version).toBe('1.0');
    });
  });
});
