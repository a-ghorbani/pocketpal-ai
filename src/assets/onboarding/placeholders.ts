/**
 * Text-only stand-ins for the seven onboarding illustration slots.
 *
 * Each entry is the label a screen renders while the real asset is
 * pending. When an asset lands at the matching path under this
 * directory, replace the consumer's usage with the real Image / SVG
 * component.
 */

export const onboardingIllustrationPlaceholders = {
  splashMark: '[illustration: splash mark]',
  screen1Hero: '[illustration: screen 1 — splash mark]',
  screen2: '[illustration: screen 2 — phone with pals]',
  screen3PhoneCard: '[illustration: screen 3 — phone card]',
  screen3CloudCard: '[illustration: screen 3 — cloud card]',
  screen4Shield: '[illustration: screen 4 — phone with shield]',
  screen5ChipSmartchat: '[icon: speech bubble]',
  screen5ChipCoding: '[icon: code brackets]',
  screen5ChipEducation: '[icon: books]',
  screen5ChipRoleplay: '[icon: theater masks]',
  screen5ChipCreativeWriting: '[icon: feather]',
  pipMascot: '[illustration: Pip mascot]',
} as const;
