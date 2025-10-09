import {Model} from '@nozbe/watermelondb';
import {field, readonly, date} from '@nozbe/watermelondb/decorators';

export default class CachedPal extends Model {
  static table = 'cached_pals';

  @field('palshub_id') palshubId!: string;
  @field('title') title!: string;
  @field('description') description?: string;
  @field('thumbnail_url') thumbnailUrl?: string;
  @field('creator_id') creatorId!: string;
  @field('creator_name') creatorName?: string;
  @field('creator_avatar_url') creatorAvatarUrl?: string;
  @field('protection_level') protectionLevel!: string;
  @field('price_cents') priceCents!: number;
  @field('allow_fork') allowFork!: boolean;
  @field('average_rating') averageRating?: number;
  @field('review_count') reviewCount!: number;
  @field('is_owned') isOwned!: boolean;
  @field('categories') categories!: string; // JSON array
  @field('tags') tags!: string; // JSON array
  @field('system_prompt') systemPrompt?: string;
  @field('model_settings') modelSettings!: string; // JSON object
  @field('cached_at') cachedAt!: number;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  // Helper methods to parse JSON fields
  get categoriesArray(): string[] {
    try {
      return JSON.parse(this.categories || '[]');
    } catch {
      return [];
    }
  }

  get tagsArray(): string[] {
    try {
      return JSON.parse(this.tags || '[]');
    } catch {
      return [];
    }
  }

  get modelSettingsObject(): Record<string, unknown> {
    try {
      return JSON.parse(this.modelSettings || '{}');
    } catch {
      return {};
    }
  }

  get creatorInfo() {
    return {
      id: this.creatorId,
      name: this.creatorName,
      avatar_url: this.creatorAvatarUrl,
    };
  }
}
