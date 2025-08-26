import * as React from 'react';
import {ImageURISource, TextStyle} from 'react-native';

import {MD3Theme} from 'react-native-paper';
import {TemplateConfig} from 'chat-formatter';
import {TokenData} from '@pocketpalai/llama.rn';
import {CompletionParams} from './completionTypes';
import {PreviewData} from '@flyerhq/react-native-link-preview';
import {MD3Colors, MD3Typescale} from 'react-native-paper/lib/typescript/types';
import {SkillKey} from '.';

export namespace MessageType {
  export type Any = Custom | File | Image | Text | Unsupported;

  export type DerivedMessage =
    | DerivedCustom
    | DerivedFile
    | DerivedImage
    | DerivedText
    | DerivedUnsupported;
  export type DerivedAny = DateHeader | DerivedMessage;

  export type PartialAny =
    | PartialCustom
    | PartialFile
    | PartialImage
    | PartialText;

  interface Base {
    author: User;
    createdAt?: number;
    id: string;
    metadata?: Record<string, any>;
    roomId?: string;
    status?: 'delivered' | 'error' | 'seen' | 'sending' | 'sent';
    type: 'custom' | 'file' | 'image' | 'text' | 'unsupported';
    updatedAt?: number;
  }

  export interface DerivedMessageProps extends Base {
    nextMessageInGroup: boolean;
    // TODO: Check name?
    offset: number;
    showName: boolean;
    showStatus: boolean;
  }

  export interface DerivedCustom extends DerivedMessageProps, Custom {
    type: Custom['type'];
  }

  export interface DerivedFile extends DerivedMessageProps, File {
    type: File['type'];
  }

  export interface DerivedImage extends DerivedMessageProps, Image {
    type: Image['type'];
  }

  export interface DerivedText extends DerivedMessageProps, Text {
    type: Text['type'];
  }

  export interface DerivedUnsupported extends DerivedMessageProps, Unsupported {
    type: Unsupported['type'];
  }

  export interface PartialCustom extends Base {
    metadata?: Record<string, any>;
    type: 'custom';
  }

  export interface Custom extends Base, PartialCustom {
    type: 'custom';
  }

  export interface PartialFile {
    metadata?: Record<string, any>;
    mimeType?: string;
    name: string;
    size: number;
    type: 'file';
    uri: string;
  }

  export interface File extends Base, PartialFile {
    type: 'file';
  }

  export interface PartialImage {
    height?: number;
    metadata?: Record<string, any>;
    name: string;
    size: number;
    type: 'image';
    uri: string;
    width?: number;
  }

  export interface Image extends Base, PartialImage {
    type: 'image';
  }

  export interface PartialText {
    metadata?: Record<string, any>;
    previewData?: PreviewData;
    text: string;
    type: 'text';
    imageUris?: string[]; // Optional array of image URIs for multimodal messages
  }

  export interface Text extends Base, PartialText {
    type: 'text';
  }

  export interface Unsupported extends Base {
    type: 'unsupported';
  }

  export interface DateHeader {
    id: string;
    text: string;
    type: 'dateHeader';
  }
}

export interface PreviewImage {
  id: string;
  uri: ImageURISource['uri'];
}

export interface Size {
  height: number;
  width: number;
}

export interface MD3BaseColors extends MD3Colors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;

  // Additional MD3 required colors
  surfaceDisabled: string;
  onSurfaceDisabled: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  inverseSecondary: string;
  shadow: string;
  scrim: string;
}

export interface ThemeIcons {
  attachmentButtonIcon?: () => React.ReactNode;
  deliveredIcon?: () => React.ReactNode;
  documentIcon?: () => React.ReactNode;
  errorIcon?: () => React.ReactNode;
  seenIcon?: () => React.ReactNode;
  sendButtonIcon?: () => React.ReactNode;
  sendingIcon?: () => React.ReactNode;
}

export interface SemanticColors {
  // Surface variants
  surfaceContainerHighest: string;
  surfaceContainerHigh: string;
  surfaceContainer: string;
  surfaceContainerLow: string;
  surfaceContainerLowest: string;
  surfaceDim: string;
  surfaceBright: string;

