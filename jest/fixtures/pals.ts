import type {Pal} from '../../src/types/pal';
import type {PalsHubPal} from '../../src/types/palshub';
import {downloadedModel, basicModel} from './models';

// Basic local pal
export const mockLocalPal: Pal = {
  type: 'local',
  id: 'local-pal-1',
  name: 'Test Assistant',
  description: 'A helpful test assistant',
  systemPrompt: 'You are a helpful assistant.',
  originalSystemPrompt: 'You are a helpful assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local pal with model
export const mockLocalPalWithModel: Pal = {
  ...mockLocalPal,
  id: 'local-pal-2',
  name: 'Test Pal with Model',
  defaultModel: downloadedModel,
};

// Local pal with parameters (roleplay)
export const mockRoleplayPal: Pal = {
  type: 'local',
  id: 'roleplay-pal-1',
  name: 'Fantasy Roleplay',
  description: 'A fantasy roleplay character',
  systemPrompt: 'You are a {{aiRole}} in {{world}} at {{location}}.',
  originalSystemPrompt: 'You are a {{aiRole}} in {{world}} at {{location}}.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    world: 'Medieval Kingdom',
    location: 'Castle Throne Room',
    aiRole: 'Wise Wizard',
  },
  parameterSchema: [
    {
      key: 'world',
      type: 'text',
      label: 'World',
      required: true,
      placeholder: 'e.g., Medieval fantasy kingdom',
    },
    {
      key: 'location',
      type: 'text',
      label: 'Location',
      required: true,
      placeholder: 'e.g., Royal castle throne room',
    },
    {
      key: 'aiRole',
      type: 'text',
      label: 'AI Role',
      required: true,
      placeholder: 'e.g., Wise wizard advisor',
    },
  ],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local pal with video capability
export const mockVideoPal: Pal = {
  type: 'local',
  id: 'video-pal-1',
  name: 'Video Assistant',
  description: 'A video-enabled assistant',
  systemPrompt: 'You are a video assistant.',
  originalSystemPrompt: 'You are a video assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    captureInterval: '3000',
  },
  parameterSchema: [
    {
      key: 'captureInterval',
      type: 'text',
      label: 'Capture Interval (ms)',
      required: true,
      placeholder: '3000',
    },
  ],
  capabilities: {
    video: true,
    multimodal: true,
  },
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local pal with AI-generated prompt
export const mockAIPal: Pal = {
  type: 'local',
  id: 'ai-pal-1',
  name: 'AI Generated Pal',
  description: 'A pal with AI-generated system prompt',
  systemPrompt: 'You are a helpful coding assistant.',
  originalSystemPrompt: 'You are a helpful coding assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: true,
  generatingPrompt: 'Create a coding assistant',
  promptGenerationModel: basicModel,
  parameters: {},
  parameterSchema: [],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local pal with custom color
export const mockColoredPal: Pal = {
  ...mockLocalPal,
  id: 'colored-pal-1',
  name: 'Colored Pal',
  color: ['#FF5733', '#C70039'],
};

// Local pal with completion settings
export const mockPalWithSettings: Pal = {
  ...mockLocalPal,
  id: 'pal-with-settings-1',
  name: 'Pal with Settings',
  completionSettings: {
    temperature: 0.8,
    top_p: 0.9,
    max_tokens: 2048,
  },
};

// PalsHub pal (free, public)
export const mockPalsHubPal: PalsHubPal = {
  type: 'palshub',
  id: 'palshub-pal-1',
  title: 'PalsHub Test Pal',
  description: 'A test pal from PalsHub',
  creator_id: 'creator-1',
  protection_level: 'public',
  price_cents: 0,
  system_prompt: 'You are a helpful assistant from PalsHub.',
  thumbnail_url: 'https://example.com/thumb.jpg',
  model_settings: {},
  allow_fork: true,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  creator: {
    id: 'creator-1',
    full_name: 'Test Creator',
    display_name: 'TestCreator',
    provider: 'google',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
  categories: [
    {
      id: 'cat-1',
      name: 'Productivity',
      sort_order: 1,
      created_at: '2023-01-01T00:00:00Z',
    },
  ],
  tags: [
    {
      id: 'tag-1',
      name: 'assistant',
      usage_count: 10,
      created_at: '2023-01-01T00:00:00Z',
    },
  ],
  average_rating: 4.5,
  review_count: 10,
  is_owned: false,
};

// PalsHub pal (premium, not owned)
export const mockPremiumPalsHubPal: PalsHubPal = {
  ...mockPalsHubPal,
  id: 'palshub-pal-2',
  title: 'Premium PalsHub Pal',
  protection_level: 'reveal_on_purchase',
  price_cents: 999,
  is_owned: false,
};

// PalsHub pal (premium, owned)
export const mockOwnedPremiumPal: PalsHubPal = {
  ...mockPremiumPalsHubPal,
  id: 'palshub-pal-3',
  title: 'Owned Premium Pal',
  is_owned: true,
};

// PalsHub pal (private)
export const mockPrivatePalsHubPal: PalsHubPal = {
  ...mockPalsHubPal,
  id: 'palshub-pal-4',
  title: 'Private PalsHub Pal',
  protection_level: 'private',
  is_owned: true,
};

// Partial pal for creation
export const mockNewPalData: Partial<Pal> = {
  type: 'local',
  name: '',
  description: '',
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  source: 'local',
};

// Factory function for creating custom pals
export const createPal = (overrides: Partial<Pal> = {}): Pal => ({
  ...mockLocalPal,
  ...overrides,
});

// Factory function for creating custom PalsHub pals
export const createPalsHubPal = (
  overrides: Partial<PalsHubPal> = {},
): PalsHubPal => ({
  ...mockPalsHubPal,
  ...overrides,
});

export const palsList: Pal[] = [
  mockLocalPal,
  mockLocalPalWithModel,
  mockRoleplayPal,
  mockVideoPal,
  mockAIPal,
  mockColoredPal,
  mockPalWithSettings,
];

export const palsHubPalsList: PalsHubPal[] = [
  mockPalsHubPal,
  mockPremiumPalsHubPal,
  mockOwnedPremiumPal,
  mockPrivatePalsHubPal,
];
