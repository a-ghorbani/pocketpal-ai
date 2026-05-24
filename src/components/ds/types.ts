import type {
  AccessibilityRole,
  StyleProp,
  ViewStyle,
} from 'react-native';

/**
 * Common props shared by every DS component (WHAT §4c).
 *
 * - `testID` and `accessibilityLabel` are central to the testID +
 *   accessibility freeze contract (WHAT §4i). Defaults live in each
 *   component's JSDoc.
 * - `style` is additive (consumers extend, do not destroy the base).
 */
export type CommonDSProps = {
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

/**
 * Discriminated-union constraint for interactive components that
 * require either a visible `label` or an explicit `accessibilityLabel`
 * (or both) at every call-site (WHAT §4c.5, D34).
 *
 * Usage:
 *
 *   type BaseProps = CommonDSProps & { onPress: () => void; ... };
 *   type ButtonProps = WithRequiredA11yLabel<BaseProps>;
 *
 * The compiler then rejects `<Button onPress={...} />` calls that
 * omit both `label` and `accessibilityLabel`.
 *
 * Either form satisfies the union; passing both is valid (e.g. visible
 * label 'Save' + override accessibilityLabel='Save changes to model').
 */
export type WithRequiredA11yLabel<
  P extends {label?: string; accessibilityLabel?: string},
> =
  | (Omit<P, 'label' | 'accessibilityLabel'> & {
      label: string;
      accessibilityLabel?: string;
    })
  | (Omit<P, 'label' | 'accessibilityLabel'> & {
      label?: string;
      accessibilityLabel: string;
    });

/**
 * Dev-only runtime fallback for the case where types are bypassed
 * (dynamic prop spreads, generic wrappers, `any`-typed consumers).
 * Primary enforcement is the TypeScript discriminated union above
 * (D34); this function is the second line of defence.
 */
export function warnIfNoA11yLabel(
  componentName: string,
  label?: string,
  accessibilityLabel?: string,
): void {
  if (__DEV__ && !label && !accessibilityLabel) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ds/${componentName}] accessibilityLabel or label is required; types may have been bypassed.`,
    );
  }
}
