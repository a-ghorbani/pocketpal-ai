import {Model} from '@nozbe/watermelondb';
import {field, readonly, date} from '@nozbe/watermelondb/decorators';

export type SyncStatusType = 'synced' | 'pending' | 'error';
export type EntityType = 'library' | 'pal' | 'categories' | 'tags' | 'reviews';

export default class SyncStatus extends Model {
  static table = 'sync_status';

  @field('entity_type') entityType!: EntityType;
  @field('entity_id') entityId?: string;
  @field('last_sync') lastSync!: number;
  @field('sync_version') syncVersion?: string;
  @field('status') status!: SyncStatusType;
  @field('error_message') errorMessage?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  get lastSyncDate(): Date {
    return new Date(this.lastSync);
  }

  get isStale(): boolean {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.lastSync < fiveMinutesAgo;
  }

  get hasError(): boolean {
    return this.status === 'error';
  }

  get isPending(): boolean {
    return this.status === 'pending';
  }

  get isSynced(): boolean {
    return this.status === 'synced';
  }
}
