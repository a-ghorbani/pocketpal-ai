import {Model} from '@nozbe/watermelondb';
import {field, readonly, date} from '@nozbe/watermelondb/decorators';

export default class UserLibrary extends Model {
  static table = 'user_library';

  @field('user_id') userId!: string;
  @field('palshub_id') palshubId!: string;
  @field('purchased_at') purchasedAt!: number;
  @field('purchase_id') purchaseId?: string;
  @field('is_downloaded') isDownloaded!: boolean;
  @field('download_path') downloadPath?: string;
  @readonly @date('created_at') createdAt!: Date;

  get purchasedAtDate(): Date {
    return new Date(this.purchasedAt);
  }
}
