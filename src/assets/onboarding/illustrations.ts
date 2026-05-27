/**
 * Onboarding illustration assets.
 *
 * Asset pipeline: Figma vector exports re-exported as SVGs and
 * consumed via `react-native-svg-transformer`. Each import is a React
 * component (default export) that accepts `width` / `height` / `fill`
 * / `stroke` props.
 *
 *  - `SplashMark`    — splash mark inner artwork (Figma `884:28352`).
 *  - `Screen1Hero`   — same flat SVG artwork as the splash mark,
 *                      sized to 112×112 on the welcome screen
 *                      (Figma `884:29310`).
 *  - `ShieldGlyph`   — privacy-shield vector used inside screen 4's
 *                      phone-outline composite (Figma `885:29695`).
 *  - `chipIcons`     — per-topic vector glyphs for screen 5 chips,
 *                      exported verbatim from Figma's iconify slots
 *                      (`fluent:chat-28-filled`, `typcn:code`,
 *                      `wpf:books`, `solar:mask-happly-bold`,
 *                      `fa6-solid:feather`).
 *  - `ArrowRightGlyph` / `HeadphonesGlyph` — flat SVGs used by the
 *                      Figma button instances; matched 1:1 to avoid
 *                      hand-drawing.
 */
import SplashMark from './splash-mark.svg';
import ShieldGlyph from './shield.svg';
import ArrowRightGlyph from './arrow-right.svg';
import HeadphonesGlyph from './headphones.svg';
import ChevronLeftGlyph from './chevron-left.svg';

import SmartChatChip from './chip-icons/smart-chat.svg';
import CodingChip from './chip-icons/coding.svg';
import EducationChip from './chip-icons/education.svg';
import RoleplayChip from './chip-icons/roleplay.svg';
import CreativeWritingChip from './chip-icons/creative-writing.svg';

import type {TopicKey} from '../../store/onboarding/types';

export {
  SplashMark,
  ShieldGlyph,
  ArrowRightGlyph,
  HeadphonesGlyph,
  ChevronLeftGlyph,
};

// Screen 1 hero is the same flat SVG as the splash mark — verified
// against Figma node equality (`884:28352` interior matches
// `884:29310` Visual).
export const Screen1Hero = SplashMark;

type SvgComponent = React.ComponentType<{
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
}>;

// Per-topic chip glyphs (screen 5). Indexed by TopicKey. `else` is
// rendered as an outlined-only chip and intentionally has no glyph.
export const topicChipGlyphs: Partial<Record<TopicKey, SvgComponent>> = {
  smartchat: SmartChatChip,
  coding: CodingChip,
  education: EducationChip,
  roleplay: RoleplayChip,
  creative_writing: CreativeWritingChip,
};
