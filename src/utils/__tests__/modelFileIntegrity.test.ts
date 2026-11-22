import * as RNFS from '@dr.pogodin/react-native-fs';

import {createModel} from '../../../jest/fixtures/models';

import {checkModelFileIntegrity} from '..';
import {modelStore} from '../../store';
import {ModelOrigin} from '../types';

describe('checkModelFileIntegrity', () => {
  const hfModel = (size: number) =>
    createModel({
      id: 'owner/repo/model.gguf',
      origin: ModelOrigin.HF,
      hfModelFile: {rfilename: 'model.gguf', lfs: {size}},
    });

  const onDisk = (size: number) =>
    (RNFS.stat as jest.Mock).mockResolvedValueOnce({
      size,
      isFile: () => true,
    });

  it('accepts a file within 0.1% of the Hugging Face size', async () => {
    onDisk(3041378400);

    const result = await checkModelFileIntegrity(hfModel(3041376384));

    expect(result).toEqual({isValid: true, errorMessage: null});
    expect(modelStore.updateModelHash).not.toHaveBeenCalled();
  });

  it('flags a file more than 0.1% off the Hugging Face size', async () => {
    onDisk(4465);

    const result = await checkModelFileIntegrity(hfModel(1270808032));

    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe(
      'Model file size mismatch (4.46 kB vs 1.27 GB). Please delete and redownload.',
    );
  });

  it('flags a file just past the 0.1% tolerance', async () => {
    onDisk(1_001_001);

    const result = await checkModelFileIntegrity(hfModel(1_000_000));

    expect(result.isValid).toBe(false);
  });
});
