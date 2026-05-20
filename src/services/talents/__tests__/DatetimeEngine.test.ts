import {DatetimeEngine} from '../DatetimeEngine';

describe('DatetimeEngine', () => {
  const engine = new DatetimeEngine();

  it('exposes name "datetime"', () => {
    expect(engine.name).toBe('datetime');
  });

  it('returns current time with IANA tz suffix by default', async () => {
    const result = await engine.execute({});
    expect(result.type).toBe('text');
    // "2026-05-14T13:30:00+01:00 (Europe/Berlin)" — ISO + " (zone)"
    // "2026-05-14T09:19:43 (Europe/Berlin)"
    expect(result.summary).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} \([^)]+\)$/,
    );
  });

  it('honours an explicit timezone argument', async () => {
    const result = await engine.execute({timezone: 'America/New_York'});
    expect(result.type).toBe('text');
    expect(result.summary).toContain('(America/New_York)');
  });

  it('ignores non-string timezone (falls back to device tz)', async () => {
    const result = await engine.execute({timezone: 123 as any});
    expect(result.type).toBe('text');
    expect(result.summary).toMatch(/\([^)]+\)$/);
  });

  it('returns an error for an invalid IANA timezone', async () => {
    const result = await engine.execute({timezone: 'Europe/Nuremberg'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toBeDefined();
    }
  });
});
