import {makeAutoObservable, runInAction} from 'mobx';
import {format, isToday, isYesterday} from 'date-fns';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  AgentStep,
  AgentToolCall,
  AgentToolOutcome,
  MessageType,
} from '../utils/types';
import {CompletionParams} from '../utils/completionTypes';
import {chatSessionRepository} from '../repositories/ChatSessionRepository';
import {defaultCompletionParams} from '../utils/completionSettingsVersions';
import {derivedText} from '../utils/chat';
import {palStore} from './PalStore';
import {deriveToolSchemas} from '../services/talents';
import {AgentUiState, initialAgentUiState} from '../services/agent';

/**
 * Update payload accepted by `updateMessage` / `updateMessageStreaming`.
 * Covers both `Text` updates (timings, copyable) and `AssistantTurn`
 * updates which carry top-level `steps` plus arbitrary metadata fields
 * (interrupted, copyable, etc.).
 */
type MessageUpdate =
  | Partial<MessageType.Text>
  | Partial<Omit<MessageType.AssistantTurn, 'type' | 'id' | 'author'>>;

const NEW_SESSION_TITLE = 'New Session';
const TITLE_LIMIT = 40;

// Minimum time between streaming UI updates to prevent excessive re-renders
// Set to 150ms to stay well above the 50ms threshold that triggers React warnings
const STREAMING_THROTTLE_MS = 150;

export interface SessionMetaData {
  id: string;
  title: string;
  date: string;
  messages: MessageType.Any[];
  completionSettings: CompletionParams;
  activePalId?: string;
  settingsSource: 'pal' | 'custom'; // Explicit choice: use pal settings or custom settings
  messagesLoaded?: boolean; // Track if messages are loaded for lazy loading
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
  /**
   * True between the moment the user taps Stop and the moment the
   * runner's loop has actually finished (i.e. native llama.rn has
   * returned from its in-flight `llama_decode` chunk and the for-await
   * loop in `useChatSession` exits). During this window the JS layer
   * cannot start a new completion (the native context is still busy)
   * — the send button must be disabled and the user needs visible
   * "Stopping…" feedback so they don't mistake the silent gap for the
   * stop having succeeded already.
   *
   * Cleared in the same place that clears `isGenerating` (after the
   * for-await loop ends, success or failure).
   */
  isStopping: boolean = false;
  newChatCompletionSettings: CompletionParams = defaultCompletionSettings;
  newChatPalId: string | undefined = undefined;
  newChatSettingsSource: 'pal' | 'custom' = 'pal';
  // Store localized date group names
  dateGroupNames: typeof DEFAULT_GROUP_NAMES = DEFAULT_GROUP_NAMES;
  // Migration status
  isMigrating: boolean = false;
  migrationComplete: boolean = false;
  // Draft autosave: ephemeral map of sessionId → unsent input text
  sessionDrafts: Map<string, string> = new Map();
  // Selection mode state
  isSelectionMode: boolean = false;
  selectedSessionIds: Set<string> = new Set();

  // UX state for the active agent run. Driven by `agentStateReducer`
  // from `AgentEvent`s emitted by the runner. The only writer is
  // `setAgentUiState`. Renderers compute the active-vs-persisted
  // predicate at the ChatView level.
  agentUiState: AgentUiState = initialAgentUiState;

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

  setIsStopping(value: boolean) {
    this.isStopping = value;
  }

  /**
   * The single writer of `agentUiState`. The hook drives this from the
   * `AgentEvent` stream via `agentStateReducer`. There is intentionally
   * NO imperative `setIsGeneratingToolCall` setter — UI flags derive
   * from `agentUiState.status` via `@computed get`.
   */
  setAgentUiState(state: AgentUiState) {
    this.agentUiState = state;
  }

  /**
   * Convenience derived flag for renderers that previously consulted a
   * boolean. Single source of truth: `agentUiState.status`.
   */
  get isGeneratingToolCall(): boolean {
    return this.agentUiState.status === 'generating_tool_call';
  }

