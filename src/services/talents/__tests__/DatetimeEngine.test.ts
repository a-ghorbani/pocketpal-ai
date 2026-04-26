import {DatetimeEngine} from '../DatetimeEngine';

describe('DatetimeEngine', () => {
  const engine = new DatetimeEngine();

  it('exposes name "datetime"', () => {
    expect(engine.name).toBe('datetime');
  });

  describe('action=now', () => {
    it('returns an ISO string for default action', async () => {
      const result = await engine.execute({action: 'now'});
      expect(result.type).toBe('text');
      expect(result.summary).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('defaults to action=now when action is omitted', async () => {
      const result = await engine.execute({});
      expect(result.type).toBe('text');
      expect(result.summary).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('supports custom format', async () => {
      const result = await engine.execute({
        action: 'now',
        format: 'YYYY-MM-DD',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('supports timezone parameter', async () => {
      const result = await engine.execute({
        action: 'now',
        timezone: 'America/New_York',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toMatch(/\d{4}/);
    });
  });

  describe('action=format', () => {
    it('formats a given date', async () => {
      const result = await engine.execute({
        action: 'format',
        date1: '2026-01-15T12:00:00Z',
        format: 'YYYY-MM-DD',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toBe('2026-01-15');
    });

    it('uses default format when format is omitted', async () => {
      const result = await engine.execute({
        action: 'format',
        date1: '2026-06-15T12:00:00Z',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toBe('2026-06-15');
    });

    it('returns error when date1 is missing', async () => {
      const result = await engine.execute({action: 'format'});
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.errorMessage).toMatch(/date1 is required/);
      }
    });
  });

  describe('action=diff', () => {
    it('computes difference in days', async () => {
      const result = await engine.execute({
        action: 'diff',
        date1: '2026-01-10',
        date2: '2026-01-01',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toBe('9 day(s)');
    });

    it('computes difference in hours', async () => {
      const result = await engine.execute({
        action: 'diff',
        date1: '2026-01-02T00:00:00Z',
        date2: '2026-01-01T00:00:00Z',
        unit: 'hour',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toBe('24 hour(s)');
    });

    it('returns error when date1 is missing', async () => {
      const result = await engine.execute({
        action: 'diff',
        date2: '2026-01-01',
      });
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.errorMessage).toMatch(
          /both date1 and date2 are required/,
        );
      }
    });

    it('returns error when date2 is missing', async () => {
      const result = await engine.execute({
        action: 'diff',
        date1: '2026-01-01',
      });
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.errorMessage).toMatch(
          /both date1 and date2 are required/,
        );
      }
    });
  });

  it('returns error for unknown action', async () => {
    const result = await engine.execute({action: 'bogus'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/Supported actions/);
    }
  });

  // --- Additional edge cases (TASK-20260415-1200 tester) ---

  describe('action=now with invalid timezone', () => {
    it('returns error for invalid timezone string', async () => {
      const result = await engine.execute({
        action: 'now',
        timezone: 'Invalid/Nonexistent',
      });
      // dayjs throws on invalid timezone, caught by try/catch
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.errorMessage).toBeDefined();
      }
    });
  });

  describe('action=format with invalid date strings', () => {
    it('handles completely invalid date string', async () => {
      const result = await engine.execute({
        action: 'format',
        date1: 'not-a-date',
      });
      // dayjs wraps invalid dates — returns "Invalid Date" formatted
      expect(result.type).toBe('text');
      expect(result.summary).toBe('Invalid Date');
    });

    it('handles empty string after type check', async () => {
      // date1 must be provided as a string, but an empty string triggers error
      const result = await engine.execute({
        action: 'format',
        date1: '',
      });
      expect(result.type).toBe('error');
    });
  });

  describe('action=diff with edge cases', () => {
    it('returns 0 for identical dates', async () => {
      const result = await engine.execute({
        action: 'diff',
        date1: '2026-06-15',
        date2: '2026-06-15',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toBe('0 day(s)');
    });

    it('returns negative diff when date1 < date2', async () => {
      const result = await engine.execute({
        action: 'diff',
        date1: '2026-01-01',
        date2: '2026-01-10',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toBe('-9 day(s)');
    });

    it('handles minute unit', async () => {
      const result = await engine.execute({
        action: 'diff',
        date1: '2026-01-01T01:00:00Z',
        date2: '2026-01-01T00:00:00Z',
        unit: 'minute',
      });
      expect(result.type).toBe('text');
      expect(result.summary).toBe('60 minute(s)');
    });
  });

  describe('action=now with non-string arguments', () => {
    it('ignores non-string timezone (treats as undefined)', async () => {
      const result = await engine.execute({
        action: 'now',
        timezone: 123 as any,
      });
      expect(result.type).toBe('text');
    });

    it('ignores non-string format (uses ISO default)', async () => {
      const result = await engine.execute({
        action: 'now',
        format: 42 as any,
      });
      expect(result.type).toBe('text');
      // Should get ISO format since format is not a string
      expect(result.summary).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('ignores non-string action (defaults to now)', async () => {
      const result = await engine.execute({action: 999 as any});
      expect(result.type).toBe('text');
      expect(result.summary).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
