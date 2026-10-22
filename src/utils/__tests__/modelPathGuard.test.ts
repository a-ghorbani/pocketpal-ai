import * as RNFS from '@dr.pogodin/react-native-fs';

import {isModelFilePath, isValidImportedModelRef} from '../modelPathGuard';
import {withEachControl} from '../../../jest/fixtures/controlCharacters';

const DOCS = RNFS.DocumentDirectoryPath;
const MODELS = `${DOCS}/models`;

const BAD_INPUTS: unknown[] = [
  '..',
  '../..',
  '/etc/hosts',
  'file:///data/local/tmp/x',
];

const hfRef = () => ({
  id: 'ggml-org/SmolVLM-500M-Instruct-GGUF/SmolVLM-500M-Instruct-Q8_0.gguf',
  author: 'ggml-org',
  repo: 'SmolVLM-500M-Instruct-GGUF',
  filename: 'SmolVLM-500M-Instruct-Q8_0.gguf',
  origin: 'hf',
  isLocal: false,
  hfModel: {
    id: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
    author: 'ggml-org',
    siblings: [
      {rfilename: 'README.md'},
      {rfilename: 'SmolVLM-500M-Instruct-Q8_0.gguf'},
      {rfilename: 'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf'},
    ],
  },
  hfModelFile: {rfilename: 'SmolVLM-500M-Instruct-Q8_0.gguf'},
});

type Ref = ReturnType<typeof hfRef> & Record<string, any>;

const withField = (set: (ref: Ref) => void): Ref => {
  const ref = hfRef() as Ref;
  set(ref);
  return ref;
};

const setMmprojSibling = (ref: Ref, v: unknown) => {
  ref.hfModel.siblings[2].rfilename = (
    typeof v === 'string' ? `${v}/mmproj-x.gguf` : v
  ) as string;
};

describe('isModelFilePath', () => {
  it.each([
    [`${MODELS}/hf/a/r/Q4/z/..`, false],
    [`${MODELS}/hf/a/r/../..`, false],
    [`${MODELS}/hf/a/r/Q4`, false],
    ['/tmp/x.gguf', false],
    ['/etc/hosts', false],
    ['file:///data/local/tmp/x.gguf', false],
    ['', false],
    [MODELS, false],
    [`${MODELS}/`, false],
    [`${DOCS}/models`, false],
    [`${DOCS}/pal-images`, false],
    [`${DOCS}/..`, false],
    [`${DOCS}/x.bin`, false],
    [`${MODELS}/hf/a//r/x.gguf`, false],
    [`${MODELS}/hf/a/r/x.gguf`, true],
    [`${MODELS}/hf/a/r/Q4/x.gguf`, true],
    [`${MODELS}/hf/a/r/X.GGUF`, true],
    [`${MODELS}/preset/a/r/x.gguf`, true],
    [`${DOCS}/x.gguf`, true],
  ])('non-local %p → %p', (path, expected) => {
    expect(isModelFilePath(path, {local: false})).toBe(expected);
  });

  it.each([
    [`${MODELS}/local/x.bin`, true],
    [`${MODELS}/x`, true],
    [`${MODELS}/local/..`, false],
    [`${MODELS}/local/`, false],
    [`${DOCS}/x.bin`, false],
    [`${DOCS}/x.gguf`, true],
    ['/var/mobile/other/x.gguf', false],
  ])('local %p → %p', (path, expected) => {
    expect(isModelFilePath(path, {local: true})).toBe(expected);
  });

  it('reads the documents root at call time', () => {
    (RNFS as any).__setDocumentDirectoryPath('/other/docs');
    try {
      expect(
        isModelFilePath('/other/docs/models/hf/a/r/x.gguf', {local: false}),
      ).toBe(true);
      expect(isModelFilePath(`${MODELS}/hf/a/r/x.gguf`, {local: false})).toBe(
        false,
      );
    } finally {
      (RNFS as any).__setDocumentDirectoryPath(DOCS);
    }
  });

  it.each([undefined, null, 7, {}, ['x']])('rejects non-string %p', path => {
    expect(isModelFilePath(path, {local: false})).toBe(false);
    expect(isModelFilePath(path, {local: true})).toBe(false);
  });
});

