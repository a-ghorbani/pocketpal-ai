import type {AccessibilityRole, StyleProp, ViewStyle} from 'react-native';

/**
 * Common props shared by every DS component.
 * `style` is additive — consumers extend, not destroy the base.
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
 * Discriminated-union constraint for interactive components that require
 * either a visible `label` or an explicit `accessibilityLabel` at every
 * call-site. Passing both is valid.
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
 */
export function warnIfNoA11yLabel(
  componentName: string,
  label?: string,
  accessibilityLabel?: string,
): void {
  if (__DEV__ && !label && !accessibilityLabel) {
    console.warn(
      `[ds/${componentName}] accessibilityLabel or label is required; types may have been bypassed.`,
    );
  }
}
