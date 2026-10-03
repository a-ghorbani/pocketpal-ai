import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';
import {Associations} from '@nozbe/watermelondb/Model';

export default class ChatSession extends Model {
  static table = 'chat_sessions';

  static associations: Associations = {
    messages: {type: 'has_many' as const, foreignKey: 'session_id'},
    // WatermelonDB doesn't have a 'has_one' type in its TypeScript definitions
    // Use 'has_many' instead and handle it as a single item in the code
    completion_settings: {type: 'has_many' as const, foreignKey: 'session_id'},
  };

  @text('title') title!: string;
  @text('date') date!: string;
  @text('active_pal_id') activePalId?: string;
  @text('settings_source') settingsSource?: string;
  @field('pinned') pinned!: boolean;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
}
