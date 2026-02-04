import {Platform} from 'react-native';

import {Model, ModelOrigin} from '../utils/types';
import {chatTemplates} from '../utils/chat';
import {defaultCompletionParams} from '../utils/completionSettingsVersions';

export const MODEL_LIST_VERSION = 1;

const crossPlatformModels: Model[] = [
  {
    id: 'Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF/HY-MT1.5-1.8B-Q8_0.gguf',
    author: 'Tencent-Hunyuan',
    name: 'Hunyuan MT1.5 1.8B (Q8_0)',
    type: 'Translation',
    capabilities: ['multilingual'],
    size: 0,
    params: 1800000000,
    isDownloaded: false,
    downloadUrl:
      'https://www.modelscope.cn/models/Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF/resolve/master/HY-MT1.5-1.8B-Q8_0.gguf',
    hfUrl: 'https://www.modelscope.cn/models/Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF',
    progress: 0,
    filename: 'HY-MT1.5-1.8B-Q8_0.gguf',
    isLocal: false,
    origin: ModelOrigin.PRESET,
    defaultChatTemplate: {...chatTemplates.translation},
    chatTemplate: chatTemplates.translation,
    defaultCompletionSettings: {
      ...defaultCompletionParams,
      n_predict: 512,
      temperature: 0.2,
    },
    completionSettings: {
      ...defaultCompletionParams,
      n_predict: 512,
      temperature: 0.2,
    },
    defaultStopWords: defaultCompletionParams.stop,
    stopWords: defaultCompletionParams.stop,
    hfModelFile: {
      rfilename: 'HY-MT1.5-1.8B-Q8_0.gguf',
      url: 'https://www.modelscope.cn/models/Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF/resolve/master/HY-MT1.5-1.8B-Q8_0.gguf',
      size: 0,
      canFitInStorage: true,
    },
  },
];

export const defaultModels =
  Platform.OS === 'android' ? crossPlatformModels : crossPlatformModels;