describe('isValidImportedModelRef', () => {
  it('accepts an HF ref with an mmproj sibling', () => {
    expect(isValidImportedModelRef(hfRef())).toBe(true);
  });

  it.each([undefined, null])('accepts an absent ref (%p)', ref => {
    expect(isValidImportedModelRef(ref)).toBe(true);
  });

  it.each(['x', 7, ['a'], true])('rejects a non-object ref %p', ref => {
    expect(isValidImportedModelRef(ref)).toBe(false);
  });

  describe.each<[string, (ref: Ref, v: unknown) => void]>([
    ['filename', (ref, v) => (ref.filename = v as string)],
    ['hfModel.author', (ref, v) => (ref.hfModel.author = v as string)],
    ['hfModel.id', (ref, v) => (ref.hfModel.id = v as string)],
    [
      'hfModelFile.rfilename',
      (ref, v) => (ref.hfModelFile.rfilename = v as string),
    ],
    ['mmproj sibling rfilename', setMmprojSibling],
    ['author (hf origin)', (ref, v) => (ref.author = v as string)],
    ['repo (hf origin)', (ref, v) => (ref.repo = v as string)],
    ['id (hf origin)', (ref, v) => (ref.id = v as string)],
  ])('%s', (_field, set) => {
    it.each(BAD_INPUTS)('rejects %p', bad => {
      expect(isValidImportedModelRef(withField(ref => set(ref, bad)))).toBe(
        false,
      );
    });

    it.each([7, {}, ['x']])('rejects non-string %p', bad => {
      expect(isValidImportedModelRef(withField(ref => set(ref, bad)))).toBe(
        false,
      );
    });
  });

  describe('empty values', () => {
    it.each<[string, (ref: Ref, v: unknown) => void]>([
      ['filename', (ref, v) => (ref.filename = v as string)],
      ['hfModel.author', (ref, v) => (ref.hfModel.author = v as string)],
      ['author', (ref, v) => (ref.author = v as string)],
      ['repo', (ref, v) => (ref.repo = v as string)],
      ['id', (ref, v) => (ref.id = v as string)],
    ])('%s accepts absent, null and empty', (_field, set) => {
      for (const empty of [undefined, null, '']) {
        expect(isValidImportedModelRef(withField(ref => set(ref, empty)))).toBe(
          true,
        );
      }
    });

    it.each<[string, (ref: Ref, v: unknown) => void]>([
      ['hfModel.id', (ref, v) => (ref.hfModel.id = v as string)],
      [
        'hfModelFile.rfilename',
        (ref, v) => (ref.hfModelFile.rfilename = v as string),
      ],
      ['mmproj sibling rfilename', setMmprojSibling],
    ])('%s rejects empty', (_field, set) => {
      expect(isValidImportedModelRef(withField(ref => set(ref, '')))).toBe(
        false,
      );
    });
  });

  it.each([
    ['Q4/x.gguf', true],
    ['x.GGUF', true],
    ['../../x.gguf', false],
    ['Q4/z/..', false],
    ['Q4', false],
    ['x.bin', false],
  ])('hfModelFile.rfilename %p → %p', (rfilename, expected) => {
    expect(
      isValidImportedModelRef(
        withField(ref => (ref.hfModelFile.rfilename = rfilename)),
      ),
    ).toBe(expected);
  });

  it.each([
    ['a/r', true],
    ['a/..', false],
    ['a', false],
    ['a/r/x', false],
    ['/r', false],
  ])('hfModel.id %p → %p', (id, expected) => {
    expect(
      isValidImportedModelRef(withField(ref => (ref.hfModel.id = id))),
    ).toBe(expected);
  });

  it.each([
    ['a//b.gguf', false],
    ['Q4/x.gguf', true],
  ])('filename %p → %p', (filename, expected) => {
    expect(
      isValidImportedModelRef(withField(ref => (ref.filename = filename))),
    ).toBe(expected);
  });

  it('checks only mmproj siblings by path', () => {
    const ref = withField(r =>
      r.hfModel.siblings.push({rfilename: 'docs/../README.md'}),
    );
    expect(isValidImportedModelRef(ref)).toBe(true);
  });

  it.each<[string, unknown, boolean]>([
    ['absent siblings', undefined, true],
    ['null siblings', null, true],
    ['non-array siblings', 'mmproj-x.gguf', false],
    ['a null sibling', [null], false],
    ['a non-string rfilename', [{rfilename: ['../mmproj-x.gguf']}], false],
    ['a numeric rfilename', [{rfilename: 7}], false],
  ])('%s → %p, never throws', (_case, siblings, expected) => {
    const ref = withField(r => (r.hfModel.siblings = siblings as any));
    expect(() => isValidImportedModelRef(ref)).not.toThrow();
    expect(isValidImportedModelRef(ref)).toBe(expected);
  });

  it('never throws on an object whose string conversion throws', () => {
    const ref = withField(
      r => (r.hfModel.siblings = [{rfilename: {toString: 'x'}}] as any),
    );
    expect(() => isValidImportedModelRef(ref)).not.toThrow();
    expect(isValidImportedModelRef(ref)).toBe(false);
  });

  it.each([
    ['a non-object hfModel', (ref: Ref) => (ref.hfModel = 'x' as any)],
    ['a non-object hfModelFile', (ref: Ref) => (ref.hfModelFile = 7 as any)],
  ])('rejects %s', (_case, set) => {
    expect(isValidImportedModelRef(withField(set))).toBe(false);
  });

  it.each([
    ['absent hfModel', (ref: Ref) => delete (ref as any).hfModel],
    ['null hfModelFile', (ref: Ref) => (ref.hfModelFile = null as any)],
  ])('accepts %s', (_case, set) => {
    expect(isValidImportedModelRef(withField(set))).toBe(true);
  });

  it.each(['preset', 'hf'])(
    'checks author, repo and id for %s origin',
    origin => {
      const base = {origin, filename: 'x.gguf', author: 'a', repo: 'r'};
      expect(isValidImportedModelRef({...base, id: 'a/r/x.gguf'})).toBe(true);
      expect(isValidImportedModelRef({...base, author: '..'})).toBe(false);
      expect(isValidImportedModelRef({...base, repo: 'r/..'})).toBe(false);
      expect(isValidImportedModelRef({...base, id: 'a/../x.gguf'})).toBe(false);
    },
  );

  describe('remote and local refs', () => {
    const remoteRef = {
      origin: 'remote',
      id: 'srv//models/x.gguf',
      author: 'Home/Mac',
      filename: '',
    };

    it('keeps a remote ref whose id and server name are not path segments', () => {
      expect(isValidImportedModelRef(remoteRef)).toBe(true);
    });

    it('rejects the same remote ref with a traversal hfModelFile', () => {
      expect(
        isValidImportedModelRef({
          ...remoteRef,
          hfModelFile: {rfilename: '../../x.gguf'},
        }),
      ).toBe(false);
    });

    it('does not check fullPath or isLocal', () => {
      expect(
        isValidImportedModelRef({
          origin: 'local',
          id: '/abs/path/x.gguf',
          author: 'user',
          filename: 'x.gguf',
          fullPath: '/anywhere/../x.gguf',
          isLocal: true,
        }),
      ).toBe(true);
    });

    it('accepts a PalsHub-style ref with a null author', () => {
      expect(
        isValidImportedModelRef({
          origin: 'hf',
          id: 'a/r/x.gguf',
          author: null,
          repo: 'r',
          filename: 'x.gguf',
        }),
      ).toBe(true);
    });
  });
});

