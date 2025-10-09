import {
  CURRENT_CONTEXT_INIT_PARAMS_VERSION,
  createContextInitParams,
  migrateContextInitParams,
  validateContextInitParams,
  createDefaultContextInitParams,
} from '../contextInitParamsVersions';
import {CacheType} from '../types';

describe('contextInitParamsVersions', () => {
  describe('createContextInitParams', () => {
    it('should create ContextInitParams with proper version', () => {
      const params = {
        n_ctx: 1024,
        n_batch: 512,
        n_ubatch: 256,
        n_threads: 4,
        flash_attn: false,
        cache_type_k: CacheType.F16,
        cache_type_v: CacheType.F16,
        n_gpu_layers: 0,
        no_gpu_devices: true,
        use_mlock: false,
        use_mmap: true, // Will be converted to 'true'
      };

      const contextInitParams = createContextInitParams(params);

      expect(contextInitParams.version).toBe(
        CURRENT_CONTEXT_INIT_PARAMS_VERSION,
      );
      expect(contextInitParams.n_ctx).toBe(1024);
      expect(contextInitParams.n_batch).toBe(512);
      expect(contextInitParams.flash_attn).toBe(false);
    });
  });

  describe('migrateContextInitParams', () => {
    it('should add version to settings without version', () => {
      const settings = {
        n_ctx: 1024,
        n_batch: 512,
        n_ubatch: 256,
        n_threads: 4,
        flash_attn: false,
        cache_type_k: CacheType.F16,
        cache_type_v: CacheType.F16,
        n_gpu_layers: 0,
      };

      const migrated = migrateContextInitParams(settings);

      expect(migrated.version).toBe(CURRENT_CONTEXT_INIT_PARAMS_VERSION);
      expect(migrated.n_ctx).toBe(1024);
    });

    it('should migrate n_context to n_ctx', () => {
      const legacySettings = {
        n_context: 2048, // Legacy property name
        n_batch: 512,
        n_ubatch: 256,
        n_threads: 4,
        flash_attn: false,
        cache_type_k: CacheType.F16,
        cache_type_v: CacheType.F16,
        n_gpu_layers: 0,
      };

      const migrated = migrateContextInitParams(legacySettings);

      expect(migrated.n_ctx).toBe(2048);
      expect(migrated).not.toHaveProperty('n_context');
      expect(migrated.version).toBe(CURRENT_CONTEXT_INIT_PARAMS_VERSION);
    });

    it('should add missing optional fields with defaults', () => {
      const incompleteSettings = {
        n_ctx: 1024,
        n_batch: 512,
        n_ubatch: 256,
        n_threads: 4,
        flash_attn: false,
        cache_type_k: CacheType.F16,
        cache_type_v: CacheType.F16,
        n_gpu_layers: 0,
        // Missing use_mlock, use_mmap, no_gpu_devices
      };

      const migrated = migrateContextInitParams(incompleteSettings);

      expect(migrated.use_mlock).toBe(false);
      expect(migrated.use_mmap).toBe('true'); // Default for non-Android platforms
      expect(migrated.no_gpu_devices).toBe(false);
      expect(migrated.version).toBe(CURRENT_CONTEXT_INIT_PARAMS_VERSION);
    });

    it('should not modify already current version settings', () => {
      const currentSettings = {
        version: CURRENT_CONTEXT_INIT_PARAMS_VERSION,
        n_ctx: 1024,
        n_batch: 512,
        n_ubatch: 256,
        n_threads: 4,
        flash_attn: false,
        cache_type_k: CacheType.F16,
        cache_type_v: CacheType.F16,
        n_gpu_layers: 0,
        no_gpu_devices: true,
        use_mlock: false,
        use_mmap: 'true',
      };

      const migrated = migrateContextInitParams(currentSettings);

      expect(migrated).toEqual(currentSettings);
    });

    it('should preserve existing values during migration', () => {
      const settings = {
        n_ctx: 2048,
        n_batch: 1024,
        n_ubatch: 512,
        n_threads: 8,
        flash_attn: true,
        cache_type_k: CacheType.Q8_0,
        cache_type_v: CacheType.Q8_0,
        n_gpu_layers: 32,
        use_mlock: true, // Custom value
        use_mmap: 'false', // Custom value
      };

      const migrated = migrateContextInitParams(settings);

      expect(migrated.n_ctx).toBe(2048);
      expect(migrated.n_batch).toBe(1024);
      expect(migrated.flash_attn).toBe(true);
      expect(migrated.cache_type_k).toBe(CacheType.Q8_0);
      expect(migrated.use_mlock).toBe(true); // Preserved
      expect(migrated.use_mmap).toBe('false'); // Preserved
      expect(migrated.version).toBe(CURRENT_CONTEXT_INIT_PARAMS_VERSION);
    });
  });

  describe('validateContextInitParams', () => {
    it('should validate complete ContextInitParams', () => {
      const validSettings = {
        version: '1.0',
        n_ctx: 1024,
        n_batch: 512,
        n_ubatch: 256,
        n_threads: 4,
        flash_attn: false,
        cache_type_k: CacheType.F16,
        cache_type_v: CacheType.F16,
        n_gpu_layers: 0,
        no_gpu_devices: true,
        use_mlock: false,
        use_mmap: 'true',
      };

      expect(validateContextInitParams(validSettings)).toBe(true);
    });

    it('should reject incomplete ContextInitParams', () => {
      const incompleteSettings = {
        version: '1.0',
        n_ctx: 1024,
        // Missing required fields
      };

      expect(validateContextInitParams(incompleteSettings)).toBe(false);
    });
  });

  describe('createDefaultContextInitParams', () => {
    it('should create valid default ContextInitParams', () => {
      const defaultSettings = createDefaultContextInitParams();

      expect(validateContextInitParams(defaultSettings)).toBe(true);
      expect(defaultSettings.version).toBe(CURRENT_CONTEXT_INIT_PARAMS_VERSION);
      expect(defaultSettings.n_ctx).toBe(1024);
      expect(defaultSettings.n_batch).toBe(512);
      expect(defaultSettings.n_ubatch).toBe(512);
      expect(defaultSettings.n_threads).toBe(4);
      expect(defaultSettings.flash_attn).toBe(false);
      expect(defaultSettings.cache_type_k).toBe('f16');
      expect(defaultSettings.cache_type_v).toBe('f16');
      expect(defaultSettings.n_gpu_layers).toBe(0);
      expect(defaultSettings.no_gpu_devices).toBe(true);
      expect(defaultSettings.use_mlock).toBe(false);
      expect(defaultSettings.use_mmap).toBe('true'); // Default for non-Android platforms
    });
  });
});
