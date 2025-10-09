import {appSchema, tableSchema} from '@nozbe/watermelondb';

export default appSchema({
  version: 5,
  tables: [
    tableSchema({
      name: 'chat_sessions',
      columns: [
        {name: 'title', type: 'string'},
        {name: 'date', type: 'string'},
        {name: 'active_pal_id', type: 'string', isOptional: true},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    tableSchema({
      name: 'messages',
      columns: [
        {name: 'session_id', type: 'string', isIndexed: true},
        {name: 'author', type: 'string'},
        {name: 'text', type: 'string', isOptional: true},
        {name: 'type', type: 'string'},
        {name: 'created_at', type: 'number'},
        {name: 'metadata', type: 'string'}, // JSON stringified
        {name: 'position', type: 'number'}, // For ordering
      ],
    }),
    tableSchema({
      name: 'completion_settings',
      columns: [
        {name: 'session_id', type: 'string', isIndexed: true},
        {name: 'settings', type: 'string'}, // JSON stringified
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    tableSchema({
      name: 'global_settings',
      columns: [
        {name: 'key', type: 'string', isIndexed: true},
        {name: 'value', type: 'string'}, // JSON stringified
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    // PalsHub integration tables
    tableSchema({
      name: 'cached_pals',
      columns: [
        {name: 'palshub_id', type: 'string', isIndexed: true},
        {name: 'title', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'thumbnail_url', type: 'string', isOptional: true},
        {name: 'creator_id', type: 'string'},
        {name: 'creator_name', type: 'string', isOptional: true},
        {name: 'creator_avatar_url', type: 'string', isOptional: true},
        {name: 'protection_level', type: 'string'},
        {name: 'price_cents', type: 'number'},
        {name: 'allow_fork', type: 'boolean'},
        {name: 'average_rating', type: 'number', isOptional: true},
        {name: 'review_count', type: 'number'},
        {name: 'is_owned', type: 'boolean'},
        {name: 'categories', type: 'string'}, // JSON array
        {name: 'tags', type: 'string'}, // JSON array
        {name: 'system_prompt', type: 'string', isOptional: true},
        {name: 'model_settings', type: 'string'}, // JSON object
        {name: 'cached_at', type: 'number'},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    tableSchema({
      name: 'user_library',
      columns: [
        {name: 'user_id', type: 'string', isIndexed: true},
        {name: 'palshub_id', type: 'string', isIndexed: true},
        {name: 'purchased_at', type: 'number'},
        {name: 'purchase_id', type: 'string', isOptional: true},
        {name: 'is_downloaded', type: 'boolean'},
        {name: 'download_path', type: 'string', isOptional: true},
        {name: 'created_at', type: 'number'},
      ],
    }),
    tableSchema({
      name: 'sync_status',
      columns: [
        {name: 'entity_type', type: 'string', isIndexed: true}, // 'library', 'pal', 'categories', etc.
        {name: 'entity_id', type: 'string', isOptional: true},
        {name: 'last_sync', type: 'number'},
        {name: 'sync_version', type: 'string', isOptional: true},
        {name: 'status', type: 'string'}, // 'synced', 'pending', 'error'
        {name: 'error_message', type: 'string', isOptional: true},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    // Local Pals table for unified pal storage
    tableSchema({
      name: 'local_pals',
      columns: [
        {name: 'name', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'thumbnail_url', type: 'string', isOptional: true},
        {name: 'system_prompt', type: 'string'},
        {name: 'original_system_prompt', type: 'string', isOptional: true},
        {name: 'is_system_prompt_changed', type: 'boolean'},
        {name: 'use_ai_prompt', type: 'boolean'},
        {name: 'default_model', type: 'string', isOptional: true}, // JSON stringified
        {name: 'prompt_generation_model', type: 'string', isOptional: true}, // JSON stringified
        {name: 'generating_prompt', type: 'string', isOptional: true},
        {name: 'color', type: 'string', isOptional: true}, // JSON stringified [string, string]
        {name: 'capabilities', type: 'string'}, // JSON stringified PalCapabilities
        {name: 'parameters', type: 'string'}, // JSON stringified Record<string, any>
        {name: 'parameter_schema', type: 'string'}, // JSON stringified ParameterDefinition[]
        {name: 'source', type: 'string'}, // 'local' | 'palshub'
        {name: 'palshub_id', type: 'string', isOptional: true},
        {name: 'creator_info', type: 'string', isOptional: true}, // JSON stringified
        {name: 'categories', type: 'string', isOptional: true}, // JSON stringified string[]
        {name: 'tags', type: 'string', isOptional: true}, // JSON stringified string[]
        {name: 'rating', type: 'number', isOptional: true},
        {name: 'review_count', type: 'number', isOptional: true},
        {name: 'protection_level', type: 'string', isOptional: true},
        {name: 'price_cents', type: 'number', isOptional: true},
        {name: 'is_owned', type: 'boolean', isOptional: true},
        {name: 'generation_settings', type: 'string', isOptional: true}, // JSON stringified
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
  ],
});
