import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import {TalentEngine, TalentResult, ToolDefinition} from './types';

dayjs.extend(utc);
dayjs.extend(timezone);

export class DatetimeEngine implements TalentEngine {
  readonly name = 'datetime';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const action = typeof args.action === 'string' ? args.action : 'now';
    const tz = typeof args.timezone === 'string' ? args.timezone : undefined;

    try {
      switch (action) {
        case 'now': {
          const now = tz ? dayjs().tz(tz) : dayjs();
          const formatted =
            typeof args.format === 'string'
              ? now.format(args.format)
              : tz
                ? now.format('YYYY-MM-DDTHH:mm:ssZ')
                : now.toISOString();
          return {type: 'text', summary: formatted};
        }
        case 'format': {
          const date = typeof args.date1 === 'string' ? args.date1 : '';
          if (!date) {
            return {
              type: 'error',
              summary: 'datetime: "date1" required for format',
              errorMessage: 'date1 is required',
            };
          }
          const fmt =
            typeof args.format === 'string' ? args.format : 'YYYY-MM-DD';
          const d = tz ? dayjs(date).tz(tz) : dayjs(date);
          return {type: 'text', summary: d.format(fmt)};
        }
        case 'diff': {
          const d1 = typeof args.date1 === 'string' ? args.date1 : '';
          const d2 = typeof args.date2 === 'string' ? args.date2 : '';
          if (!d1 || !d2) {
            return {
              type: 'error',
              summary: 'datetime: "date1" and "date2" required for diff',
              errorMessage: 'both date1 and date2 are required',
            };
          }
          const unit = typeof args.unit === 'string' ? args.unit : 'day';
          const diff = dayjs(d1).diff(dayjs(d2), unit as any);
          return {type: 'text', summary: `${diff} ${unit}(s)`};
        }
        default:
          return {
            type: 'error',
            summary: `datetime: unknown action "${action}"`,
            errorMessage: 'Supported actions: now, format, diff',
          };
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `datetime: ${errMsg}`,
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
          'Get current date/time, format dates, or compute date differences.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['now', 'format', 'diff'],
              description:
                'Action to perform. "now" returns current time, "format" formats a date, "diff" computes difference between two dates.',
            },
            timezone: {
              type: 'string',
              description:
                'IANA timezone name (e.g., "America/New_York"). Optional.',
            },
            date1: {
              type: 'string',
              description:
                'First date (ISO 8601). Required for "format" and "diff".',
            },
            date2: {
              type: 'string',
              description: 'Second date (ISO 8601). Required for "diff".',
            },
            format: {
              type: 'string',
              description:
                'Output format string (dayjs format, e.g., "YYYY-MM-DD HH:mm"). Default: ISO 8601.',
            },
            unit: {
              type: 'string',
              enum: [
                'year',
                'month',
                'week',
                'day',
                'hour',
                'minute',
                'second',
              ],
              description: 'Unit for diff calculation. Default: "day".',
            },
          },
          required: ['action'],
        },
      },
    };
  }
}