describe('control characters', () => {
  type Setter = (ref: Ref, v: string) => void;
  const REF_FIELDS: [string, Setter, (c: string) => string[]][] = [
    [
      'filename',
      (ref, v) => (ref.filename = v),
      c => [`x${c}.gguf`, `Q4/a${c}b.gguf`, `x.gguf${c}`],
    ],
    [
      'hfModelFile.rfilename',
      (ref, v) => (ref.hfModelFile.rfilename = v),
      c => [`x${c}.gguf`, `Q4/a${c}b.gguf`],
    ],
    [
      'hfModel.id',
      (ref, v) => (ref.hfModel.id = v),
      c => [`a/b${c}c`, `${c}a/b`, `a/b${c}`],
    ],
    [
      'hfModel.author',
      (ref, v) => (ref.hfModel.author = v),
      c => [`a${c}b`, `${c}ab`, `ab${c}`],
    ],
    [
      'mmproj sibling rfilename',
      setMmprojSibling,
      c => [`a${c}b`, `${c}ab`, `ab${c}`],
    ],
    [
      'author (hf origin)',
      (ref, v) => (ref.author = v),
      c => [`a${c}b`, `${c}ab`, `ab${c}`],
    ],
    [
      'repo (hf origin)',
      (ref, v) => (ref.repo = v),
      c => [`a${c}b`, `${c}ab`, `ab${c}`],
    ],
    [
      'id (hf origin)',
      (ref, v) => (ref.id = v),
      c => [`a/r/x${c}.gguf`, `${c}a/r/x.gguf`],
    ],
  ];

  describe.each(REF_FIELDS)('imported ref %s', (_field, set, carriers) => {
    it.each(withEachControl(carriers))('rejects %s', (_shown, value) => {
      expect(isValidImportedModelRef(withField(ref => set(ref, value)))).toBe(
        false,
      );
    });
  });

  it.each(
    withEachControl(c => [
      `${MODELS}/hf/${c}/m.gguf`,
      `${MODELS}/hf/a/r/x${c}.gguf`,
      `${MODELS}/hf/a${c}b/r/x.gguf`,
      `${DOCS}/x${c}.gguf`,
    ]),
  )('isModelFilePath rejects %s', (_shown, path) => {
    expect(isModelFilePath(path, {local: false})).toBe(false);
  });

  it.each(
    withEachControl(c => [`${MODELS}/local/a${c}b`, `${MODELS}/local/ab${c}`]),
  )('isModelFilePath (local) rejects %s', (_shown, path) => {
    expect(isModelFilePath(path, {local: true})).toBe(false);
  });

  describe('positions another rule already rejects', () => {
    it.each(withEachControl(c => [`x.gguf${c}`]))(
      'hfModelFile.rfilename rejects %s',
      (_shown, value) => {
        expect(
          isValidImportedModelRef(
            withField(ref => (ref.hfModelFile.rfilename = value)),
          ),
        ).toBe(false);
      },
    );

    it.each(
      withEachControl(c => [
        `${c}${MODELS}/hf/a/r/x.gguf`,
        `${MODELS}/hf/a/r/x.gguf${c}`,
      ]),
    )('isModelFilePath rejects %s', (_shown, path) => {
      expect(isModelFilePath(path, {local: false})).toBe(false);
    });
  });
});
