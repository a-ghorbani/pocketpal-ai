# Render-performance tests

Render-performance tests run a scripted interaction against a component in Jest and record how many times React commits and how long those commits take. They use [Reassure](https://github.com/callstack/reassure). The render count is deterministic, so CI fails a pull request that raises it. Durations are reported for information only.

## What is measured

- **Render count**: the number of React commits under the measured tree in one run, mount included. It counts commits, not component renders: one state change that re-renders twenty components is one commit.
- **Duration**: the summed render time of those commits, in JS only.
- Jest runs with the usual mocks (`@gorhom/bottom-sheet`, Reanimated, native modules), so native work, animations and gestures are not measured.

## Commands

```bash
yarn test:perf                 # run every *.perf-test.tsx, write .reassure/current.perf
yarn test:perf --baseline      # same, written as .reassure/baseline.perf
yarn test:perf:compare [base]  # measure base, then HEAD, then apply the render-count gate
```

- `yarn test` never runs perf tests.
- `yarn test:perf:compare` needs a clean working tree. It checks out `base` (default: the merge-base with `origin/main`), measures it, checks your branch out again and measures it. When `yarn.lock` or `patches/` differ from the base, it wipes and reinstalls `node_modules` for the base and again for your branch.
- On pull requests, the CI `perf` job runs the same command against the base branch. Its result is in the job summary, and the `render-perf` artifact holds `.reassure/`.

## Reading the result

| Result | Job |
| --- | --- |
| A scenario's render count went up | fails |
| A scenario's render count differs between its runs | fails |
| Two scenarios share a name (when the base has no perf tests) | fails |
| The base was measured but no comparison was produced | fails |
| A perf test failed on the base or on your branch | fails, see the job log |
| Render count went down, or stayed the same | passes |
| Duration changed with an equal render count | passes (informational) |
| Scenario added, removed or renamed | passes (not compared) |
| The base has no perf tests yet | passes, lists your counts |

Durations come from shared CI machines and move between runs, so even identical code can show a "significant" duration change. Only the render count gates.

**An intended increase.** The job goes red. Say in the pull request why the count rises; once the reviewer accepts it and it merges, the new count is the base for later pull requests.

## Adding a scenario

Put the file next to the component's unit tests: `<Component>/__tests__/<Component>.perf-test.tsx`. Use `measureScenario` from `jest/perf.ts`:

```tsx
import {fireEvent} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';

it('expands the advanced settings', async () => {
  await measureScenario(<SettingsScreen />, {
    wrapperOptions: {
      withSafeArea: true,
      withNavigation: true,
      withBottomSheetProvider: true,
    },
    scenario: async screen => {
      await flushTimers();
      expect(screen.queryByTestId('batch-size-slider')).toBeNull();

      fireEvent.press(screen.getByTestId('advanced-settings-accordion'));
      await flushTimers();

      expect(screen.getByTestId('batch-size-slider')).toBeTruthy();
    },
  });
});
```

- **Drive the app's own path.** Change the state the app changes (an owner component's state, a store observable, or an event) without remounting.
- **One `act` per driven write.** Use `await act(() => runInAction(...))` for each store write; `fireEvent` already wraps one. Several writes inside one `act` batch into a single commit.
- **Advance timers explicitly.** `measureScenario` runs on fake timers (with the real `performance` clock, so durations stay real). Call `await flushTimers()` after the mount and after each step, so a timer-driven commit, such as Paper's deferred `TextInput` placeholder or a list's batched cell update, always lands at the same point.
- **Every run starts from the same state.** Each scenario runs several times, re-mounting the same element. Reset anything it changes outside the tree in `beforeEach`, in place: `messages.replace(fresh)`, or setting `filters` back to `[]` on the same observable. A new object assigned in `beforeEach` never reaches the re-mounted element.
- **Assert the start and the end** of the interaction in every run, for example "collapsed" before and "expanded content present" after.
- `measureScenario` uses at least 3 runs, so an unstable count shows up, and it fails a scenario that adds no commits over the mount alone.
- The test's full name is the scenario's identity. Renaming a test reports the old name as removed and the new one as added, and neither is compared.

## Limits

- Passing a new object to a memoised child on every render adds no commit, only work inside the existing one. The render count does not change; at most the duration does.
- Under the `@gorhom/bottom-sheet` mock, `present` and `close` do nothing and sheet content always renders. The sheet scenarios therefore count only the owner's visibility handling, not content mount, animation or gestures.

## Current scenarios

| File | Interaction |
| --- | --- |
| `src/components/Sheet/__tests__/Sheet.perf-test.tsx` | open and close a `Sheet` from its owner's state |
| `src/components/ChatPalModelPickerSheet/__tests__/ChatPalModelPickerSheet.perf-test.tsx` | open and close the pal/model picker as the chat view does |
| `src/components/ChatView/__tests__/ChatView.typing.perf-test.tsx` | type ten characters into the chat input |
| `src/components/ChatView/__tests__/ChatView.streaming.perf-test.tsx` | stream twenty tokens into the newest assistant turn |
| `src/screens/ModelsScreen/__tests__/ModelsScreen.perf-test.tsx` | filter the model list to downloaded models |
| `src/screens/SettingsScreen/__tests__/SettingsScreen.perf-test.tsx` | expand the advanced settings |