  text: string;
  textSecondary: string;
  inverseText: string;
  inverseTextSecondary: string;

  border: string;
  placeholder: string;

  // Interactive states
  stateLayerOpacity: number;
  hoverStateOpacity: number;
  pressedStateOpacity: number;
  draggedStateOpacity: number;
  focusStateOpacity: number;

  // Menu specific
  menuBackground: string;
  menuBackgroundDimmed: string;
  menuBackgroundActive: string;
  menuSeparator: string;
  menuGroupSeparator: string;
  menuText: string;
  menuDangerText: string;

  // Message specific
  authorBubbleBackground: string;
  receivedMessageDocumentIcon: string;
  sentMessageDocumentIcon: string;
  userAvatarImageBackground: string;
  userAvatarNameColors: string[];
  searchBarBackground: string;

  // Thinking bubble specific
  thinkingBubbleBackground: string;
  thinkingBubbleText: string;
  thinkingBubbleBorder: string;
  thinkingBubbleShadow: string;
  thinkingBubbleChevronBackground: string;
  thinkingBubbleChevronBorder: string;
}

export interface ThemeBorders {
  inputBorderRadius: number;
  messageBorderRadius: number;
  default: number;
}

export interface ThemeFonts extends MD3Typescale {
  titleMediumLight: TextStyle;
  dateDividerTextStyle: TextStyle;
  emptyChatPlaceholderTextStyle: TextStyle;
  inputTextStyle: TextStyle;
  receivedMessageBodyTextStyle: TextStyle;
  receivedMessageCaptionTextStyle: TextStyle;
  receivedMessageLinkDescriptionTextStyle: TextStyle;
  receivedMessageLinkTitleTextStyle: TextStyle;
  sentMessageBodyTextStyle: TextStyle;
  sentMessageCaptionTextStyle: TextStyle;
  sentMessageLinkDescriptionTextStyle: TextStyle;
  sentMessageLinkTitleTextStyle: TextStyle;
  userAvatarTextStyle: TextStyle;
  userNameTextStyle: TextStyle;
}

export interface ThemeInsets {
  messageInsetsHorizontal: number;
  messageInsetsVertical: number;
}

export interface ThemeSpacing {
  default: number;
}

export interface Theme extends MD3Theme {
  colors: MD3BaseColors & SemanticColors;
  borders: ThemeBorders;
  spacing: ThemeSpacing;
  fonts: ThemeFonts;
  insets: ThemeInsets;
  icons?: ThemeIcons;
}

export interface User {
  createdAt?: number;
  firstName?: string;
  id: string;
  imageUrl?: ImageURISource['uri'];
  lastName?: string;
  lastSeen?: number;
  metadata?: Record<string, any>;
  role?: 'admin' | 'agent' | 'moderator' | 'user';
  updatedAt?: number;
}

export interface ChatTemplateConfig extends TemplateConfig {
  addGenerationPrompt: boolean;
  systemPrompt?: string;
  name: string;
}

export type ChatMessage = {
  role: 'system' | 'assistant' | 'user';
  content:
    | string
    | Array<{
        type: 'text' | 'image_url';
        text?: string;
        image_url?: {url: string};
      }>;
};

export enum ModelOrigin {
  PRESET = 'preset',
  LOCAL = 'local',
  HF = 'hf',
}

export enum ModelType {
  PROJECTION = 'projection',
  VISION = 'vision',
  LLM = 'llm',
}

export interface Model {
  id: string;
  author: string;
  name: string;
  type?: string;
  capabilities?: SkillKey[]; // Array of capability keys
  size: number; // Size in bytes
  params: number;
  isDownloaded: boolean;
  downloadUrl: string;
  hfUrl: string;
  progress: number; // Progress as a percentage
  downloadSpeed?: string;
  filename: string;
  fullPath?: string; // Full path for local models
  /**
   * @deprecated Use 'origin' instead.
   */
  isLocal: boolean; // this need to be deprecated
  origin: ModelOrigin;
  modelType?: ModelType; // Type of model for multimodal support

