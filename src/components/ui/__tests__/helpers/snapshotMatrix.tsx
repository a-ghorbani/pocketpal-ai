/**
 * Snapshot-matrix helper for DS family tests.
 *
 *   Rebuild families:
 *     baseline = variant × size × {default,disabled} × {light,dark}
 *     non-Latin font-fallback canary = canaryVariant × size=<default> × default × light × <lang>
 *
 *   Wrap-Paper families (Switch / Checkbox / RadioButton / Dropdown):
 *     baseline = variant × size × {default,disabled} × {light,dark} × value
 *
 * Pressed / focused / hovered are NOT snapshotted: Jest's render()
 * cannot drive Pressable's pressed branch via the style callback, and
 * Input's focused state needs fireEvent.focus(). Emitting those cells
 * produces snapshots byte-identical to default (misleading green
 * coverage). Interactive-state signal is deferred to Phase 3 via a
 * per-component fireEvent-driven harness.
 *
 * The factory MUST consume cell.state and forward `disabled` so the
 * disabled cell renders the disabled tree (not a relabelled default).
 *
 * Each cell renders against a real theme from
 * themeFixtures.byMode(mode).byLocale(lang) wrapped in a PaperProvider,
 * snapshotting the resolved tree via toJSON().
 */
import React from 'react';
import {PaperProvider} from 'react-native-paper';
import {render} from '@testing-library/react-native';

import {themeFixtures} from '../../../../../jest/fixtures/theme';
import type {AvailableLanguage} from '../../../../locales';

export type DSState = 'default' | 'disabled';
export type DSMode = 'light' | 'dark';

export type SnapshotCellProps<V extends string, S extends string> = {
  variant: V;
  size: S;
  state: DSState;
  mode: DSMode;
  language: AvailableLanguage;
  value?: boolean;
};

export type SnapshotMatrixAxes<V extends string, S extends string> = {
  variants: readonly V[];
  sizes: readonly S[];
  /** Baseline static states. Defaults to ['default','disabled']. */
  states?: readonly DSState[];
  /** Defaults to ['light','dark']. */
  modes?: readonly DSMode[];
  /** Non-Latin font-fallback canary languages. Empty = no canary. Typical: ['fa']. */
  langs?: readonly AvailableLanguage[];
  /**
   * Variant used for the font-fallback canary. Falls back to variants[0]
   * when absent. Caller SHOULD set this when variants[0] is non-interactive
   * (e.g. Chip's `display`) so the canary exercises the state-layer
   * path.
   */
  rtlCanaryVariant?: V;
  /** Wrap-Paper value axis ({true,false}). Empty = no value axis. */
  values?: readonly boolean[];
};

export type SnapshotRenderFactory<V extends string, S extends string> = (
  cell: SnapshotCellProps<V, S>,
) => React.ReactElement;

const DEFAULT_STATES: readonly DSState[] = ['default', 'disabled'] as const;
const DEFAULT_MODES: readonly DSMode[] = ['light', 'dark'] as const;
const DEFAULT_LANG: AvailableLanguage = 'en';

const renderCell = <V extends string, S extends string>(
  factory: SnapshotRenderFactory<V, S>,
  cell: SnapshotCellProps<V, S>,
) => {
  const theme = themeFixtures.byMode(cell.mode).byLocale(cell.language);
  return render(<PaperProvider theme={theme}>{factory(cell)}</PaperProvider>);
};

/**
 * Builds a deterministic cell label used as the it() name + as the
 * implicit snapshot key inside the family's .snap file.
 */
const cellLabel = (cell: SnapshotCellProps<string, string>) => {
  const parts = [
    cell.variant,
    cell.size,
    cell.state,
    cell.mode,
    cell.language === DEFAULT_LANG ? null : cell.language,
    cell.value === undefined ? null : cell.value ? 'on' : 'off',
  ].filter(Boolean);
  return parts.join('-');
};

export function runSnapshotMatrix<V extends string, S extends string>(
  name: string,
  factory: SnapshotRenderFactory<V, S>,
  axes: SnapshotMatrixAxes<V, S>,
): void {
  const states = axes.states ?? DEFAULT_STATES;
  const modes = axes.modes ?? DEFAULT_MODES;
  const langs = axes.langs ?? [];
  const values = axes.values ?? [];
  const canaryVariant = axes.rtlCanaryVariant ?? axes.variants[0];
  const defaultSize = axes.sizes[0];

  describe(`${name} — snapshot matrix`, () => {
    describe('baseline (variant x size x {default,disabled} x modes)', () => {
      for (const variant of axes.variants) {
        for (const size of axes.sizes) {
          for (const state of states) {
            for (const mode of modes) {
              if (values.length > 0) {
                for (const value of values) {
                  const cell: SnapshotCellProps<V, S> = {
                    variant,
                    size,
                    state,
                    mode,
                    language: DEFAULT_LANG,
                    value,
                  };
                  it(cellLabel(cell), () => {
                    const {toJSON} = renderCell(factory, cell);
                    expect(toJSON()).toMatchSnapshot();
                  });
                }
              } else {
                const cell: SnapshotCellProps<V, S> = {
                  variant,
                  size,
                  state,
                  mode,
                  language: DEFAULT_LANG,
                };
                it(cellLabel(cell), () => {
                  const {toJSON} = renderCell(factory, cell);
                  expect(toJSON()).toMatchSnapshot();
                });
              }
            }
          }
        }
      }
    });

    if (langs.length > 0 && canaryVariant !== undefined) {
      describe('non-Latin font-fallback canary (canaryVariant x size=default x default x light x lang)', () => {
        for (const language of langs) {
          const cell: SnapshotCellProps<V, S> = {
            variant: canaryVariant,
            size: defaultSize,
            state: 'default',
            mode: 'light',
            language,
          };
          it(cellLabel(cell), () => {
            const {toJSON} = renderCell(factory, cell);
            expect(toJSON()).toMatchSnapshot();
          });
        }
      });
    }
  });
}
