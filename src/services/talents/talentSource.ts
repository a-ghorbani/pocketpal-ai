import {reaction} from 'mobx';

import {talentRegistry} from './TalentRegistry';
import type {TalentEngine, TalentSource} from './types';

/**
 * Bridge a source's engines into the registry and keep them in sync.
 *
 * Each run drops the owned names the source no longer produces, then registers
 * the current ones. A name already registered and not owned by this source is
 * skipped, so a user tool can never shadow a built-in. The returned disposer
 * stops the reaction and gives up every name still owned, so a test reset
 * cannot stack a second reaction or leave a stale owned-name set.
 */
export function attachTalentSource(source: TalentSource): () => void {
  const owned = new Set<string>();

  const sync = (engines: TalentEngine[]): void => {
    const current = new Map(engines.map(engine => [engine.name, engine]));

    for (const name of [...owned]) {
      if (!current.has(name)) {
        talentRegistry.unregister(name);
        owned.delete(name);
      }
    }

    for (const [name, engine] of current) {
      if (!owned.has(name) && talentRegistry.has(name)) {
        if (__DEV__) {
          console.warn(
            `[talents] source "${source.id}" skipped already-registered name: ${name}`,
          );
        }
        continue;
      }
      talentRegistry.register(engine);
      owned.add(name);
    }
  };

  const stop = reaction(() => source.engines(), sync, {fireImmediately: true});

  return () => {
    stop();
    for (const name of owned) {
      talentRegistry.unregister(name);
    }
    owned.clear();
  };
}
