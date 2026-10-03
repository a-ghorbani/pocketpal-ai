import {RenderHtmlEngine} from './RenderHtmlEngine';
import {CalculateEngine} from './CalculateEngine';
import {DatetimeEngine} from './DatetimeEngine';
import {WebSearchEngine} from './WebSearchEngine';
import {ReadUrlEngine} from './ReadUrlEngine';
import {talentRegistry} from './TalentRegistry';
import type {SearchAccess} from './searchAccess';
import type {ToolDefinition, SystemPromptContext} from './types';
import {searchProviderStore} from '../../store/SearchProviderStore';
import {createSearchProvider, readWithDefaultReader} from '../search';

export {TalentRegistry, talentRegistry} from './TalentRegistry';
export {TalentUIRegistry, talentUIRegistry} from './TalentUIRegistry';
export type {TalentUI} from './TalentUIRegistry';
export {RenderHtmlEngine} from './RenderHtmlEngine';
export {CalculateEngine} from './CalculateEngine';
export {DatetimeEngine} from './DatetimeEngine';
export {WebSearchEngine} from './WebSearchEngine';
export {ReadUrlEngine} from './ReadUrlEngine';
export type {SearchAccess} from './searchAccess';
// Deliberately narrow: the raw allowlist writers stay module-internal so all
// writes happen inside services/talents (seed at run start, WebSearchEngine
// per search).
export {seedReadUrlAllowlist, isReadUrlAllowed} from './readUrlAllowlist';
export type {
  TalentEngine,
  TalentResult,
  ToolDefinition,
  SystemPromptContext,
} from './types';

/**
 * The single place that imports the store, so the search engines stay
 * store-free and pure.
 */
function createSearchAccess(): SearchAccess {
  return {
    getActiveProvider: () => {
      const id = searchProviderStore.activeProviderId;
      return createSearchProvider(id, () => searchProviderStore.getKey(id));
    },
    canSearch: () => searchProviderStore.canSearch,
    getResultCount: () => searchProviderStore.resultCount,
    readWithDefaultReader,
  };
}

let registered = false;

/**
 * Register built-in talent engines. UI renderers register separately via
 * `registerDefaultTalentUIs` — keeps the talent UI out of this service module's
 * graph so engine-logic consumers don't load the bottom-sheet tree.
 */
export function registerDefaultTalents(): void {
  if (registered) {
    return;
  }
  talentRegistry.register(new RenderHtmlEngine());
  talentRegistry.register(new CalculateEngine());
  talentRegistry.register(new DatetimeEngine());
  const searchAccess = createSearchAccess();
  talentRegistry.register(new WebSearchEngine(searchAccess));
  talentRegistry.register(new ReadUrlEngine(searchAccess));
  registered = true;
}

/**
 * Derive OpenAI-format tool schemas from registered engines.
 *
 * When `talentNames` is provided, only engines matching those names are
 * included — this ensures a Pal's completionSettings.tools matches its
 * pact.talents (the single source of truth for what the Pal advertises
 * to the model and what the dispatch loop will accept).
 *
 * Calls registerDefaultTalents() internally (idempotent).
 */
export function deriveToolSchemas(talentNames?: string[]): ToolDefinition[] {
  registerDefaultTalents();
  const engines = talentRegistry.getAll();
  if (!talentNames) {
    return engines.map(engine => engine.toToolDefinition());
  }
  const wanted = new Set(talentNames);
  return engines
    .filter(engine => wanted.has(engine.name))
    .map(engine => engine.toToolDefinition());
}

/**
 * Fragments are folded into the single leading system message by
 * `assembleMessages`; a talent never emits its own system message.
 */
export function collectSystemPromptFragments(
  talentNames: string[],
  ctx: Omit<SystemPromptContext, 'activeTalents'>,
): string[] {
  registerDefaultTalents();
  const wanted = new Set(talentNames);
  const engineCtx: SystemPromptContext = {...ctx, activeTalents: wanted};
  return talentRegistry
    .getAll()
    .filter(engine => wanted.has(engine.name))
    .map(engine => engine.systemPromptFragment?.(engineCtx))
    .filter((fragment): fragment is string => !!fragment && !!fragment.trim());
}

/**
 * Test helper: reset the `registered` guard so `registerDefaultTalents()` will
 * re-register engines after a `talentRegistry.reset()` call in test teardown.
 */
export function resetRegisteredFlag(): void {
  registered = false;
}
