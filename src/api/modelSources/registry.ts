import {
  HF_DOMAIN,
  HF_MIRROR_DOMAIN,
  MODELSCOPE_API_BASE,
  MODELSCOPE_DOMAIN,
} from '../../config';
import {ModelSourceId} from '../../utils/types';
import {ModelSourceConfig} from './types';

export const MODEL_SOURCE_CONFIGS: Record<ModelSourceId, ModelSourceConfig> = {
  huggingface: {
    id: 'huggingface',
    domain: HF_DOMAIN,
    apiBase: `${HF_DOMAIN}/api`,
    supportsAuth: true,
    supportsPagination: true,
    supportsHFAPI: true,
  },
  hf_mirror: {
    id: 'hf_mirror',
    domain: HF_MIRROR_DOMAIN,
    apiBase: `${HF_MIRROR_DOMAIN}/api`,
    supportsAuth: true,
    supportsPagination: true,
    supportsHFAPI: true,
  },
  modelscope: {
    id: 'modelscope',
    domain: MODELSCOPE_DOMAIN,
    apiBase: MODELSCOPE_API_BASE,
    supportsAuth: true,
    supportsPagination: false,
    supportsHFAPI: false,
  },
};

export function getModelSourceConfig(source: ModelSourceId): ModelSourceConfig {
  return MODEL_SOURCE_CONFIGS[source];
}

export function isHFCompatibleSource(source: ModelSourceId): boolean {
  return MODEL_SOURCE_CONFIGS[source].supportsHFAPI;
}
