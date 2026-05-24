/**
 * Tests for the Theme builder.
 *
 * Visual diff is the human-eye acceptance gate. Jest cannot prove
 * pixel-equality, but it CAN prove that the legacy Paper-compat surface —
 * the things ~18 MD3-typescale consumers + 4 `theme.spacing.default`
 * consumers + every legacy `theme.borders.*` / `theme.insets.*` reader
 * depend on — is preserved verbatim from origin/main.
 *
 * If any one of these unit-level guarantees breaks, a visual regression
 * is guaranteed and the foundation-slice claim is false.
 *
 * Coverage:
 *   - Legacy `theme.spacing.default === 16` (= spacing.m).
 *   - `theme.borders.{inputBorderRadius, messageBorderRadius, default}`
 *     match today's hard-coded values (16 / 15 / 12).
 *   - `theme.insets.{messageInsetsHorizontal, messageInsetsVertical}`
 *     match today's hard-coded values (20 / 10).
 *   - MD3 typescale keys are present on `theme.fonts.*` and resolve to
 *     Inter family strings (= `configureFonts({config:
 *     fontStyles.regular})` output, unchanged).
 *   - Custom legacy TextStyles are present on `theme.fonts.*`
 *     (`titleMediumLight`, `dateDividerTextStyle`, `inputTextStyle`, all
 *     `receivedMessage*` / `sentMessage*`, `userAvatarTextStyle`,
 *     `userNameTextStyle`).
 *   - New surface: `theme.typography.*`, `theme.radius.*`,
 *     `theme.stroke.*` are present and shaped as TokenTypography /
 *     TokenRadius / TokenStroke.
 *   - No `x1Theme`, no `AppTheme.X1` export from theme module.
 */
import {buildTheme, darkTheme, fontStyles, lightTheme} from '../theme';
import {radius, spacing, stroke, typography} from '../../theme/tokens';

describe('Theme builder — legacy surface preservation', () => {
  describe('spacing', () => {
    it('lightTheme.spacing.default === 16 (= tokens.spacing.m)', () => {
      expect(lightTheme.spacing.default).toBe(16);
      expect(lightTheme.spacing.default).toBe(spacing.m);
    });

    it('darkTheme.spacing.default === 16 (same value across modes)', () => {
      expect(darkTheme.spacing.default).toBe(16);
    });

    it('spacing exposes both legacy `default` and new token keys', () => {
      // Superset shape: token keys + `default`.
      expect(lightTheme.spacing.none).toBe(0);
      expect(lightTheme.spacing.xxs).toBe(2);
      expect(lightTheme.spacing.xs).toBe(4);
      expect(lightTheme.spacing.s).toBe(8);
      expect(lightTheme.spacing.sm).toBe(12);
      expect(lightTheme.spacing.m).toBe(16);
      expect(lightTheme.spacing.ml).toBe(20);
      expect(lightTheme.spacing.l).toBe(24);
      expect(lightTheme.spacing.default).toBe(16);
    });
  });

  describe('borders', () => {
    it("matches today's pinned values (16 / 15 / 12)", () => {
      expect(lightTheme.borders).toEqual({
        inputBorderRadius: 16,
        messageBorderRadius: 15,
        default: 12,
      });
    });

    it('preserved across modes (light === dark for borders)', () => {
      expect(darkTheme.borders).toEqual(lightTheme.borders);
    });
  });

  describe('insets', () => {
    it("matches today's pinned values (20 / 10)", () => {
      expect(lightTheme.insets).toEqual({
        messageInsetsHorizontal: 20,
        messageInsetsVertical: 10,
      });
    });

    it('preserved across modes (light === dark for insets)', () => {
      expect(darkTheme.insets).toEqual(lightTheme.insets);
    });
  });

  describe('legacy fonts (MD3 typescale + custom TextStyles)', () => {
    // Pinning ~18 known MD3 keys to their `configureFonts` output is the
    // contract for the 18+ existing consumers (`grep -rh
    // "theme\\.fonts\\.(bodyMedium|titleSmall|bodyLarge|displaySmall|
    // headlineLarge|headlineMedium|labelLarge)"`). A missing key would
    // crash the consumer; a changed family would shift glyphs.
    const md3Keys = [
      'displayLarge',
      'displayMedium',
      'displaySmall',
      'headlineLarge',
      'headlineMedium',
      'headlineSmall',
      'titleLarge',
      'titleMedium',
      'titleSmall',
      'labelLarge',
      'labelMedium',
      'labelSmall',
      'bodyLarge',
      'bodyMedium',
      'bodySmall',
    ] as const;

    it.each(md3Keys)('theme.fonts.%s is present', key => {
      expect(lightTheme.fonts[key]).toBeDefined();
      expect(typeof lightTheme.fonts[key].fontSize).toBe('number');
    });

    // All MD3 fonts use Inter (today's `fontStyles.regular`). The two
    // overrides keyed in theme.ts (`displayMedium` → bold,
    // `titleSmall` → medium) still resolve to a `Inter-*` family.
    it('bodyMedium fontFamily is Inter-Regular (pinned to today)', () => {
      expect(lightTheme.fonts.bodyMedium.fontFamily).toBe('Inter-Regular');
    });

    it("displayMedium fontFamily is Inter-Bold (today's override)", () => {
      expect(lightTheme.fonts.displayMedium.fontFamily).toBe('Inter-Bold');
    });

    it("titleSmall fontFamily is Inter-Medium (today's override)", () => {
      expect(lightTheme.fonts.titleSmall.fontFamily).toBe('Inter-Medium');
    });

    const customStyles = [
      'titleMediumLight',
      'dateDividerTextStyle',
      'emptyChatPlaceholderTextStyle',
      'inputTextStyle',
      'receivedMessageBodyTextStyle',
      'receivedMessageCaptionTextStyle',
      'receivedMessageLinkDescriptionTextStyle',
      'receivedMessageLinkTitleTextStyle',
      'sentMessageBodyTextStyle',
      'sentMessageCaptionTextStyle',
      'sentMessageLinkDescriptionTextStyle',
      'sentMessageLinkTitleTextStyle',
      'userAvatarTextStyle',
      'userNameTextStyle',
    ] as const;

    it.each(customStyles)('custom legacy TextStyle %s is present', key => {
      expect((lightTheme.fonts as any)[key]).toBeDefined();
    });
  });

  describe('legacy `fontStyles` Inter weight map (preserved for ChatInput)', () => {
    // `src/components/ChatInput/styles.ts:4,145,152,157,162` imports
    // this export. Removing or renaming any weight breaks that consumer.
    it('exports the full Inter weight map', () => {
      expect(fontStyles.regular).toEqual({fontFamily: 'Inter-Regular'});
      expect(fontStyles.medium).toEqual({fontFamily: 'Inter-Medium'});
      expect(fontStyles.bold).toEqual({fontFamily: 'Inter-Bold'});
      expect(fontStyles.thin).toEqual({fontFamily: 'Inter-Thin'});
      expect(fontStyles.light).toEqual({fontFamily: 'Inter-Light'});
      expect(fontStyles.semibold).toEqual({fontFamily: 'Inter-SemiBold'});
      expect(fontStyles.extraBold).toEqual({fontFamily: 'Inter-ExtraBold'});
    });
  });
});

