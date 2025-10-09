import {LlamaContext} from '@pocketpalai/llama.rn';
import {makeAutoObservable, runInAction} from 'mobx';
import {format, isToday, isYesterday} from 'date-fns';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {assistant} from '../utils/chat';
import {MessageType} from '../utils/types';
import {CompletionParams} from '../utils/completionTypes';
import {chatSessionRepository} from '../repositories/ChatSessionRepository';
import {defaultCompletionParams} from '../utils/completionSettingsVersions';
import {palStore} from './PalStore';

const NEW_SESSION_TITLE = 'New Session';
const TITLE_LIMIT = 40;

export interface SessionMetaData {
  id: string;
  title: string;
  date: string;
  messages: MessageType.Any[];
  completionSettings: CompletionParams;
  activePalId?: string;
  settingsSource: 'pal' | 'custom'; // Explicit choice: use pal settings or custom settings
}

interface SessionGroup {
  [key: string]: SessionMetaData[];
}

// Default group names in English as fallback
const DEFAULT_GROUP_NAMES = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  twoWeeksAgo: '2 weeks ago',
  threeWeeksAgo: '3 weeks ago',
  fourWeeksAgo: '4 weeks ago',
  lastMonth: 'Last month',
  older: 'Older',
};

export const defaultCompletionSettings = {...defaultCompletionParams};
delete defaultCompletionSettings.prompt;
delete defaultCompletionSettings.stop;

class ChatSessionStore {
  sessions: SessionMetaData[] = [];
  activeSessionId: string | null = null;
  isEditMode: boolean = false;
  editingMessageId: string | null = null;
  isGenerating: boolean = false;
  newChatCompletionSettings: CompletionParams = defaultCompletionSettings;
  newChatPalId: string | undefined = undefined;
  newChatSettingsSource: 'pal' | 'custom' = 'pal';
  // Store localized date group names
  dateGroupNames: typeof DEFAULT_GROUP_NAMES = DEFAULT_GROUP_NAMES;
  // Migration status
  isMigrating: boolean = false;
  migrationComplete: boolean = false;

  constructor() {
    makeAutoObservable(this);
    this.initialize();
  }

  async initialize() {
    try {
      // First check if migration is needed without setting isMigrating flag
      // This is a quick check that just looks for the flag file
      const migrationNeeded = await this.isMigrationNeeded();

      if (migrationNeeded) {
        // Only set isMigrating to true if migration is actually needed
        runInAction(() => {
          this.isMigrating = true;
        });

        // Perform the actual migration
        await chatSessionRepository.checkAndMigrateFromJSON();

        runInAction(() => {
          this.isMigrating = false;
          this.migrationComplete = true;
        });
      } else {
        // Migration not needed, just mark as complete
        runInAction(() => {
          this.migrationComplete = true;
        });
      }

      // Load data from database (whether migration happened or not)
      await this.loadSessionList();
      await this.loadGlobalSettings();
    } catch (error) {
      console.error('Failed to initialize ChatSessionStore:', error);
      runInAction(() => {
        this.isMigrating = false;
        this.migrationComplete = false;
      });
    }
  }

