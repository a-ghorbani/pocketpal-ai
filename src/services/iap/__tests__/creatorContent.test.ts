import {
  CREATOR_FIELDS,
  changedCreatorFields,
  normalise,
  projectCreatorContent,
} from '../creatorContent';
import {palsHubApiService} from '../../palshub/PalsHubApiService';
import type {ApiPalResponse} from '../../palshub/PalsHubApiService';
import {apiPal} from '../../../../jest/fixtures/iap';

jest.mock('../../../utils/completionSettingsVersions', () => ({
  defaultCompletionParams: {temperature: 0.1, n_predict: 1},
}));

const raw = (overrides: Record<string, unknown> = {}) =>
  apiPal({
    model_reference: {repo_id: 'org/repo', filename: 'model.gguf'},
    model_settings: {temperature: 0.7},
    pact: {talents: [{name: 'calculate', required: true}]},
    greeting: {text: 'Hi', suggested_prompts: ['Tell me a story']},
    categories: [{id: 'c1', name: 'Writing'}],
    tags: [{id: 't1', name: 'stories'}],
    creator: {id: 'creator-1', display_name: 'Ada', avatar_url: 'a.png'},
    ...overrides,
  });

const project = (overrides: Record<string, unknown> = {}) =>
  projectCreatorContent(raw(overrides));

describe('normalise', () => {
  it.each([undefined, null, '', [], {}, {a: undefined, b: null, c: ''}])(
    'maps %p to absent',
    value => {
      expect(normalise(value)).toBeUndefined();
    },
  );

  it('keeps strings exact and non-empty values as they are', () => {
    expect(normalise(' a ')).toBe(' a ');
    expect(normalise(0)).toBe(0);
    expect(normalise(false)).toBe(false);
  });

  it('sorts object keys and drops absent keys recursively', () => {
    expect(JSON.stringify(normalise({b: 1, a: {d: [], c: 'x'}, e: null}))).toBe(
      '{"a":{"c":"x"},"b":1}',
    );
  });

  it('keeps array order', () => {
    expect(normalise(['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('changedCreatorFields', () => {
  it('counts every field as changed without an applied snapshot', () => {
    expect([...changedCreatorFields(undefined, project())]).toEqual([
      ...CREATOR_FIELDS,
    ]);
  });

  it('finds no change between equal versions', () => {
    expect(changedCreatorFields(project(), project()).size).toBe(0);
  });

  it('reports only the fields that differ', () => {
    const next = project({
      system_prompt: 'You tell tales.',
      greeting: undefined,
      tags: [{id: 't2', name: 'tales'}],
    });
    expect([...changedCreatorFields(project(), next)]).toEqual([
      'system_prompt',
      'greeting',
      'tags',
    ]);
  });

  it('ignores key order and empty values', () => {
    const next = project({
      model_settings: {temperature: 0.7, top_p: undefined},
      description: 'Tells stories',
      pact: {talents: [{required: true, name: 'calculate'}]},
    });
    expect(changedCreatorFields(project(), next).size).toBe(0);
  });

  it('treats a reordered list as changed', () => {
    const applied = project({tags: [{name: 'a'}, {name: 'b'}]});
    const next = project({tags: [{name: 'b'}, {name: 'a'}]});
    expect([...changedCreatorFields(applied, next)]).toEqual(['tags']);
  });

  it('does not depend on the app completion defaults', () => {
    const applied = project({model_settings: {temperature: 0.7}});
    const next = project({model_settings: {temperature: 0.7}});
    expect(changedCreatorFields(applied, next).has('model_settings')).toBe(
      false,
    );
  });

  it('diffs the raw pal, where transform fillers would add a change', () => {
    const bare = raw({
      model_settings: undefined,
      protection_level: undefined,
      creator: undefined,
    });
    const transformed = palsHubApiService.transformApiPal(
      bare as unknown as ApiPalResponse,
    );
    expect(transformed.protection_level).toBe('public');
    expect(
      changedCreatorFields(
        projectCreatorContent(bare),
        projectCreatorContent(bare),
      ).size,
    ).toBe(0);
    expect(
      [
        ...changedCreatorFields(
          projectCreatorContent(bare),
          projectCreatorContent(
            transformed as unknown as Record<string, unknown>,
          ),
        ),
      ].sort(),
    ).toEqual(['protection_level']);
  });
});
