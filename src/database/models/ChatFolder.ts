import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';

export default class ChatFolder extends Model {
  static table = 'chat_folders';

  @text('name') name!: string;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
}
