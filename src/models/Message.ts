/**
 * Message Model
 *
 * Represents a chat message.
 *
 * @phase Phase 1 - Data Model
 */

/**
 * Message - A single chat message
 *
 * Properties:
 * - id: Unique identifier
 * - role: Message role (user/assistant/system)
 * - content: Message content (text)
 * - timestamp: Message timestamp
 * - isStreaming: Whether the message is currently streaming
 * - images: Images attached to the message
 */
export interface Message {
  /**
   * Unique message identifier
   */
  id: string;

  /**
   * Message role: 'user' | 'assistant' | 'system'
   */
  role: 'user' | 'assistant' | 'system';

  /**
   * Message content (text)
   */
  content: string;

  /**
   * Message timestamp
   */
  timestamp: number;

  /**
   * Whether the message is currently streaming
   */
  isStreaming?: boolean;

  /**
   * Images attached to the message (base64 or URI)
   */
  images?: string[];
}