  // Multimodal support fields
  supportsMultimodal?: boolean; // Whether this model supports multimodal input
  compatibleProjectionModels?: string[]; // Array of mmproj model IDs that work with this model
  defaultProjectionModel?: string; // Default mmproj model ID to use with this model
  visionEnabled?: boolean; // User preference for enabling vision capabilities (defaults to true for backward compatibility)

  // Thinking capabilities
  supportsThinking?: boolean; // Whether this model supports thinking/reasoning mode

  defaultChatTemplate: ChatTemplateConfig;
  chatTemplate: ChatTemplateConfig;
  defaultStopWords: CompletionParams['stop'];
  stopWords: CompletionParams['stop'];
  defaultCompletionSettings: CompletionParams;
  completionSettings: CompletionParams;
  hfModelFile?: ModelFile;
  hfModel?: HuggingFaceModel;
  hash?: string;
}

export type RootDrawerParamList = {
  Chat: undefined;
  Models: undefined;
  Settings: undefined;
};

export type TokenNativeEvent = {
  contextId: number;
  tokenResult: TokenData;
};

export interface ModelFile {
  rfilename: string;
  size?: number;
  url?: string;
  oid?: string;
  lfs?: {
    oid: string;
    size: number;
    pointerSize: number;
  };
  canFitInStorage?: boolean;
}

// Model data from HuggingFace search models
export interface HuggingFaceModel {
  _id: string;
  id: string;
  author: string;
  gated: boolean | string;
  inference: string;
  lastModified: string;
  likes: number;
  trendingScore: number;
  private: boolean;
  sha: string;
  downloads: number;
  tags: string[];
  library_name: string;
  createdAt: string;
  model_id: string;
  siblings: ModelFile[];
  url?: string;
  specs?: GGUFSpecs;
}

export interface HuggingFaceModelsResponse {
  models: HuggingFaceModel[];
  nextLink: string | null; // null if there is no next page
}

export interface ModelFileDetails {
  type: string;
  oid: string;
  size: number;
  lfs?: {
    oid: string;
    size: number;
    pointerSize: number;
  };
  path: string;
}

export interface GGUFSpecs {
  _id: string;
  id: string;
  gguf: {
    total: number;
    architecture: string;
    context_length: number;
    quantize_imatrix_file?: string;
    chat_template?: string;
    bos_token?: string;
    eos_token?: string;
  };
}
export type BenchmarkConfig = {
  pp: number;
  tg: number;
  pl: number;
  nr: number;
  label: string;
};

export interface BenchmarkResult {
  config: BenchmarkConfig;
  modelDesc: string;
  modelSize: number;
  modelNParams: number;
  ppAvg: number;
  ppStd: number;
  tgAvg: number;
  tgStd: number;
  timestamp: string;
  modelId: string;
  modelName: string;
  oid?: string;
  rfilename?: string;
  filename?: string;
  peakMemoryUsage?: {
    total: number;
    used: number;
    percentage: number;
  };
  wallTimeMs?: number;
  uuid: string;
  submitted?: boolean;
  initSettings?: {
    n_ctx: number;
    n_batch: number;
    n_ubatch: number;
    n_threads: number;
    flash_attn: boolean;
    cache_type_k: CacheType;
    cache_type_v: CacheType;
    n_gpu_layers: number;
  };
}

export type DeviceInfo = {
  model: string;
  systemName: string;
  systemVersion: string;
  brand: string;
  cpuArch: string[];
  isEmulator: boolean;
  version: string;
  buildNumber: string;
  device: string;
  deviceId: string;
  totalMemory: number;
  chipset: string;
  cpu: string;
  cpuDetails: {
    cores: number;
    processors: Array<{
      processor: string;
      'model name': string;
      'cpu MHz': string;
      vendor_id: string;
    }>;
    socModel: string;
    features: string[];
    hasFp16: boolean;
    hasDotProd: boolean;
    hasSve: boolean;
    hasI8mm: boolean;
  };
};

export enum CacheType {
  F16 = 'f16',
  F32 = 'f32',
  Q8_0 = 'q8_0',
  Q4_0 = 'q4_0',
  Q4_1 = 'q4_1',
  IQ4_NL = 'iq4_nl',
  Q5_0 = 'q5_0',
  Q5_1 = 'q5_1',
}
