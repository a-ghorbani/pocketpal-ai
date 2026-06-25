import {RenderHtmlEngine} from './RenderHtmlEngine';
import {RenderHtmlTalentUI} from './RenderHtmlTalentUI';
import {CalculateEngine} from './CalculateEngine';
import {DatetimeEngine} from './DatetimeEngine';
import {WebSearchEngine} from './WebSearchEngine';
import {ReadUrlEngine} from './ReadUrlEngine';
import {talentRegistry} from './TalentRegistry';
import {talentUIRegistry} from './TalentUIRegistry';
import type {SearchAccess} from './searchAccess';
import type {ToolDefinition} from './types';
import {searchProviderStore} from '../../store';
import {createSearchProvider, readWithDefaultReader} from '../search';

export {TalentRegistry, talentRegistry} from './TalentRegistry';
export {TalentUIRegistry, talentUIRegistry} from './TalentUIRegistry';
export type {TalentUI} from './TalentUIRegistry';
export {RenderHtmlEngine} from './RenderHtmlEngine';
export {RenderHtmlTalentUI} from './RenderHtmlTalentUI';
export {CalculateEngine} from './CalculateEngine';
export {DatetimeEngine} from './DatetimeEngine';
export {WebSearchEngine} from './WebSearchEngine';
export {ReadUrlEngine} from './ReadUrlEngine';
export type {SearchAccess} from './searchAccess';
export type {TalentEngine, TalentResult, ToolDefinition} from './types';

/**
 * Build the read-only accessor the search engines use to reach the active
 * provider + result count. This is the single place that imports the store, so
 * the engines stay store-free and pure.
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
 * Register the built-in talent engines and UI renderers. Idempotent — safe to
 * call from any app-init path.
 */
export function registerDefaultTalents(): void {
  if (registered) {
    return;
  }
  // Engines
  talentRegistry.register(new RenderHtmlEngine());
  talentRegistry.register(new CalculateEngine());
  talentRegistry.register(new DatetimeEngine());
  const searchAccess = createSearchAccess();
  talentRegistry.register(new WebSearchEngine(searchAccess));
  talentRegistry.register(new ReadUrlEngine(searchAccess));
  // UIs
  talentUIRegistry.register(new RenderHtmlTalentUI());
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
 * Test helper: reset the `registered` guard so `registerDefaultTalents()` will
 * re-register engines after a `talentRegistry.reset()` call in test teardown.
 */
export function resetRegisteredFlag(): void {
  registered = false;
}
