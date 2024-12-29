import {LlamaContext} from '@pocketpalai/llama.rn';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {makeAutoObservable, runInAction} from 'mobx';
import {format, isToday, isYesterday} from 'date-fns';

import {assistant} from '../utils/chat';
import {MessageType} from '../utils/types';

const NEW_SESSION_TITLE = 'New Session';
const TITLE_LIMIT = 40;

interface SessionMetaData {
  id: string;
  title: string;
  date: string;
  messages: MessageType.Any[];
}

interface SessionGroup {
  [key: string]: SessionMetaData[];
}

class ChatSessionStore {
  sessions: SessionMetaData[] = [];
  activeSessionId: string | null = null;
  isEditMode: boolean = false;
  editingMessageId: string | null = null;
  isGenerating: boolean = false;

  constructor() {
    makeAutoObservable(this);
    this.loadSessionList();
  }

  get shouldShowHeaderDivider(): boolean {
    return (
      !this.activeSessionId ||
      (this.currentSessionMessages.length === 0 && !this.isGenerating)
    );
  }

  setIsGenerating(value: boolean) {
    this.isGenerating = value;
  }

  async loadSessionList(): Promise<void> {
    const path = `${RNFS.DocumentDirectoryPath}/session-metadata.json`;
    try {
      const data = await RNFS.readFile(path);
      runInAction(() => {
        this.sessions = JSON.parse(data);
      });
    } catch (error) {
      console.error('Failed to load session list:', error);
    }
  }

  async deleteSession(id: string): Promise<void> {
    try {
      const sessionFile = `${RNFS.DocumentDirectoryPath}/${id}.llama-session.bin`;
      const fileExists = await RNFS.exists(sessionFile);
      if (fileExists) {
        await RNFS.unlink(sessionFile);
      }

      if (id === this.activeSessionId) {
        this.resetActiveSession();
      }

      runInAction(() => {
        this.sessions = this.sessions.filter(session => session.id !== id);
      });

      await RNFS.writeFile(
        `${RNFS.DocumentDirectoryPath}/session-metadata.json`,
        JSON.stringify(this.sessions),
      );
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  resetActiveSession() {
    runInAction(() => {
      this.exitEditMode();
      this.activeSessionId = null;
    });
  }

  setActiveSession(sessionId: string) {
    runInAction(() => {
      this.exitEditMode();
      this.activeSessionId = sessionId;
    });
  }

  updateSessionTitle(session: SessionMetaData) {
    if (session.messages.length > 0) {
      const message = session.messages[session.messages.length - 1];
      if (session.title === NEW_SESSION_TITLE && message.type === 'text') {
        runInAction(() => {
          session.title =
            message.text.length > TITLE_LIMIT
              ? `${message.text.substring(0, TITLE_LIMIT)}...`
              : message.text;
        });
      }
    }
  }

  addMessageToCurrentSession(message: MessageType.Any): void {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        console.log('session.title', session.title);
        console.log('message.type', message.type);
        session.messages.unshift(message);
        this.updateSessionTitle(session);
        this.saveSessionsMetadata();
      }
    } else {
      this.createNewSession(NEW_SESSION_TITLE, [message]);
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

  async saveSessionsMetadata(): Promise<void> {
    try {
      await RNFS.writeFile(
        `${RNFS.DocumentDirectoryPath}/session-metadata.json`,
        JSON.stringify(this.sessions),
      );
    } catch (error) {
      console.error('Failed to save sessions metadata:', error);
    }
  }

  async createNewSession(
    title: string,
    initialMessages: MessageType.Any[] = [],
  ): Promise<void> {
    const id = new Date().toISOString();
    const metaData: SessionMetaData = {
      id,
      title,
      date: id,
      messages: initialMessages,
    };
    this.updateSessionTitle(metaData);
    this.sessions.push(metaData);
    this.activeSessionId = id;
    await RNFS.writeFile(
      `${RNFS.DocumentDirectoryPath}/session-metadata.json`,
      JSON.stringify(this.sessions),
    );
  }

  updateMessage(id: string, update: Partial<MessageType.Text>): void {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        const index = session.messages.findIndex(msg => msg.id === id);
        if (index >= 0 && session.messages[index].type === 'text') {
          session.messages[index] = {
            ...session.messages[index],
            ...update,
          } as MessageType.Text;
          this.saveSessionsMetadata();
        }
      }
    }
  }

  updateMessageToken(
    data: any,
    createdAt: number,
    id: string,
    context: LlamaContext,
  ): void {
    const {token} = data;
    runInAction(() => {
      if (this.activeSessionId) {
        const session = this.sessions.find(s => s.id === this.activeSessionId);
        if (session) {
          const index = session.messages.findIndex(msg => msg.id === id);
          if (index >= 0) {
            session.messages = session.messages.map((msg, i) => {
              if (msg.type === 'text' && i === index) {
                return {
                  ...msg,
                  text: (msg.text + token).replace(/^\s+/, ''),
                };
              }
              return msg;
            });
          } else {
            session.messages.unshift({
              author: assistant,
              createdAt,
              id,
              text: token,
              type: 'text',
              metadata: {contextId: context?.id, copyable: true},
            });
          }
          this.saveSessionsMetadata();
        }
      }
    });
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
          dateKey = 'Today';
        } else if (isYesterday(date)) {
          dateKey = 'Yesterday';
        } else if (daysAgo <= 6) {
          dateKey = 'This week';
        } else if (daysAgo <= 13) {
          dateKey = 'Last week';
        } else if (daysAgo <= 20) {
          dateKey = '2 weeks ago';
        } else if (daysAgo <= 27) {
          dateKey = '3 weeks ago';
        } else if (daysAgo <= 34) {
          dateKey = '4 weeks ago';
        } else if (daysAgo <= 60) {
          dateKey = 'Last month';
        } else {
          dateKey = 'Older';
        }

        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(session);
        return acc;
      },
      {},
    );

    // Define the order of keys
    const orderedKeys = [
      'Today',
      'Yesterday',
      'This week',
      'Last week',
      '2 weeks ago',
      '3 weeks ago',
      '4 weeks ago',
      'Last month',
      'Older',
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
  commitEdit(): void {
    if (this.activeSessionId && this.editingMessageId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        const messageIndex = session.messages.findIndex(
          msg => msg.id === this.editingMessageId,
        );
        if (messageIndex >= 0) {
          runInAction(() => {
            session.messages = session.messages.slice(messageIndex + 1);
            this.isEditMode = false;
            this.editingMessageId = null;
            this.saveSessionsMetadata();
          });
        }
      }
    }
  }

  /**
   * Removes messages from the current active session starting from a specific message ID.
   * If includeMessage is true, the message with the given ID is also removed.
   *
   * @param messageId - The ID of the message to start removal from.
   * @param includeMessage - Whether to include the message with the given ID in the removal.
   */
  removeMessagesFromId(
    messageId: string,
    includeMessage: boolean = true,
  ): void {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        const messageIndex = session.messages.findIndex(
          msg => msg.id === messageId,
        );
        if (messageIndex >= 0) {
          runInAction(() => {
            session.messages = session.messages.slice(
              includeMessage ? messageIndex + 1 : messageIndex,
            );
            this.saveSessionsMetadata();
          });
        }
      }
    }
  }
}

export const chatSessionStore = new ChatSessionStore();
