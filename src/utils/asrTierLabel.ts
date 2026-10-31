import type {Translations} from '../locales/types';
import type {AsrTier} from '../services/asr/types';

type VoiceInputKey = keyof Translations['voiceInput'];

const TIER_COPY: Record<AsrTier, {name: VoiceInputKey; hint: VoiceInputKey}> = {
  base: {name: 'tierNameBase', hint: 'tierHintBase'},
  small: {name: 'tierNameSmall', hint: 'tierHintSmall'},
  'large-turbo': {name: 'tierNameLargeTurbo', hint: 'tierHintLargeTurbo'},
};

export const asrTierLabel = (tier: AsrTier, l10n: Translations): string =>
  l10n.voiceInput[TIER_COPY[tier].name];

export const asrTierHint = (tier: AsrTier, l10n: Translations): string =>
  l10n.voiceInput[TIER_COPY[tier].hint];
