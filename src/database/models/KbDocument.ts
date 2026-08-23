import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';
import {Associations} from '@nozbe/watermelondb/Model';

export type KbDocStatus = 'indexing' | 'ready' | 'error';

export default class KbDocument extends Model {
  static table = 'kb_documents';

  static associations: Associations = {
    kb_chunks: {type: 'has_many' as const, foreignKey: 'doc_id'},
  };

  @text('name') name!: string;
  @text('mime') mime?: string;
  @field('size') size!: number;
  @text('content_hash') contentHash!: string;
  @text('preset_id') presetId!: string;
  @field('dims') dims!: number;
  @field('chunk_count') chunkCount!: number;
  @field('char_count') charCount!: number;
  @text('status') status!: KbDocStatus;
  @text('error') error?: string;
  @text('source') source?: 'attach' | 'manual';
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
}
