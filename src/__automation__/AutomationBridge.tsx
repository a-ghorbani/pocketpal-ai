import React from 'react';

import {MemoryAdapter} from './adapters/MemoryAdapter';

/**
 * Single mount point for all E2E automation surfaces.
 *
 * Renders null unless __E2E__ is true at build time. App.tsx also gates
 * at the mount site; both gates together give Metro/Hermes DCE the best
 * chance to strip this file and its imports from the prod bundle.
 *
 * Marker string used by the CI bundle-grep sanity check:
 *   AUTOMATION_BRIDGE
 *
 * If this string is present in a prod APK's index.android.bundle, the
 * DCE contract has been violated — fix the gate, not the grep.
 */
export const AutomationBridge: React.FC = () => {
  if (!__E2E__) {
    return null;
  }
  return (
    <>
      <MemoryAdapter />
    </>
  );
};
