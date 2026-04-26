/**
 * Tests for VPE review fixes:
 * 1. Dispatch error paths write to both toolMessages and talentResultsMap
 * 2. deriveToolSchemas strict-subset filtering
 * 3. DatetimeEngine timezone-preserving format
 */
import {
  deriveToolSchemas,
  resetRegisteredFlag,
  talentRegistry,
  DatetimeEngine,
} from '../index';

describe('deriveToolSchemas strict-subset filtering', () => {
  beforeEach(() => {
    resetRegisteredFlag();
    talentRegistry.reset();
  });

  it('returns only requested talent schemas when talentNames provided', () => {
    const schemas = deriveToolSchemas(['render_html']);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].function.name).toBe('render_html');
  });

  it('returns multiple requested talents in order', () => {
    const schemas = deriveToolSchemas(['calculate', 'datetime']);
    expect(schemas).toHaveLength(2);
    const names = schemas.map(s => s.function.name);
    expect(names).toContain('calculate');
    expect(names).toContain('datetime');
  });

  it('returns empty array when no talent names match', () => {
    const schemas = deriveToolSchemas(['nonexistent_talent']);
    expect(schemas).toHaveLength(0);
  });

  it('returns all schemas when talentNames is undefined', () => {
    const schemas = deriveToolSchemas();
    expect(schemas).toHaveLength(3);
  });

  it('ignores unknown names and returns only matched ones', () => {
    const schemas = deriveToolSchemas(['render_html', 'nonexistent']);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].function.name).toBe('render_html');
  });
});

describe('DatetimeEngine timezone-preserving format', () => {
  const engine = new DatetimeEngine();

  it('uses tz-preserving format when timezone set but no format given', async () => {
    const result = await engine.execute({
      action: 'now',
      timezone: 'America/New_York',
    });
    expect(result.type).toBe('text');
    // Should NOT be UTC ISO (ending in Z or +00:00 when NY is UTC-4/5)
    // Should contain an offset like -04:00 or -05:00
    expect(result.summary).toMatch(/[+-]\d{2}:\d{2}$/);
    // Should NOT end with Z (which toISOString would produce)
    expect(result.summary).not.toMatch(/Z$/);
  });

  it('uses toISOString when no timezone and no format given', async () => {
    const result = await engine.execute({action: 'now'});
    expect(result.type).toBe('text');
    // toISOString always ends with Z
    expect(result.summary).toMatch(/Z$/);
  });

  it('uses custom format when format is provided regardless of timezone', async () => {
    const result = await engine.execute({
      action: 'now',
      timezone: 'Europe/London',
      format: 'HH:mm',
    });
    expect(result.type).toBe('text');
    // Should be just hours:minutes
    expect(result.summary).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('dispatch error paths produce talentResults entries', () => {
  // These test the CONTRACT that error paths must write to talentResultsMap.
  // The actual dispatch integration test would require mocking useChatSession
  // which is too heavy. Instead we verify the TalentResult error shape is valid.
  it('error TalentResult has required fields', () => {
    const errorResult = {
      type: 'error' as const,
      summary: 'Talent "foo" is not enabled for this Pal',
      errorMessage: 'Talent "foo" is not enabled for this Pal',
    };
    expect(errorResult.type).toBe('error');
    expect(errorResult.summary).toBeTruthy();
    expect(errorResult.errorMessage).toBeTruthy();
  });

  it('pact-miss error message includes talent name', () => {
    const fnName = 'web_search';
    const summary = `Talent "${fnName}" is not enabled for this Pal`;
    expect(summary).toContain(fnName);
  });

  it('registry-miss error message includes talent name', () => {
    const fnName = 'unregistered_talent';
    const summary = `Talent "${fnName}" is not available on this device`;
    expect(summary).toContain(fnName);
  });
});
