import {TalentEngine} from './types';

/**
 * Name-keyed registry for talent engines.
 *
 * Any Pal that declares a talent in its `pact.talents` can invoke an engine
 * registered under that name. There is NO Pal-id coupling: engines are generic
 * across Pals, and a Pal opts in by naming the talent.
 */
export class TalentRegistry {
  private engines = new Map<string, TalentEngine>();

  register(engine: TalentEngine): void {
    this.engines.set(engine.name, engine);
  }

  get(name: string): TalentEngine | undefined {
    return this.engines.get(name);
  }

  has(name: string): boolean {
    return this.engines.has(name);
  }

  /** Return all registered engines. */
  getAll(): TalentEngine[] {
    return Array.from(this.engines.values());
  }

  /** Test helper: clear all registered engines. */
  reset(): void {
    this.engines.clear();
  }
}

export const talentRegistry = new TalentRegistry();
