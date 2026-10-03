import {
  inheritedCompletionSettings,
  modelCompletionSettingsDraft,
  processCompletionSettingsDraft,
} from '../completionSettingsDraft';

describe('completion settings drafts', () => {
  it('builds an inherited draft without mutating defaults', () => {
    const defaults = {temperature: 0.7};

    const result = inheritedCompletionSettings(defaults);

    expect(result.temperature).toBe(0.7);
    expect(result.generationParameterModes?.temperature).toBe('inherit');
    expect(defaults).toEqual({temperature: 0.7});
  });

  it('marks authored scalar and nested effort values for sending', () => {
    const result = modelCompletionSettingsDraft(
      {temperature: 0.7, reasoning: {enabled: true, effort: 'low'}},
      {
        temperature: 0.2,
        reasoning: {enabled: false, effort: 'high'},
        generationParameterModes: {temperature: 'omit'},
      },
    );

    expect(result.temperature).toBe(0.2);
    expect(result.generationParameterModes).toMatchObject({
      temperature: 'omit',
      reasoning: 'send',
      reasoning_effort: 'send',
      top_p: 'inherit',
    });
  });

  it('converts sent numeric strings and retains invalid inherited values', () => {
    const result = processCompletionSettingsDraft(
      {
        temperature: '0.25' as unknown as number,
        top_p: 'invalid' as unknown as number,
        generationParameterModes: {
          temperature: 'send',
          top_p: 'inherit',
        },
      },
      'invalid number',
    );

    expect(result.settings.temperature).toBe(0.25);
    expect(result.settings.top_p).toBe('invalid');
    expect(result.errors).toEqual({});
  });

  it('reports conversion and range errors for sent values', () => {
    const result = processCompletionSettingsDraft(
      {
        temperature: 'invalid' as unknown as number,
        top_p: 2,
        generationParameterModes: {
          temperature: 'send',
          top_p: 'send',
        },
      },
      'invalid number',
    );

    expect(result.errors.temperature).toBeDefined();
    expect(result.errors.top_p).toBeDefined();
  });
});
