import {Database} from '@nozbe/watermelondb';
import {Q} from '@nozbe/watermelondb/QueryDescription';

// Mock models
class ChatSession {
  static table = 'chat_sessions';
  static associations = {
    messages: {type: 'has_many', foreignKey: 'session_id'},
    completion_settings: {type: 'has_many', foreignKey: 'session_id'},
  };
}

class Message {
  static table = 'messages';
  static associations = {
    chat_sessions: {type: 'belongs_to', key: 'session_id'},
  };
}

class CompletionSetting {
  static table = 'completion_settings';
  static associations = {
    chat_sessions: {type: 'belongs_to', key: 'session_id'},
  };
}

class GlobalSetting {
  static table = 'global_settings';
}

class LocalPal {
  static table = 'local_pals';

  constructor() {
    this.id = 'mock-pal-id';
    this.name = 'Mock Pal';
    this.description = 'A mock pal for testing';
    this.thumbnailUrl = null;
    this.systemPrompt = 'You are a helpful assistant.';
    this.originalSystemPrompt = null;
    this.isSystemPromptChanged = false;
    this.useAIPrompt = false;
    this.defaultModel = null;
    this.promptGenerationModel = null;
    this.generatingPrompt = null;
    this.color = null;
    this.capabilities = '{}';
    this.parameters = '{}';
    this.parameterSchema = '[]';
    this.source = 'local';
    this.palshubId = null;
    this.creatorInfo = null;
    this.categories = '[]';
    this.tags = '[]';
    this.rating = null;
    this.reviewCount = null;
    this.protectionLevel = null;
    this.priceCents = null;
    this.isOwned = null;
    this.generationSettings = null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Static helper methods
  static safeStringify(value) {
    if (value === null || value === undefined) {
      return undefined;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '{}';
    }
  }

  static safeStringifyArray(value) {
    try {
      return JSON.stringify(value || []);
    } catch {
      return '[]';
    }
  }

  // Mock the toPal method
  toPal() {
    return {
      type: 'local',
      id: this.id,
      name: this.name,
      description: this.description,
      thumbnail_url: this.thumbnailUrl,
      systemPrompt: this.systemPrompt,
      originalSystemPrompt: this.originalSystemPrompt,
      isSystemPromptChanged: this.isSystemPromptChanged,
      useAIPrompt: this.useAIPrompt,
      defaultModel: this.defaultModel
        ? JSON.parse(this.defaultModel)
        : undefined,
      promptGenerationModel: this.promptGenerationModel
        ? JSON.parse(this.promptGenerationModel)
        : undefined,
      generatingPrompt: this.generatingPrompt,
      color: this.color ? JSON.parse(this.color) : undefined,
      capabilities: JSON.parse(this.capabilities || '{}'),
      parameters: JSON.parse(this.parameters || '{}'),
      parameterSchema: JSON.parse(this.parameterSchema || '[]'),
      source: this.source,
      palshub_id: this.palshubId,
      creator_info: this.creatorInfo ? JSON.parse(this.creatorInfo) : undefined,
      categories: JSON.parse(this.categories || '[]'),
      tags: JSON.parse(this.tags || '[]'),
      rating: this.rating,
      review_count: this.reviewCount,
      protection_level: this.protectionLevel,
      price_cents: this.priceCents,
      is_owned: this.isOwned,
      generation_settings: this.generationSettings
        ? JSON.parse(this.generationSettings)
        : undefined,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }
}

// Mock schema
const schema = {
  version: 1,
  tables: [
    {
      name: 'chat_sessions',
      columns: [
        {name: 'title', type: 'string'},
        {name: 'date', type: 'string'},
        {name: 'active_pal_id', type: 'string', isOptional: true},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    },
    {
      name: 'messages',
      columns: [
        {name: 'session_id', type: 'string', isIndexed: true},
        {name: 'author', type: 'string'},
        {name: 'text', type: 'string', isOptional: true},
        {name: 'type', type: 'string'},
        {name: 'created_at', type: 'number'},
        {name: 'metadata', type: 'string'},
        {name: 'position', type: 'number'},
      ],
    },
    {
      name: 'completion_settings',
      columns: [
        {name: 'session_id', type: 'string', isIndexed: true},
        {name: 'settings', type: 'string'},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    },
    {
      name: 'global_settings',
      columns: [
        {name: 'key', type: 'string', isIndexed: true},
        {name: 'value', type: 'string'},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    },
    {
      name: 'local_pals',
      columns: [
        {name: 'name', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'thumbnail_url', type: 'string', isOptional: true},
        {name: 'system_prompt', type: 'string'},
        {name: 'original_system_prompt', type: 'string', isOptional: true},
        {name: 'is_system_prompt_changed', type: 'boolean'},
        {name: 'use_ai_prompt', type: 'boolean'},
        {name: 'default_model', type: 'string', isOptional: true},
        {name: 'prompt_generation_model', type: 'string', isOptional: true},
        {name: 'generating_prompt', type: 'string', isOptional: true},
        {name: 'color', type: 'string', isOptional: true},
        {name: 'capabilities', type: 'string'},
        {name: 'parameters', type: 'string'},
        {name: 'parameter_schema', type: 'string'},
        {name: 'source', type: 'string'},
        {name: 'palshub_id', type: 'string', isOptional: true},
        {name: 'creator_info', type: 'string', isOptional: true},
        {name: 'categories', type: 'string', isOptional: true},
        {name: 'tags', type: 'string', isOptional: true},
        {name: 'rating', type: 'number', isOptional: true},
        {name: 'review_count', type: 'number', isOptional: true},
        {name: 'protection_level', type: 'string', isOptional: true},
        {name: 'price_cents', type: 'number', isOptional: true},
        {name: 'is_owned', type: 'boolean', isOptional: true},
        {name: 'generation_settings', type: 'string', isOptional: true},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    },
  ],
};

// Mock migrations
const migrations = {
  migrations: [],
};

// Mock adapter
const adapter = {
  schema,
  migrations,
  dbName: 'pocketpalai_test',
  jsi: false,
};

// Mock collection for local_pals
const mockLocalPalsCollection = {
  query: () => ({
    fetch: async () => [new LocalPal()], // Return array of mock LocalPal instances
  }),
  create: async callback => {
    const record = new LocalPal();
    if (callback) {
      callback(record);
    }
    return record;
  },
};

// Mock collections object
const mockCollections = {
  get: tableName => {
    if (tableName === 'local_pals') {
      return mockLocalPalsCollection;
    }
    // Return a basic mock for other tables
    return {
      query: () => ({
        fetch: async () => [],
      }),
      create: async callback => {
        const record = {};
        if (callback) {
          callback(record);
        }
        return record;
      },
    };
  },
};

// Mock database
const mockDatabase = {
  ...new Database({
    adapter,
    modelClasses: [
      ChatSession,
      Message,
      CompletionSetting,
      GlobalSetting,
      LocalPal,
    ],
  }),
  collections: mockCollections,
  // Direct get method for compatibility with tests
  get: tableName => mockCollections.get(tableName),
  write: async callback => {
    return await callback();
  },
};

// Export models
export {
  ChatSession,
  Message,
  CompletionSetting,
  GlobalSetting,
  LocalPal,
  Q,
  mockDatabase,
};
