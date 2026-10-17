import {modelStore} from '../store';
import type {Model} from './types';

export const downloadModel = async (model: Model): Promise<void> => {
  if (model.hfModel && model.hfModelFile) {
    await modelStore.downloadHFModel(model.hfModel, model.hfModelFile, {
      enableVision: true,
    });
  } else {
    await modelStore.checkSpaceAndDownload(model.id);
  }
};