  // Helper method to check if migration is needed without setting isMigrating flag
  private async isMigrationNeeded(): Promise<boolean> {
    try {
      // Check if migration flag file exists
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/db-migration-complete.flag`;
      const migrationComplete = await RNFS.exists(migrationFlagPath);

      return !migrationComplete;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false; // Assume no migration needed if we can't check
    }
  }

  // Method to set localized date group names from React components
  setDateGroupNames(l10nDateGroups: typeof DEFAULT_GROUP_NAMES) {
    this.dateGroupNames = l10nDateGroups;
  }

  get shouldShowHeaderDivider(): boolean {
    return (
      !this.activeSessionId ||
      (this.currentSessionMessages.length === 0 &&
        !this.isGenerating &&
        !this.isEditMode)
    );
  }

  setIsGenerating(value: boolean) {
    this.isGenerating = value;
  }

  async loadSessionList(): Promise<void> {
    try {
      const sessions = await chatSessionRepository.getAllSessions();

      // Convert to SessionMetaData format
      const sessionMetadata: SessionMetaData[] = [];

      for (const session of sessions) {
        const sessionData = await chatSessionRepository.getSessionById(
          session.id,
        );
        if (!sessionData) {
          continue;
        }

        const messages = sessionData.messages.map(msg => msg.toMessageObject());

        // Handle case where completionSettings might be null
        let completionSettings = defaultCompletionSettings;
        if (sessionData.completionSettings) {
          completionSettings = sessionData.completionSettings.getSettings();
        } else {
          console.warn(
            `No completion settings found for session ${session.id}, using defaults`,
          );
        }

        sessionMetadata.push({
          id: session.id,
          title: session.title,
          date: session.date,
          messages,
          completionSettings,
          activePalId: session.activePalId,
          settingsSource: 'pal', // Default to pal settings for existing sessions
        });
      }

      runInAction(() => {
        this.sessions = sessionMetadata;
      });
    } catch (error) {
      console.error('Failed to load session list:', error);
    }
  }

  async loadGlobalSettings(): Promise<void> {
    try {
      const settings =
        await chatSessionRepository.getGlobalCompletionSettings();

      runInAction(() => {
        this.newChatCompletionSettings = settings;
      });
    } catch (error) {
      console.error('Failed to load global settings:', error);
    }
  }

  async deleteSession(id: string): Promise<void> {
    try {
      await chatSessionRepository.deleteSession(id);

      if (id === this.activeSessionId) {
        this.resetActiveSession();
      }

      runInAction(() => {
        this.sessions = this.sessions.filter(session => session.id !== id);
      });
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  async duplicateSession(id: string) {
    const session = this.sessions.find(s => s.id === id);
    if (session) {
      await this.createNewSession(
        `${session.title} - Copy`,
        session.messages,
        session.completionSettings,
      );
    }
  }

  resetActiveSession() {
    runInAction(() => {
      this.newChatPalId = this.activePalId;
      this.newChatSettingsSource = 'pal'; // Reset to default for new chat
      // Do not copy completion settings from session to global settings
      // Instead, preserve global settings as they are
      this.exitEditMode();
      this.activeSessionId = null;
    });
  }

  setActiveSession(sessionId: string) {
    runInAction(() => {
      this.exitEditMode();
      this.activeSessionId = sessionId;
      // Don't modify global settings when changing sessions
      this.newChatPalId = undefined;
      this.newChatSettingsSource = 'pal'; // Reset for consistency
    });
  }

  // Update session title by session ID
  async updateSessionTitleBySessionId(
    sessionId: string,
    newTitle: string,
  ): Promise<void> {
    try {
      await chatSessionRepository.updateSessionTitle(sessionId, newTitle);

      const session = this.sessions.find(s => s.id === sessionId);
      if (session) {
        runInAction(() => {
          session.title = newTitle;
        });
      }
    } catch (error) {
      console.error('Failed to update session title:', error);
    }
  }

  async updateSessionTitle(session: SessionMetaData) {
    if (session.messages.length > 0) {
      const message = session.messages[session.messages.length - 1];
      if (session.title === NEW_SESSION_TITLE && message.type === 'text') {
        runInAction(() => {
          session.title =
            message.text.length > TITLE_LIMIT
              ? `${message.text.substring(0, TITLE_LIMIT)}...`
              : message.text;
        });

        // Update in database - await the async call
        await chatSessionRepository.updateSessionTitle(
          session.id,
          session.title,
        );
      }
    }
  }

  async addMessageToCurrentSession(message: MessageType.Any): Promise<void> {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        // Add to database
        const newMessage = await chatSessionRepository.addMessageToSession(
          this.activeSessionId,
          message,
        );
        message.id = newMessage.id;

        // Update local state
        await this.updateSessionTitle(session);
        runInAction(() => {
          session.messages.unshift(message);
        });
      }
    } else {
      // Always use the global settings for new sessions
      const settings = {...this.newChatCompletionSettings};
      await this.createNewSession(NEW_SESSION_TITLE, [message], settings);
    }
  }

  get currentSessionMessages(): MessageType.Any[] {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        if (this.isEditMode && this.editingMessageId) {
          const messageIndex = session.messages.findIndex(
            msg => msg.id === this.editingMessageId,
          );
          if (messageIndex >= 0) {
            return session.messages.slice(messageIndex + 1);
          }
        }
        return session.messages;
      }
    }
    return [];
  }

  async setNewChatCompletionSettings(settings: CompletionParams) {
    this.newChatCompletionSettings = settings;
    await chatSessionRepository.saveGlobalCompletionSettings(settings);
  }

  async resetNewChatCompletionSettings() {
    this.newChatCompletionSettings = {...defaultCompletionSettings};
    await chatSessionRepository.saveGlobalCompletionSettings(
      this.newChatCompletionSettings,
    );
  }

  async createNewSession(
    title: string,
    initialMessages: MessageType.Any[] = [],
    completionSettings: CompletionParams = defaultCompletionSettings,
  ): Promise<void> {
    try {
      // Create in database
      const newSession = await chatSessionRepository.createSession(
        title,
        initialMessages,
        completionSettings,
        this.newChatPalId,
      );

      // Get the full session data
      const sessionData = await chatSessionRepository.getSessionById(
        newSession.id,
      );
      if (!sessionData) {
        return;
      }

      const messages = sessionData.messages.map(msg => msg.toMessageObject());

      // Handle case where completionSettings might be null
      let settings = completionSettings; // Use the settings passed to createNewSession as fallback
      if (sessionData.completionSettings) {
        settings = sessionData.completionSettings.getSettings();
      } else {
        console.warn(
          `No completion settings found for new session ${newSession.id}, using provided settings`,
        );
      }

      // Create metadata object
      const metaData: SessionMetaData = {
        id: newSession.id,
        title,
        date: newSession.date,
        messages,
        completionSettings: settings,
        settingsSource: this.newChatSettingsSource, // Use the stored settings source choice
      };

      if (this.newChatPalId) {
        metaData.activePalId = this.newChatPalId;
        this.newChatPalId = undefined;
      }

      await this.updateSessionTitle(metaData);

      runInAction(() => {
        this.sessions.push(metaData);
        this.activeSessionId = newSession.id;
      });
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  }

  async updateMessage(
    id: string,
    sessionId: string,
    update: Partial<MessageType.Text>,
  ): Promise<void> {
    try {
      // Update in database
      await chatSessionRepository.updateMessage(id, update);

      // Determine which session to update
      const targetSessionId = sessionId || this.activeSessionId;
      if (targetSessionId) {
        const session = this.sessions.find(s => s.id === targetSessionId);
        if (session) {
          const index = session.messages.findIndex(msg => msg.id === id);
          if (index >= 0 && session.messages[index].type === 'text') {
            // Update local state - only update the specific message
            runInAction(() => {
              session.messages[index] = {
                ...session.messages[index],
                ...update,
              } as MessageType.Text;
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  }

  async updateSessionCompletionSettings(settings: CompletionParams) {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        try {
          // Update in database
          await chatSessionRepository.updateSessionCompletionSettings(
            this.activeSessionId,
            settings,
          );

          // Update local state directly - no need to reload from database
          runInAction(() => {
            session.completionSettings = settings;
            session.settingsSource = 'custom'; // Mark as using custom settings
          });
        } catch (error) {
          console.error('Failed to update session completion settings:', error);
        }
      }
    }
  }

  async updateSessionSettingsSource(source: 'pal' | 'custom') {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        runInAction(() => {
          session.settingsSource = source;
        });
      }
    }
  }

  setNewChatSettingsSource(source: 'pal' | 'custom') {
    runInAction(() => {
      this.newChatSettingsSource = source;
    });
  }

  // Called when the active pal changes in a session
  async updateSessionActivePal(palId: string) {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        runInAction(() => {
          session.activePalId = palId;
          session.settingsSource = 'pal'; // Switch to pal settings when changing pal
        });
      }
    }
  }

  // Apply current session settings to global settings
  async applySessionSettingsToGlobal() {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        await this.setNewChatCompletionSettings({
          ...session.completionSettings,
        });
      }
    }
  }

  // Reset current session settings to match global settings
  async resetSessionSettingsToGlobal() {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        await this.updateSessionCompletionSettings({
          ...this.newChatCompletionSettings,
        });
      }
    }
  }

  async updateMessageToken(
    data: any,
    createdAt: number,
    id: string,
    sessionId: string | undefined,
    context: LlamaContext,
  ): Promise<void> {
    const {token} = data;

    if (this.activeSessionId) {
      const session = sessionId
        ? this.sessions.find(s => s.id === sessionId)
        : this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        const index = session.messages.findIndex(msg => msg.id === id);
        if (index >= 0) {
          // Update existing message
          runInAction(() => {
            session.messages = session.messages.map((msg, i) => {
              if (msg.type === 'text' && i === index) {
                return {
                  ...msg,
                  text: (msg.text + token).replace(/^\s+/, ''),
                };
              }
              return msg;
            });
          });

          // Update the database with each token to ensure it's saved
          // Since we throttle the calls, this shouldn't be too much of a performance hit
          try {
            const updatedMessage = session.messages[index];
            if (updatedMessage.type === 'text') {
              // Use the repository to update the message
              await chatSessionRepository.updateMessage(id, {
                text: updatedMessage.text,
              });
            }
          } catch (error) {
            console.error('Failed to update message in database:', error);
          }
        } else {
          // Create new message
          const newMessage = {
            author: assistant,
            createdAt,
            id,
            text: token,
            type: 'text',
            metadata: {contextId: context?.id, copyable: true},
          } as MessageType.Text;

          // we can simply update the message in the database,
          // since we create an empty message before calling update
          try {
            await chatSessionRepository.updateMessage(id, {
              text: newMessage.text,
            });

            // Then update UI
            runInAction(() => {
              session.messages.unshift(newMessage);
            });
          } catch (error) {
            console.error('Failed to add message to session:', error);
          }
        }
      }
    }
  }

  get groupedSessions(): SessionGroup {
    const groups: SessionGroup = this.sessions.reduce(
      (acc: SessionGroup, session) => {
        const date = new Date(session.date);
        let dateKey: string = format(date, 'MMMM dd, yyyy');
        const today = new Date();
        const daysAgo = Math.ceil(
          (today.getTime() - date.getTime()) / (1000 * 3600 * 24),
        );

        if (isToday(date)) {
          dateKey = this.dateGroupNames.today;
        } else if (isYesterday(date)) {
          dateKey = this.dateGroupNames.yesterday;
        } else if (daysAgo <= 6) {
          dateKey = this.dateGroupNames.thisWeek;
        } else if (daysAgo <= 13) {
          dateKey = this.dateGroupNames.lastWeek;
        } else if (daysAgo <= 20) {
          dateKey = this.dateGroupNames.twoWeeksAgo;
        } else if (daysAgo <= 27) {
          dateKey = this.dateGroupNames.threeWeeksAgo;
        } else if (daysAgo <= 34) {
          dateKey = this.dateGroupNames.fourWeeksAgo;
        } else if (daysAgo <= 60) {
          dateKey = this.dateGroupNames.lastMonth;
        } else {
          dateKey = this.dateGroupNames.older;
        }

        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(session);
        return acc;
      },
      {},
    );

    // Define the order of keys using the localized group names
    const orderedKeys = [
      this.dateGroupNames.today,
      this.dateGroupNames.yesterday,
      this.dateGroupNames.thisWeek,
      this.dateGroupNames.lastWeek,
      this.dateGroupNames.twoWeeksAgo,
      this.dateGroupNames.threeWeeksAgo,
      this.dateGroupNames.fourWeeksAgo,
      this.dateGroupNames.lastMonth,
      this.dateGroupNames.older,
    ];

    // Create a new object with keys in the desired order
    const orderedGroups: SessionGroup = {};
    orderedKeys.forEach(key => {
      if (groups[key]) {
        orderedGroups[key] = groups[key].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      }
    });

    // Add any remaining keys that weren't in our predefined list
    Object.keys(groups).forEach(key => {
      if (!orderedGroups[key]) {
        orderedGroups[key] = groups[key].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      }
    });

    return orderedGroups;
  }

  /**
   * Enters edit mode for a specific message
   */
  enterEditMode(messageId: string): void {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        const messageIndex = session.messages.findIndex(
          msg => msg.id === messageId,
        );
        if (messageIndex >= 0) {
          runInAction(() => {
            this.isEditMode = true;
            this.editingMessageId = messageId;
          });
        }
      }
    }
  }

  /**
   * Exits edit mode without making changes
   */
  exitEditMode(): void {
    runInAction(() => {
      this.isEditMode = false;
      this.editingMessageId = null;
    });
  }

  /**
   * Commits the edit by actually removing messages after the edited message
   */
  async commitEdit(): Promise<void> {
    if (this.editingMessageId) {
      // Remove messages after the edited message including the edited message as well.
      await this.removeMessagesFromId(this.editingMessageId, true);
      runInAction(() => {
        this.isEditMode = false;
        this.editingMessageId = null;
      });
    }
  }

  /**
   * Removes messages from the current active session starting from a specific message ID.
   * If includeMessage is true, the message with the given ID is also removed.
   *
   * @param messageId - The ID of the message to start removal from.
   * @param includeMessage - Whether to include the message with the given ID in the removal.
   */
  async removeMessagesFromId(
    messageId: string,
    includeMessage: boolean = true,
  ): Promise<void> {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        const messageIndex = session.messages.findIndex(
          msg => msg.id === messageId,
        );
        if (messageIndex >= 0) {
          // Get messages to remove
          const endIndex = includeMessage ? messageIndex + 1 : messageIndex;
          // Slice from the start to the end index, since messages are in reverse order, ie 0 is the latest.
          const messagesToRemove = session.messages.slice(0, endIndex);

          // Remove from database
          for (const msg of messagesToRemove) {
            await chatSessionRepository.deleteMessage(msg.id);
          }

          const updatedSession = await chatSessionRepository.getSessionById(
            this.activeSessionId,
          );

          // Update local state
          runInAction(() => {
            session.messages =
              updatedSession?.messages?.map(msg => msg.toMessageObject()) || [];
          });
        }
      }
    }
  }

  get activePalId(): string | undefined {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      return session?.activePalId;
    }
    return this.newChatPalId;
  }

  async setActivePal(palId: string | undefined): Promise<void> {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        // Update in database
        await chatSessionRepository.setSessionActivePal(
          this.activeSessionId,
          palId,
        );

        // Update local state
        runInAction(() => {
          session.activePalId = palId;
        });
      }
    } else {
      this.newChatPalId = palId;
    }
  }

  /**
   * Resolves completion settings according to the precedence hierarchy:
   * System Defaults → Global User Settings → Pal-Specific Settings → Session-Specific Settings (only if explicitly modified)
   */
  async resolveCompletionSettings(
    sessionId?: string,
    palId?: string,
  ): Promise<CompletionParams> {
    // Start with system defaults
    let resolvedSettings: CompletionParams = {...defaultCompletionSettings};

    // Apply global user settings
    resolvedSettings = {
      ...resolvedSettings,
      ...this.newChatCompletionSettings,
    };

    // Apply pal-specific settings if available
    if (palId) {
      // Use in-memory pal store as the source of truth (avoids cache invalidation issues)
      const pal = palStore.pals.find(p => p.id === palId);
      const palSettings = pal?.completionSettings;

      if (palSettings) {
        resolvedSettings = {
          ...resolvedSettings,
          ...palSettings,
        };
      }
    }

    // Apply session-specific settings based on explicit user choice
    if (sessionId) {
      const session = this.sessions.find(s => s.id === sessionId);

      if (session?.settingsSource === 'custom') {
        // User explicitly chose custom settings - use session settings
        resolvedSettings = session.completionSettings;
      }
    }

    return resolvedSettings;
  }

  /**
   * Gets the effective completion settings for the current context
   */
  async getCurrentCompletionSettings(): Promise<CompletionParams> {
    const activePalId = this.activeSessionId
      ? this.sessions.find(s => s.id === this.activeSessionId)?.activePalId
      : this.newChatPalId;

    return this.resolveCompletionSettings(
      this.activeSessionId || undefined,
      activePalId,
    );
  }
}

export const chatSessionStore = new ChatSessionStore();
