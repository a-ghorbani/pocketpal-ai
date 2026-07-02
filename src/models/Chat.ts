/**
 * Chat Model
 *
 * Represents a chat session with messages.
 * Used for local storage and Firestore sync.
 *
 * @phase Phase 1 - Data Model
 */

import { Message } from './Message';

/**
 * Chat - A chat session containing messages
 *
 * Properties:
 * - id: Unique identifier
 * - messages: Array of chat messages
 * - updatedAt: Last update timestamp (Unix ms)
 * - isDeleted: Soft delete flag
 * - _dirty: Local-only flag for sync tracking
 */
export interface Chat {
  /**
   * Unique chat identifier
   * Format: 'chat_${timestamp}_${random}'
   */
  id: string;

  /**
   * Chat title (derived from first message or user-set)
   */
  title: string;

  /**
   * Array of messages in this chat
   */
  messages: Message[];

  /**
   * Last update timestamp (Unix milliseconds)
   * Used for sync conflict resolution
   */
  updatedAt: number;

  /**
   * Soft delete flag
   * If true, chat should be deleted from remote on next sync
   */
  isDeleted: boolean;

  /**
   * Sync dirty flag (local only)
   * If true, this chat needs to be synced to remote
   */
  _dirty?: boolean;

  /**
   * Model ID used for this chat
   */
  modelId?: string;

  /**
   * Pal ID associated with this chat (optional)
   */
  palId?: string;
}

/**
 * MessageType - Union type for all message types
 */
export type MessageType = TextMessage | AssistantMessage | SystemMessage;

/**
 * TextMessage - A text message from user or assistant
 */
export interface TextMessage {
  id: string;
  type: 'text';
  author: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  images?: string[];
}

/**
 * AssistantMessage - A message from the assistant with additional metadata
 */
export interface AssistantMessage {
  id: string;
  type: 'assistant';
  author: 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  modelId?: string;
  tokenCount?: number;
}

/**
 * SystemMessage - A system message
 */
export interface SystemMessage {
  id: string;
  type: 'system';
  author: 'system';
  content: string;
  timestamp: number;
}

/**
 * Create a new empty chat
 * @param id - Chat ID (optional, auto-generated if not provided)
 * @returns Chat - New chat object
 */
export function createChat(id?: string): Chat {
  const chatId = id || `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: chatId,
    title: 'New Chat',
    messages: [],
    updatedAt: Date.now(),
    isDeleted: false,
    _dirty: true,
  };
}

/**
 * Add a message to a chat
 * @param chat - Chat to update
 * @param message - Message to add
 * @returns Chat - Updated chat
 */
export function addMessageToChat(chat: Chat, message: Message): Chat {
  return {
    ...chat,
    messages: [...chat.messages, message],
    updatedAt: Date.now(),
    _dirty: true,
  };
}

/**
 * Mark a chat as dirty (needs sync)
 * @param chat - Chat to mark
 * @returns Chat - Updated chat
 */
export function markChatDirty(chat: Chat): Chat {
  return {
    ...chat,
    _dirty: true,
  };
}

/**
 * Mark a chat as clean (sync complete)
 * @param chat - Chat to mark
 * @returns Chat - Updated chat
 */
export function markChatClean(chat: Chat): Chat {
  return {
    ...chat,
    _dirty: false,
  };
}

/**
 * Soft delete a chat
 * @param chat - Chat to delete
 * @returns Chat - Updated chat
 */
export function deleteChat(chat: Chat): Chat {
  return {
    ...chat,
    isDeleted: true,
    updatedAt: Date.now(),
    _dirty: true,
  };
}
