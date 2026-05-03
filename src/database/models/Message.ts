import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';
import {AgentStep, MessageType, User} from '../../utils/types';

export default class Message extends Model {
  static table = 'messages';

  static associations = {
    chat_sessions: {type: 'belongs_to' as const, key: 'session_id'},
  };

  @text('session_id') sessionId!: string;
  @text('author') author!: string;
  @text('text') text?: string;
  @text('type') type!: string;
  @field('created_at') createdAt!: number;
  @field('metadata') metadata!: string;
  @field('position') position!: number;

  toMessageObject(): MessageType.Any {
    const rawMetadata = JSON.parse(this.metadata || '{}');

    const author: User = {
      id: this.author,
      ...(rawMetadata.authorData || {}),
    };

    if (this.type === 'text') {
      return {
        id: this.id,
        type: 'text',
        text: this.text || '',
        author,
        createdAt: this.createdAt,
        metadata: rawMetadata,
        // Extract imageUris from metadata if present
        imageUris: rawMetadata.imageUris,
      } as MessageType.Text;
    }

    if (this.type === 'assistant_turn') {
      // Lift metadata.steps to the top-level `steps` field for the
      // in-memory type. The persisted metadata keeps `steps` (the DB is
      // the source of truth for crash recovery), but the in-memory
      // metadata strips it so consumers reading `message.metadata.steps`
      // get `undefined` — they must use `message.steps`. The
      // persistence layer (ChatSessionRepository) is the sole writer of
      // `metadata.steps` on the way back to disk.
      const {steps: liftedSteps, ...metadataWithoutSteps} = rawMetadata;
      const steps: AgentStep[] = Array.isArray(liftedSteps) ? liftedSteps : [];
      return {
        id: this.id,
        type: 'assistant_turn',
        author,
        createdAt: this.createdAt,
        steps,
        metadata: metadataWithoutSteps,
      } as MessageType.AssistantTurn;
    }

    return {
      id: this.id,
      type: this.type as any,
      author,
      createdAt: this.createdAt,
      metadata: rawMetadata,
    } as any;
  }
}
