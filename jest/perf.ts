import type React from 'react';
import {act} from '@testing-library/react-native';
import {measureRenders} from 'reassure';
import type {MeasureRendersOptions} from 'reassure';

import {createWrapper} from './test-utils';
import type {CustomRenderOptions} from './test-utils';

const MIN_RUNS = 3;
const PERF_TEST_TIMEOUT_MS = 60_000;
const TIMER_WINDOW_MS = 100;

jest.setTimeout(PERF_TEST_TIMEOUT_MS);

type ScenarioOptions = {
  scenario: NonNullable<MeasureRendersOptions['scenario']>;
  beforeEach?: MeasureRendersOptions['beforeEach'];
  runs?: number;
  wrapperOptions?: CustomRenderOptions;
};

export const flushTimers = async () => {
  for (let elapsed = 0; elapsed < TIMER_WINDOW_MS; elapsed++) {
    await act(() => jest.advanceTimersByTime(1));
  }
};

export const measureScenario = async (
  ui: React.ReactElement,
  {scenario, beforeEach, runs = MIN_RUNS, wrapperOptions}: ScenarioOptions,
) => {
  if (runs < MIN_RUNS) {
    throw new Error(
      `measureScenario needs runs >= ${MIN_RUNS} to detect unstable render counts`,
    );
  }
  jest.useFakeTimers({doNotFake: ['performance']});
  const wrapper = createWrapper(wrapperOptions);

  const mountOnly = await measureRenders(ui, {
    wrapper,
    runs,
    beforeEach,
    scenario: () => flushTimers(),
    writeFile: false,
  });
  const measured = await measureRenders(ui, {
    wrapper,
    runs,
    beforeEach,
    scenario,
  });

  expect(measured.meanCount).toBeGreaterThan(mountOnly.meanCount);
  return measured;
};
