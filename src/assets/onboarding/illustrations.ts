import type {ImageSourcePropType} from 'react-native';
import type {TopicKey} from '../../store/onboarding/types';

export const onboardingIllustrations: {
  splashMark: ImageSourcePropType;
  screen2: ImageSourcePropType;
  screen3Cards: ImageSourcePropType;
  screen4Shield: ImageSourcePropType;
  pipMascot: ImageSourcePropType;
} = {
  splashMark: require('./splash-mark.png'),
  screen2: require('./screen-2-illustration.png'),
  screen3Cards: require('./screen-3-cards.png'),
  screen4Shield: require('./screen-4-shield.png'),
  pipMascot: require('./pip-mascot.png'),
};

export const topicChipIcons: Partial<Record<TopicKey, ImageSourcePropType>> = {
  smartchat: require('./chip-icons/smart-chat.png'),
  coding: require('./chip-icons/coding.png'),
  education: require('./chip-icons/education.png'),
  roleplay: require('./chip-icons/roleplay.png'),
  creative_writing: require('./chip-icons/creative-writing.png'),
};