describe('Theme builder — new token surface', () => {
  it('exposes theme.typography (resolved per locale)', () => {
    // en-locale snapshot — Latin → Fraunces upright family.
    expect(lightTheme.typography.headlineH1).toEqual(typography.headlineH1);
    expect(lightTheme.typography.bodyM).toEqual(typography.bodyM);
    expect(lightTheme.typography.codeM).toEqual(typography.codeM);
  });

  it('exposes theme.radius matching the tokens module', () => {
    expect(lightTheme.radius).toEqual(radius);
    expect(darkTheme.radius).toEqual(radius);
  });

  it('exposes theme.stroke matching the tokens module', () => {
    expect(lightTheme.stroke).toEqual(stroke);
    expect(darkTheme.stroke).toEqual(stroke);
  });
});

describe('Theme builder — locale-aware typography', () => {
  // buildTheme is a pure function. Direct invocation does not depend on
  // MobX / store mocks — this is the unit-level contract.
  it('en locale leaves headlineH1 in Fraunces-Regular', () => {
    const theme = buildTheme({mode: 'light', language: 'en'});
    expect(theme.typography.headlineH1.fontFamily).toBe('Fraunces-Regular');
  });

  it('ja locale swaps headlineH1 to Inter-Regular', () => {
    const theme = buildTheme({mode: 'light', language: 'ja'});
    expect(theme.typography.headlineH1.fontFamily).toBe('Inter-Regular');
  });

  it('codeM remains JetBrainsMono for non-Latin locales', () => {
    const theme = buildTheme({mode: 'light', language: 'fa'});
    expect(theme.typography.codeM.fontFamily).toBe('JetBrainsMono-Regular');
  });
});

describe('Theme builder — Paper-internal fields preserved', () => {
  it('lightTheme has Paper-required `isV3` true', () => {
    expect(lightTheme.isV3).toBe(true);
  });

  it('lightTheme has `dark: false`', () => {
    expect(lightTheme.dark).toBe(false);
  });

  it('darkTheme has `dark: true`', () => {
    expect(darkTheme.dark).toBe(true);
  });

  it('roundness is present (Paper-internal)', () => {
    expect(typeof lightTheme.roundness).toBe('number');
    expect(typeof darkTheme.roundness).toBe('number');
  });
});

describe('Theme module — x1 is gone', () => {
  it('theme module exports do not include x1Theme or AppTheme', () => {
    // Hard fence: any reintroduction surfaces in the public API.
    // The grep-based unit in invariants.test.ts is the broader gate; this
    // narrow check catches the most common regression (re-exporting from
    // theme.ts itself).

    const mod = require('../theme');
    expect(mod.x1Theme).toBeUndefined();
    expect(mod.AppTheme).toBeUndefined();
  });
});
