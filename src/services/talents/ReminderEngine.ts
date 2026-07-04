import {TalentEngine, TalentResult, ToolDefinition} from './types';

/**
 * ReminderEngine — sets a reminder / countdown timer.
 *
 * Purely informational: returns a summary of when the reminder fires.
 * The native notification scheduling is handled by the caller (a future
 * NotificationService); this engine exists so the model can negotiate
 * reminder semantics via tool-calling.
 */
export class ReminderEngine implements TalentEngine {
  readonly name = 'set_reminder';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const message =
      typeof args.message === 'string' ? args.message.trim() : '';
    if (!message) {
      return {
        type: 'error',
        summary: 'set_reminder: missing "message" argument',
        errorMessage: 'message is required',
      };
    }

    // Accept either `delay_seconds` (number) or `when` (ISO 8601 string).
    let fireAt: Date;
    if (typeof args.delay_seconds === 'number') {
      const seconds = args.delay_seconds;
      if (seconds <= 0 || seconds > 86400 * 365) {
        return {
          type: 'error',
          summary: `set_reminder: delay_seconds ${seconds} out of range`,
          errorMessage: 'delay_seconds must be between 1 and 31536000',
        };
      }
      fireAt = new Date(Date.now() + seconds * 1000);
    } else if (typeof args.when === 'string') {
      const parsed = new Date(args.when);
      if (isNaN(parsed.getTime())) {
        return {
          type: 'error',
          summary: `set_reminder: invalid "when" value: ${args.when}`,
          errorMessage: 'when must be a valid ISO 8601 date string',
        };
      }
      fireAt = parsed;
    } else {
      return {
        type: 'error',
        summary: 'set_reminder: requires either delay_seconds or when',
        errorMessage: 'Provide delay_seconds (number) or when (ISO string)',
      };
    }

    const iso = fireAt.toISOString();
    const friendly = fireAt.toLocaleString();

    return {
      type: 'text',
      summary: `Reminder set: "${message}" at ${iso} (${friendly})`,
    };
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'set_reminder',
        description:
          'Set a reminder for a future time. Returns the scheduled time in ISO format.',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The reminder message to display.',
            },
            delay_seconds: {
              type: 'number',
              description:
                'Seconds from now to fire the reminder (e.g. 300 for 5 minutes).',
            },
            when: {
              type: 'string',
              description:
                'ISO 8601 datetime for when to fire (e.g. "2025-03-15T09:00:00Z").',
            },
          },
          required: ['message'],
        },
      },
    };
  }
}
