import {downloadModel} from '../downloadModel';
import {modelStore} from '../../store';
import {createModel} from '../../../jest/fixtures/models';

describe('downloadModel', () => {
  it('downloads a Hugging Face model with vision enabled', async () => {
    const hfModel = {id: 'owner/repo'} as any;
    const hfModelFile = {rfilename: 'model.gguf'} as any;
    await downloadModel(createModel({hfModel, hfModelFile}));
    expect(modelStore.downloadHFModel).toHaveBeenCalledWith(
      hfModel,
      hfModelFile,
      {enableVision: true},
    );
  });

  it('downloads other models by id', async () => {
    await downloadModel(createModel({id: 'preset-1'}));
    expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith('preset-1');
  });
});
