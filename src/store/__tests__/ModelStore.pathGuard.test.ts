jest.unmock('../../store');
import {runInAction, toJS} from 'mobx';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {downloadManager} from '../../services/downloads';
import {Model, ModelOrigin, ModelType} from '../../utils/types';
import {createModel} from '../../../jest/fixtures/models';
import {modelStore} from '..';
import {LOOKIE_DEFAULT_MODEL} from '../builtinPalModels';

jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));

const DOCS = RNFS.DocumentDirectoryPath;
const hfPath = (author: string, repo: string, filename: string) =>
  `${DOCS}/models/hf/${author}/${repo}/${filename}`;

let files: Set<string>;
let folders: Set<string>;

beforeEach(() => {
  jest.clearAllMocks();
  files = new Set();
  folders = new Set();
  (RNFS.exists as jest.Mock).mockImplementation(
    async (path: string) => files.has(path) || folders.has(path),
  );
  (RNFS.stat as jest.Mock).mockImplementation(async (path: string) => ({
    isFile: () => files.has(path),
  }));
  (RNFS.unlink as jest.Mock).mockImplementation(async (path: string) => {
    files.delete(path);
  });
  runInAction(() => {
    modelStore.models = [];
    modelStore.activeModelId = undefined;
  });
});

const storeModel = (id: string) => modelStore.models.find(m => m.id === id)!;

const setModel = (model: Partial<Model>) =>
  runInAction(() => {
    modelStore.models = [createModel(model) as Model];
  });

const hfModel = (overrides: Partial<Model> = {}): Partial<Model> => ({
  id: 'm',
  author: 'a',
  repo: 'r',
  filename: 'x.gguf',
  origin: ModelOrigin.HF,
  ...overrides,
});

const localModel = (fullPath: string): Partial<Model> => ({
  id: 'm',
  filename: 'x.gguf',
  fullPath,
  isLocal: true,
  origin: ModelOrigin.LOCAL,
  isDownloaded: true,
});

const markDownloadedAndDelete = async (id: string) => {
  runInAction(() => {
    storeModel(id).isDownloaded = true;
  });
  await modelStore.deleteModel(storeModel(id));
};

const expectDownloadsAndDeletes = async (id: string, path: string) => {
  await modelStore.checkSpaceAndDownload(id);
  const call = (downloadManager.startDownload as jest.Mock).mock.calls.find(
    ([m]) => m.id === id,
  );
  expect(call?.[1]).toBe(path);
  files.add(path);
  await markDownloadedAndDelete(id);
  expect(RNFS.unlink).toHaveBeenCalledWith(path);
  expect(storeModel(id).isDownloaded).toBe(false);
};

const expectRefusedAndKept = async () => {
  files.add(await modelStore.getModelFullPath(storeModel('m')));
  await expect(modelStore.checkSpaceAndDownload('m')).rejects.toThrow();
  expect(downloadManager.startDownload).not.toHaveBeenCalled();
  await markDownloadedAndDelete('m');
  expect(RNFS.unlink).not.toHaveBeenCalled();
  expect(storeModel('m').isDownloaded).toBe(true);
};

describe.each(['author', 'repo', 'filename'])('HF %s', field => {
  it.each([
    '..',
    '../..',
    '/etc/hosts',
    'file:///data/local/tmp/x',
    'a\u0000b',
  ])('%j: no download and no unlink', async bad => {
    setModel(hfModel({[field]: bad}));
    await expectRefusedAndKept();
  });
});

it('a valid HF model downloads to and deletes models/hf/a/r/x.gguf', async () => {
  setModel(hfModel());
  await expectDownloadsAndDeletes('m', hfPath('a', 'r', 'x.gguf'));
});

it('the built-in Lookie model and its mmproj download and delete', async () => {
  await modelStore.addHFModel(
    LOOKIE_DEFAULT_MODEL.hfModel!,
    LOOKIE_DEFAULT_MODEL.hfModelFile!,
  );
  const added = toJS(modelStore.models);
  expect(added.some(m => m.modelType === ModelType.PROJECTION)).toBe(true);
  for (const m of added) {
    await expectDownloadsAndDeletes(
      m.id,
      hfPath(m.author, m.repo!, m.filename),
    );
  }
});

it('a legacy preset at Documents/x.gguf downloads and deletes', async () => {
  files.add(`${DOCS}/x.gguf`);
  setModel(hfModel({origin: ModelOrigin.PRESET}));
  await expectDownloadsAndDeletes('m', `${DOCS}/x.gguf`);
});

it('a preset named models is neither downloaded to nor deleted', async () => {
  files.add(`${DOCS}/models`);
  setModel(hfModel({origin: ModelOrigin.PRESET, filename: 'models'}));
  expect(await modelStore.getModelFullPath(storeModel('m'))).toBe(
    `${DOCS}/models`,
  );
  await expectRefusedAndKept();
});

it.each([
  ['/tmp/x.gguf', false],
  [`${DOCS}/models/local/x.gguf`, true],
])(
  'LOCAL %s leaves the list, unlinked only under models/',
  async (path, unlinked) => {
    files.add(path);
    setModel(localModel(path));

    await modelStore.deleteModel(storeModel('m'));

    expect(modelStore.models).toHaveLength(0);
    expect((RNFS.unlink as jest.Mock).mock.calls).toEqual(
      unlinked ? [[path]] : [],
    );
  },
);

it.each([
  ['HF', hfModel({isDownloaded: true})],
  ['LOCAL', localModel(hfPath('a', 'r', 'x.gguf'))],
])(
  'a %s model whose path is a folder is not unlinked',
  async (_kind, model) => {
    folders.add(hfPath('a', 'r', 'x.gguf'));
    setModel(model);

    await modelStore.deleteModel(storeModel('m'));

    expect(RNFS.unlink).not.toHaveBeenCalled();
  },
);
