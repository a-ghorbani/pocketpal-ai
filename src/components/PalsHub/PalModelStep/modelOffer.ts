import {modelStore} from '../../../store';
import {hasEnoughMemory} from '../../../hooks/useMemoryCheck';
import {getModelMemoryRequirement} from '../../../utils/memoryEstimator';
import type {Pal} from '../../../types/pal';
import type {Model} from '../../../utils/types';

export type ModelOffer =
  | {kind: 'ready'; model: Model}
  | {kind: 'download'; model: Model}
  | {kind: 'none'; neededBytes?: number};

const requirement = (model: Model) => getModelMemoryRequirement(model);

const byRequirement = (a: Model, b: Model) => requirement(a) - requirement(b);

const offerFor = (model: Model): ModelOffer =>
  modelStore.isModelAvailable(model.id)
    ? {kind: 'ready', model}
    : {kind: 'download', model};

export const resolveModelOffer = async (localPal: Pal): Promise<ModelOffer> => {
  const recommended = localPal.defaultModel
    ? (modelStore.models.find(m => m.id === localPal.defaultModel?.id) ??
      localPal.defaultModel)
    : undefined;

  if (recommended && modelStore.isModelAvailable(recommended.id)) {
    return {kind: 'ready', model: recommended};
  }
  if (recommended && (await hasEnoughMemory(recommended))) {
    return offerFor(recommended);
  }

  const candidates = modelStore.models.filter(
    m => m.isRulePreset || modelStore.isModelAvailable(m.id),
  );
  const fitting: Model[] = [];
  for (const candidate of candidates) {
    if (await hasEnoughMemory(candidate)) {
      fitting.push(candidate);
    }
  }
  if (fitting.length > 0) {
    return offerFor([...fitting].sort(byRequirement).at(-1)!);
  }

  const [smallest] = candidates.filter(m => m.isRulePreset).sort(byRequirement);
  return {
    kind: 'none',
    neededBytes: smallest ? requirement(smallest) : undefined,
  };
};
