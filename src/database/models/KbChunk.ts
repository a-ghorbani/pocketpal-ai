import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';

export default class KbChunk extends Model {
  static table = 'kb_chunks';

  @text('doc_id') docId!: string;
  @field('position') position!: number;
  @text('text') text!: string;
  @field('created_at') createdAt!: number;
}