  async loadSessionList(): Promise<void> {
    try {
      const sessions = await chatSessionRepository.getAllSessions();

      // Convert to SessionMetaData format
      const sessionMetadata: SessionMetaData[] = [];

      for (const session of sessions) {
        // Use metadata-only method instead of full getSessionById
        const sessionData =
          await chatSessionRepository.getSessionMetadataWithSettings(
            session.id,
          );
        if (!sessionData) {
          continue;
        }

        // DON'T load messages - leave array empty
        const messages: MessageType.Any[] = [];

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
          settingsSource: (session.settingsSource as 'pal' | 'custom') || 'pal',
          messagesLoaded: false, // Mark as not loaded for lazy loading
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
        this.sessionDrafts.delete(id);
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

  // Helper method to load messages for a session
  private async loadSessionMessages(sessionId: string): Promise<void> {
    try {
      const sessionData = await chatSessionRepository.getSessionById(sessionId);
      if (!sessionData) {
        console.warn(`Session ${sessionId} not found when loading messages`);
        return;
      }

      const session = this.sessions.find(s => s.id === sessionId);
      if (!session) {
        return;
      }

      const messages = sessionData.messages.map(msg => msg.toMessageObject());

      runInAction(() => {
        session.messages = messages;
        session.messagesLoaded = true;
      });
    } catch (error) {
      console.error(`Failed to load messages for session ${sessionId}:`, error);
    }
  }

  async setActiveSession(sessionId: string): Promise<void> {
    const session = this.sessions.find(s => s.id === sessionId);

    // Lazy-load messages if not already loaded
    if (session && !session.messagesLoaded) {
      await this.loadSessionMessages(sessionId);
    }

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
    if (session.messages.length === 0 || session.title !== NEW_SESSION_TITLE) {
      return;
    }
    // `updateSessionTitle` reads the LAST message of the session, which
    // is the most recently added one. The gate accepts both `text` and
    // `assistant_turn` rows so sessions whose latest message is an
    // assistant_turn (greeting bubbles, single-reply sessions, sessions
    // where the assistant has just replied) get titled correctly.
    const message = session.messages[session.messages.length - 1];
    if (message.type !== 'text' && message.type !== 'assistant_turn') {
      return;
    }
    const titleSource = derivedText(message);
    if (!titleSource) {
      return;
    }
    runInAction(() => {
      session.title =
        titleSource.length > TITLE_LIMIT
          ? `${titleSource.substring(0, TITLE_LIMIT)}...`
          : titleSource;
    });

    await chatSessionRepository.updateSessionTitle(session.id, session.title);
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
      // Resolve settings using the selected settings source so the
      // session snapshot matches what the model actually receives
      const palIdForSettings =
        this.newChatSettingsSource === 'pal' ? this.newChatPalId : undefined;
      const settings = await this.resolveCompletionSettings(
        undefined,
        palIdForSettings,
      );
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
        this.newChatSettingsSource,
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
        messagesLoaded: true, // Mark as loaded since we have the messages
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

  private streamingThrottleTimer: NodeJS.Timeout | null = null;
  /**
   * Pending throttled update. Discriminated so the same throttle slot
   * can serve both legacy `Text` updates (`kind: 'text'`) and the new
   * AssistantTurn active-step updates (`kind: 'step'`). Per-token writes
   * coalesce — they don't stack — because each call overwrites this slot.
   */
  private pendingStreamingUpdate:
    | {
        kind: 'text';
        id: string;
        sessionId: string;
        update: Partial<MessageType.Text>;
      }
    | {
        kind: 'step';
        id: string;
        sessionId: string;
        partial: Partial<AgentStep>;
      }
    | null = null;
  private lastStreamingUpdateTime: number = 0;

  /**
   * Schedule a throttled update through the shared throttle slot. The
   * scheduling logic is identical for both `text` and `step` shapes; only
   * the eventual `applyStreamingUpdate` dispatch differs.
   */
  private scheduleStreamingUpdate(): void {
    if (this.streamingThrottleTimer) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastStreamingUpdateTime;

    if (timeSinceLastUpdate >= STREAMING_THROTTLE_MS) {
      this.applyStreamingUpdate();
      this.lastStreamingUpdateTime = Date.now();
      return;
    }

    const remainingTime = STREAMING_THROTTLE_MS - timeSinceLastUpdate;
    this.streamingThrottleTimer = setTimeout(() => {
      this.streamingThrottleTimer = null;
      if (this.pendingStreamingUpdate) {
        this.applyStreamingUpdate();
        this.lastStreamingUpdateTime = Date.now();
      }
    }, remainingTime);
  }

  /**
   * Drain the throttled streaming slot synchronously. Call before any
   * structural change to `turn.steps` (e.g. pushAgentStep or
   * finalizeActiveStep) so a pending update scheduled for the previous
   * `lastIdx` lands on the step it was intended for, not on a freshly
   * pushed step that happens to be `lastIdx` when the timer fires.
   *
   * Without this, the regression sequence is: final `token` for step 0
   * schedules the throttle (fires in 150ms) → step_finished + tool_call
   * events run synchronously → step_started(1) pushes step 1 → throttle
   * timer fires → applies step 0's pending content to step 1, briefly
   * showing step 0's text duplicated under the talent block until the
   * follow-up step's first real token replaces it.
   */
  private flushStreamingUpdate(): void {
    if (this.streamingThrottleTimer) {
      clearTimeout(this.streamingThrottleTimer);
      this.streamingThrottleTimer = null;
    }
    if (this.pendingStreamingUpdate) {
      this.applyStreamingUpdate();
      this.lastStreamingUpdateTime = Date.now();
    }
  }

  // Update message during streaming - no database write, triggers reactivity
  // Throttled to avoid excessive re-renders. Accepts either a Text-shaped
  // partial (legacy path) or an AssistantTurn-shaped partial (new
  // pipeline). The hook should prefer `updateActiveStepStreaming` for
  // assistant_turn rows; this remains for the legacy code path.
  updateMessageStreaming(
    id: string,
    sessionId: string,
    update: MessageUpdate,
  ): void {
    this.pendingStreamingUpdate = {
      kind: 'text',
      id,
      sessionId,
      update: update as Partial<MessageType.Text>,
    };
    this.scheduleStreamingUpdate();
  }

  /**
   * Throttled streaming update for an `assistant_turn` row's active
   * (last) step. Reuses the same `streamingThrottleTimer` slot as
   * `updateMessageStreaming` so per-token writes coalesce and do not
   * stack across the two paths.
   */
  updateActiveStepStreaming(
    id: string,
    sessionId: string,
    partial: Partial<AgentStep>,
  ): void {
    this.pendingStreamingUpdate = {kind: 'step', id, sessionId, partial};
    this.scheduleStreamingUpdate();
  }

  private applyStreamingUpdate(): void {
    if (!this.pendingStreamingUpdate) {
      return;
    }

    const pending = this.pendingStreamingUpdate;
    this.pendingStreamingUpdate = null;

    const targetSessionId = pending.sessionId || this.activeSessionId;
    if (!targetSessionId) {
      return;
    }

    const session = this.sessions.find(s => s.id === targetSessionId);
    if (!session) {
      return;
    }

    const message = session.messages.find(msg => msg.id === pending.id);
    if (!message) {
      return;
    }

    if (pending.kind === 'text') {
      // Legacy text path. Gate widened to also accept assistant_turn so
      // ad-hoc metadata writes (e.g. error rollback) don't silently no-op
      // on the new shape.
      if (message.type !== 'text' && message.type !== 'assistant_turn') {
        return;
      }
      const update = pending.update;
      runInAction(() => {
        if (message.type === 'text' && update.text !== undefined) {
          (message as MessageType.Text).text = update.text;
        }
        if (update.metadata !== undefined) {
          message.metadata = {
            ...(message.metadata || {}),
            ...update.metadata,
          };
        }
      });

      chatSessionRepository
        .updateMessage(pending.id, update)
        .catch(error =>
          console.error('Failed to persist streaming update to DB:', error),
        );
      return;
    }

    // pending.kind === 'step'
    if (message.type !== 'assistant_turn') {
      return;
    }
    const turn = message as MessageType.AssistantTurn;
    if (!turn.steps || turn.steps.length === 0) {
      return;
    }
    const partial = pending.partial;
    runInAction(() => {
      const lastIdx = turn.steps.length - 1;
      const last = turn.steps[lastIdx];
      // Shallow merge of step fields. `pushAgentStep` adds new steps;
      // this only mutates the active (last) one in place.
      turn.steps[lastIdx] = {
        ...last,
        ...partial,
      };
    });

    chatSessionRepository
      .updateMessage(pending.id, {steps: turn.steps})
      .catch(error =>
        console.error('Failed to persist streaming step update to DB:', error),
      );
  }

  async updateMessage(
    id: string,
    sessionId: string,
    update: MessageUpdate,
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
          if (index < 0) {
            return;
          }
          const existingType = session.messages[index].type;
          if (existingType !== 'text' && existingType !== 'assistant_turn') {
            return;
          }

          // Update local state - only update the specific message
          runInAction(() => {
            const existingMessage = session.messages[index];
            const mergedUpdate: Record<string, any> = {...update};

            // Merge metadata instead of replacing, to preserve existing
            // fields (e.g., timings written by an earlier event, or
            // metadata.steps if a caller naively passes metadata.steps —
            // though this should not happen since metadata.steps is a
            // persistence-layer detail).
            if (update.metadata !== undefined && existingMessage.metadata) {
              mergedUpdate.metadata = {
                ...existingMessage.metadata,
                ...update.metadata,
              };
            }

            session.messages[index] = {
              ...existingMessage,
              ...mergedUpdate,
            } as MessageType.Any;
          });
        }
      }
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  }

  /**
   * Append a new step to an `assistant_turn` row. Writes the whole
   * `steps` array wholesale (no shallow-merge tricks — see Persistence
   * notes in the story). Used by the agent runner via `applyEventToStore`
   * on `step_started`.
   */
  async pushAgentStep(
    id: string,
    sessionId: string,
    step: AgentStep,
  ): Promise<void> {
    // Drain any pending throttled update onto the CURRENT lastIdx
    // before structurally extending the array. Otherwise a pending
    // step-0 write would land on the freshly pushed step-1 when the
    // timer fires.
    this.flushStreamingUpdate();
    const targetSessionId = sessionId || this.activeSessionId;
    if (!targetSessionId) {
      return;
    }
    const session = this.sessions.find(s => s.id === targetSessionId);
    if (!session) {
      return;
    }
    const index = session.messages.findIndex(msg => msg.id === id);
    if (index < 0) {
      return;
    }
    const message = session.messages[index];
    if (message.type !== 'assistant_turn') {
      return;
    }
    const turn = message as MessageType.AssistantTurn;
    let nextSteps: AgentStep[] = [];
    runInAction(() => {
      nextSteps = [...(turn.steps ?? []), step];
      turn.steps = nextSteps;
    });
    try {
      await chatSessionRepository.updateMessage(id, {steps: nextSteps});
    } catch (error) {
      console.error('Failed to persist pushAgentStep:', error);
    }
  }

  /**
   * Replace the active (last) step's `toolCalls` array with the
   * runner's authoritative normalized list. Called from the hook
   * once per step on `step_finished`, with ids that match the
   * upcoming `appendToolOutcome` callIds by construction.
   *
   * Single writer for `step.toolCalls` — the streaming partial in
   * `applyEventToStore` does not write this field.
   */
  async appendToolCall(
    id: string,
    sessionId: string,
    calls: AgentToolCall[],
  ): Promise<void> {
    const targetSessionId = sessionId || this.activeSessionId;
    if (!targetSessionId) {
      return;
    }
    const session = this.sessions.find(s => s.id === targetSessionId);
    if (!session) {
      return;
    }
    const index = session.messages.findIndex(msg => msg.id === id);
    if (index < 0) {
      return;
    }
    const message = session.messages[index];
    if (message.type !== 'assistant_turn') {
      return;
    }
    const turn = message as MessageType.AssistantTurn;
    if (!turn.steps || turn.steps.length === 0) {
      return;
    }
    let nextSteps: AgentStep[] = [];
    runInAction(() => {
      const lastIdx = turn.steps.length - 1;
      const last = turn.steps[lastIdx];
      const nextLast: AgentStep = {...last, toolCalls: calls};
      nextSteps = [...turn.steps.slice(0, lastIdx), nextLast];
      turn.steps = nextSteps;
    });
    try {
      await chatSessionRepository.updateMessage(id, {steps: nextSteps});
    } catch (error) {
      console.error('Failed to persist appendToolCall:', error);
    }
  }

  /**
   * Append a tool outcome to the active (last) step of an
   * `assistant_turn` row. Writes the whole `steps` array wholesale.
   */
  async appendToolOutcome(
    id: string,
    sessionId: string,
    outcome: AgentToolOutcome,
  ): Promise<void> {
    const targetSessionId = sessionId || this.activeSessionId;
    if (!targetSessionId) {
      return;
    }
    const session = this.sessions.find(s => s.id === targetSessionId);
    if (!session) {
      return;
    }
    const index = session.messages.findIndex(msg => msg.id === id);
    if (index < 0) {
      return;
    }
    const message = session.messages[index];
    if (message.type !== 'assistant_turn') {
      return;
    }
    const turn = message as MessageType.AssistantTurn;
    if (!turn.steps || turn.steps.length === 0) {
      return;
    }
    let nextSteps: AgentStep[] = [];
    runInAction(() => {
      const lastIdx = turn.steps.length - 1;
      const last = turn.steps[lastIdx];
      const nextLast: AgentStep = {
        ...last,
        toolOutcomes: [...(last.toolOutcomes ?? []), outcome],
      };
      nextSteps = [...turn.steps.slice(0, lastIdx), nextLast];
      turn.steps = nextSteps;
    });
    try {
      await chatSessionRepository.updateMessage(id, {steps: nextSteps});
    } catch (error) {
      console.error('Failed to persist appendToolOutcome:', error);
    }
  }

  /**
   * Mark the active (last) step as no longer streaming. Writes the
   * whole `steps` array wholesale.
   */
  async finalizeActiveStep(id: string, sessionId: string): Promise<void> {
    // Drain any pending throttled update first so the final partial
    // content for this step lands BEFORE we mark it `partial: false`
    // and replace the array. Otherwise a late-firing timer could
    // either (a) write to a stale array reference or (b) write to
    // whatever step happens to be lastIdx after this finalize completes.
    this.flushStreamingUpdate();
    const targetSessionId = sessionId || this.activeSessionId;
    if (!targetSessionId) {
      return;
    }
    const session = this.sessions.find(s => s.id === targetSessionId);
    if (!session) {
      return;
    }
    const index = session.messages.findIndex(msg => msg.id === id);
    if (index < 0) {
      return;
    }
    const message = session.messages[index];
    if (message.type !== 'assistant_turn') {
      return;
    }
    const turn = message as MessageType.AssistantTurn;
    if (!turn.steps || turn.steps.length === 0) {
      return;
    }
    let nextSteps: AgentStep[] = [];
    runInAction(() => {
      const lastIdx = turn.steps.length - 1;
      const last = turn.steps[lastIdx];
      const nextLast: AgentStep = {...last, partial: false};
      nextSteps = [...turn.steps.slice(0, lastIdx), nextLast];
      turn.steps = nextSteps;
    });
    try {
      await chatSessionRepository.updateMessage(id, {steps: nextSteps});
    } catch (error) {
      console.error('Failed to persist finalizeActiveStep:', error);
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
          await chatSessionRepository.setSessionSettingsSource(
            this.activeSessionId,
            'custom',
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
        await chatSessionRepository.setSessionSettingsSource(
          this.activeSessionId,
          source,
        );
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

  // Selection mode computed properties
  get selectedCount(): number {
    return this.selectedSessionIds.size;
  }

  get allSelected(): boolean {
    return (
      this.sessions.length > 0 &&
      this.selectedSessionIds.size === this.sessions.length
    );
  }

  // Selection mode actions
  enterSelectionMode(sessionId?: string) {
    runInAction(() => {
      this.isSelectionMode = true;
      this.selectedSessionIds.clear();
      if (sessionId) {
        this.selectedSessionIds.add(sessionId);
      }
    });
  }

  exitSelectionMode() {
    runInAction(() => {
      this.isSelectionMode = false;
      this.selectedSessionIds.clear();
    });
  }

  toggleSessionSelection(sessionId: string) {
    runInAction(() => {
      if (this.selectedSessionIds.has(sessionId)) {
        this.selectedSessionIds.delete(sessionId);
      } else {
        this.selectedSessionIds.add(sessionId);
      }
    });
  }

  selectAllSessions() {
    runInAction(() => {
      this.sessions.forEach(session => {
        this.selectedSessionIds.add(session.id);
      });
    });
  }

  deselectAllSessions() {
    runInAction(() => {
      this.selectedSessionIds.clear();
    });
  }

  async bulkDeleteSessions(): Promise<void> {
    try {
      const idsToDelete = Array.from(this.selectedSessionIds);

      // Delete from database
      await chatSessionRepository.deleteSessions(idsToDelete);

      // Check if active session was deleted
      const wasActiveSessionDeleted =
        this.activeSessionId && idsToDelete.includes(this.activeSessionId);

      if (wasActiveSessionDeleted) {
        this.resetActiveSession();
      }

      // Update local state and exit selection mode
      runInAction(() => {
        idsToDelete.forEach(deletedId => this.sessionDrafts.delete(deletedId));
        this.sessions = this.sessions.filter(
          session => !idsToDelete.includes(session.id),
        );
        this.exitSelectionMode();
      });
    } catch (error) {
      console.error('Failed to bulk delete sessions:', error);
      throw error;
    }
  }

  async bulkExportSessions(): Promise<void> {
    try {
      const idsToExport = Array.from(this.selectedSessionIds);
      await chatSessionRepository.exportSessions(idsToExport);

      runInAction(() => {
        this.exitSelectionMode();
      });
    } catch (error) {
      console.error('Failed to bulk export sessions:', error);
      throw error;
    }
  }

  // Draft autosave methods (ephemeral, not persisted to DB)
  saveDraft(sessionId: string, text: string) {
    if (text.trim()) {
      this.sessionDrafts.set(sessionId, text);
    } else {
      this.sessionDrafts.delete(sessionId);
    }
  }

  getDraft(sessionId: string): string {
    return this.sessionDrafts.get(sessionId) || '';
  }

  clearDraft(sessionId: string) {
    this.sessionDrafts.delete(sessionId);
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

      // Inject tool schemas from pact.talents (PACT → completionSettings.tools)
      const talentNames = pal?.pact?.talents?.map(t => t.name);
      if (talentNames && talentNames.length > 0) {
        const tools = deriveToolSchemas(talentNames);
        if (tools.length > 0) {
          resolvedSettings = {
            ...resolvedSettings,
            tools,
          };
        }
      }
    }

    // Apply session-specific settings based on explicit user choice
    if (sessionId) {
      const session = this.sessions.find(s => s.id === sessionId);

      if (session?.settingsSource === 'custom') {
        // User explicitly chose custom settings - use session settings.
        // Preserve PACT-derived tools — custom settings control generation
        // params (temperature, etc.) but pact.talents is the source of truth
        // for tool availability.
        const pactTools = resolvedSettings.tools;
        resolvedSettings = session.completionSettings;
        if (pactTools) {
          resolvedSettings = {...resolvedSettings, tools: pactTools};
        }
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
