import {isLocalPal, isPalsHubPal, handlePalByType} from '../pal-type-guards';
import type {Pal} from '../../types/pal';
import type {PalsHubPal} from '../../types/palshub';

describe('pal-type-guards', () => {
  const mockLocalPal: Pal = {
    type: 'local',
    id: 'local-pal-1',
    name: 'Test Local Pal',
    systemPrompt: 'You are a helpful assistant',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'local',
  };

  const mockPalsHubPal: PalsHubPal = {
    type: 'palshub',
    id: 'palshub-pal-1',
    title: 'Test PalsHub Pal',
    description: 'A test pal from PalsHub',
    creator: {
      id: 'creator-1',
      full_name: 'Test Creator',
      provider: '',
      created_at: '',
      updated_at: '',
    },
    protection_level: 'public',
    price_cents: 0,
    allow_fork: true,
    review_count: 0,
    is_owned: false,
    categories: [],
    tags: [],
    creator_id: '',
    created_at: '',
    updated_at: '',
  };

  describe('isLocalPal', () => {
    it('should return true for local pals', () => {
      expect(isLocalPal(mockLocalPal)).toBe(true);
    });

    it('should return false for PalsHub pals', () => {
      expect(isLocalPal(mockPalsHubPal)).toBe(false);
    });
  });

  describe('isPalsHubPal', () => {
    it('should return true for PalsHub pals', () => {
      expect(isPalsHubPal(mockPalsHubPal)).toBe(true);
    });

    it('should return false for local pals', () => {
      expect(isPalsHubPal(mockLocalPal)).toBe(false);
    });
  });

  describe('handlePalByType', () => {
    it('should call onLocalPal handler for local pals', () => {
      const handlers = {
        onLocalPal: jest.fn(),
        onPalsHubPal: jest.fn(),
      };

      handlePalByType(mockLocalPal, handlers);

      expect(handlers.onLocalPal).toHaveBeenCalledWith(mockLocalPal);
      expect(handlers.onPalsHubPal).not.toHaveBeenCalled();
    });

    it('should call onPalsHubPal handler for PalsHub pals', () => {
      const handlers = {
        onLocalPal: jest.fn(),
        onPalsHubPal: jest.fn(),
      };

      handlePalByType(mockPalsHubPal, handlers);

      expect(handlers.onPalsHubPal).toHaveBeenCalledWith(mockPalsHubPal);
      expect(handlers.onLocalPal).not.toHaveBeenCalled();
    });

    it('should log warning for unknown pal types', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const handlers = {
        onLocalPal: jest.fn(),
        onPalsHubPal: jest.fn(),
      };

      // Create a pal with invalid type
      const invalidPal = {...mockLocalPal, type: 'invalid'} as any;

      handlePalByType(invalidPal, handlers);

      expect(consoleSpy).toHaveBeenCalledWith('Unknown pal type:', invalidPal);
      expect(handlers.onLocalPal).not.toHaveBeenCalled();
      expect(handlers.onPalsHubPal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
