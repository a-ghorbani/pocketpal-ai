import {TalentEngine, TalentResult, ToolDefinition} from './types';

export class DatetimeEngine implements TalentEngine {
  readonly name = 'datetime';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const tz = typeof args.timezone === 'string' ? args.timezone : undefined;
    const phoneTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const effectiveTz = tz ?? phoneTz;

    try {
      // Intl is the source of truth for tz math; dayjs-timezone is
      // unreliable on Hermes because it depends on ICU internals that
      // aren't fully exposed. Intl.DateTimeFormat also throws
      // RangeError for unknown zones, which doubles as validation.
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: effectiveTz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).formatToParts(new Date());
      const get = (type: string) =>
        parts.find(p => p.type === type)?.value ?? '00';
      const summary = `${get('year')}-${get('month')}-${get('day')}T${get(
        'hour',
      )}:${get('minute')}:${get('second')} (${effectiveTz})`;
      return {type: 'text', summary};
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `datetime: ${errMsg}. If you can recover using correct arguments, retry. Otherwise, give up.`,
        errorMessage: errMsg,
      };
    }
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'datetime',
        description:
          'Get the current date and time. Defaults to the device timezone.',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description:
                'Optional IANA timezone (e.g. "Asia/Tokyo"). Use the canonical zone for the country (Germany → "Europe/Berlin"). Omit to get device time.',
            },
          },
        },
      },
    };
  }
}
