import {collectSystemPromptFragments} from '../index';
import type {SystemPromptContext} from '../types';

const ctx: SystemPromptContext = {
  now: new Date('2026-07-15T12:00:00Z'),
  maxToolTurns: 5,
};

describe('collectSystemPromptFragments', () => {
  it('collects the web_search fragment when web_search is enabled', () => {
    const fragments = collectSystemPromptFragments(['web_search'], ctx);

    expect(fragments).toHaveLength(1);
    expect(fragments[0]).toContain("Today's date is 2026-07-15");
    expect(fragments[0]).toContain('budget of 4 tool calls');
    expect(fragments[0]).toContain('web_search');
  });

  it('does not duplicate the fragment when read_url rides alongside web_search', () => {
    // read_url contributes no fragment of its own, so the assembled grounding
    // for the common both-enabled Pal stays byte-identical to web_search alone.
    expect(
      collectSystemPromptFragments(['web_search', 'read_url'], ctx),
    ).toEqual(collectSystemPromptFragments(['web_search'], ctx));
  });

  it('returns nothing for talents that contribute no fragment', () => {
    expect(
      collectSystemPromptFragments(['calculate', 'datetime'], ctx),
    ).toEqual([]);
    expect(collectSystemPromptFragments(['read_url'], ctx)).toEqual([]);
  });

  it('returns nothing when no talents are enabled', () => {
    expect(collectSystemPromptFragments([], ctx)).toEqual([]);
  });

  it('ignores unknown talent names', () => {
    expect(collectSystemPromptFragments(['not_a_real_talent'], ctx)).toEqual(
      [],
    );
  });
});
