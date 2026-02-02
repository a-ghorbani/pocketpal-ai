import {defaultCompletionParams} from '../utils/completionSettingsVersions';

// Default completion settings without prompt and stop
const defaultCompletionSettings = {...defaultCompletionParams};
delete defaultCompletionSettings.prompt;
delete defaultCompletionSettings.stop;

class ChatSessionRepository {
  // Check if we need to migrate from JSON files
  async checkAndMigrateFromJSON() {
    return false; // Mock: no migration needed
  }

  // Get all sessions grouped by date
  async getAllSessions() {
    return []; // Mock: return empty array
  }

  // Get a single session with its messages and settings
  async getSessionById(id) {
    return {
      session: {
        id,
        title: 'Mock Session',
        date: new Date().toISOString(),
      },
      messages: [],
      completionSettings: {
        id: 'mock-settings-id',
        sessionId: id,
        settings: JSON.stringify(defaultCompletionSettings),
        getSettings: () => defaultCompletionSettings,
      },
    };
  }

  // Get session metadata with settings but without messages (for lazy loading)
  async getSessionMetadataWithSettings(id) {
    return {
      session: {
        id,
        title: 'Mock Session',
        date: new Date().toISOString(),
      },
      completionSettings: {
        id: 'mock-settings-id',
        sessionId: id,
        settings: JSON.stringify(defaultCompletionSettings),
        getSettings: () => defaultCompletionSettings,
      },
    };
  }

  // Create a new session
  async createSession(
    title,
    initialMessages = [],
    completionSettings = defaultCompletionSettings,
    activePalId,
  ) {
    return {
      id: 'mock-session-id',
      title,
      date: new Date().toISOString(),
      activePalId,
    };
  }

  // Delete a session
  async deleteSession(id) {
    return; // Mock: do nothing
  }

  // Delete multiple sessions
  async deleteSessions(ids) {
    return; // Mock: do nothing
  }

  // Export multiple sessions
  async exportSessions(ids) {
    return; // Mock: do nothing
  }

  // Add a message to a session
  async addMessageToSession(sessionId, message) {
    return {
      id: 'mock-message-id',
      sessionId,
      author: message.author.id,
      text: message.text,
      type: message.type,
      createdAt: Date.now(),
      metadata: JSON.stringify(message.metadata || {}),
      position: 1,
    };
  }

  // Update a message
  async updateMessage(id, update) {
    return; // Mock: do nothing
  }

  async deleteMessage(id) {
    return; // Mock: do nothing
  }

  async setSessionActivePal(sessionId, palId) {
    return; // Mock: do nothing
  }

  // Update session completion settings
  async updateSessionCompletionSettings(sessionId, settings) {
    return; // Mock: do nothing
  }

  // Get global completion settings
  async getGlobalCompletionSettings() {
    return defaultCompletionSettings;
  }

  // Save global completion settings
  async saveGlobalCompletionSettings(settings) {
    return; // Mock: do nothing
  }

  // Update session title
  async updateSessionTitle(sessionId, newTitle) {
    return; // Mock: do nothing
  }
}

export const chatSessionRepository = new ChatSessionRepository();
