import * as fs from 'fs';
import * as path from 'path';

import {
  StreamingChunker,
  findFirstClauseEnd,
} from '@pocketpalai/react-native-speech/lib/module/engines/StreamingChunker.js';
import {EngineStreamSession} from '@pocketpalai/react-native-speech/lib/module/engines/EngineStreamSession.js';
import {SpeechStreamImpl} from '@pocketpalai/react-native-speech/lib/module/engines/SpeechStream.js';
import {createMarkdownStreamBuffer} from '@pocketpalai/react-native-speech/lib/module/utils/stripMarkdown.js';

const LIB_ROOT = path.dirname(
  require.resolve('@pocketpalai/react-native-speech/package.json'),
);

const take = (chunker: StreamingChunker) =>
  (chunker as any).tryPeek() as
    | {text: string; startIndex: number; endIndex: number}
    | null
    | undefined;

const audio = () => ({samples: new Float32Array(1), sampleRate: 24000});

describe('speech library first-clause option (built module)', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('findFirstClauseEnd', () => {
    it('cuts at a sentence end', () => {
      expect(findFirstClauseEnd('Hi there. More')).toBe(10);
    });

    it('cuts at a clause mark after three words', () => {
      const text = 'Paris is lovely, and big';
      expect(text.slice(0, findFirstClauseEnd(text))).toBe('Paris is lovely, ');
    });

    it('ignores a clause mark before three words', () => {
      expect(findFirstClauseEnd('Well, the answer')).toBe(-1);
    });

    it('cuts after twelve complete words', () => {
      const words = Array.from({length: 13}, (_, i) => `w${i}`).join(' ');
      expect(
        words.slice(0, findFirstClauseEnd(words)).trim().split(' '),
      ).toHaveLength(12);
    });

    it('returns -1 while no cut is available', () => {
      expect(findFirstClauseEnd('Just a few words')).toBe(-1);
    });
  });

  describe('StreamingChunker', () => {
    it('in clause mode cuts the first chunk at a clause, then by sentence', () => {
      const chunker = new StreamingChunker(400, 'clause');
      chunker.append('Paris is lovely, and big, and old. Next one');
      expect(take(chunker)?.text).toBe('Paris is lovely, ');
      expect(take(chunker)?.text).toBe('and big, and old. ');
      expect(take(chunker)).toBeUndefined();
    });

    it('in sentence mode is unchanged', () => {
      const chunker = new StreamingChunker(400);
      chunker.append('Paris is lovely, and big');
      expect(take(chunker)).toBeUndefined();
      chunker.append('. Next');
      expect(take(chunker)?.text).toBe('Paris is lovely, and big. ');
    });
  });

  describe('createMarkdownStreamBuffer', () => {
    it('emits the first clause from the partial tail in clause mode', () => {
      const md = createMarkdownStreamBuffer({firstChunk: 'clause'});
      expect(md.push('The **capital** of France, ')).toBe(
        'The capital of France, ',
      );
      expect(md.push('as you know, is')).toBe('');
    });

    it('holds the clause back in sentence mode', () => {
      const md = createMarkdownStreamBuffer();
      expect(md.push('The capital of France, as')).toBe('');
    });
  });

  it('EngineStreamSession yields a clause-sized first chunk', async () => {
    const synthesized: string[] = [];
    const session = new EngineStreamSession({
      synthesizeChunk: async (text: string) => {
        synthesized.push(text);
        return audio();
      },
      playAudio: async () => {},
      stopPlayback: async () => {},
      maxChunkSize: 400,
      firstChunk: 'clause',
    });
    session.append('Paris is the capital, famous for art. ');
    await session.finalize();
    expect(synthesized[0]).toBe('Paris is the capital, ');
  });

  it.each([
    'engines/kokoro/KokoroEngine.js',
    'engines/supertonic/SupertonicEngine.js',
    'engines/kitten/KittenEngine.js',
  ])('%s forwards firstChunk and always binds chunk progress', file => {
    const source = fs.readFileSync(
      path.join(LIB_ROOT, 'lib/module', file),
      'utf8',
    );
    expect(source).toContain('firstChunk: options?.firstChunk');
    expect(source).toContain(
      'onChunkProgress: event => this.emitChunkProgress(event)',
    );
  });

  it('delivers progress to a listener added after the stream was built', async () => {
    let slot: ((e: any) => void) | null = null;
    const engine = {
      emitChunkProgress: (e: any) => slot?.(e),
    };
    const stream = new SpeechStreamImpl({
      synthesize: async () => {},
      stop: async () => {},
      subscribeProgress: (cb: (e: any) => void) => {
        slot = cb;
        return () => {
          slot = null;
        };
      },
      engineStreamFactory: () =>
        new EngineStreamSession({
          synthesizeChunk: async () => audio(),
          playAudio: async () => {},
          stopPlayback: async () => {},
          maxChunkSize: 400,
          firstChunk: 'clause',
          onChunkProgress: (e: any) => engine.emitChunkProgress(e),
        }),
    });
    const ranges: Array<{start: number; end: number}> = [];
    stream.onProgress((e: any) => ranges.push(e.streamRange));
    stream.append('Paris is the capital, famous for art. ');
    await stream.finalize();
    expect(ranges[0]).toEqual({start: 0, end: 22});
    expect(ranges.length).toBeGreaterThanOrEqual(2);
  });
});
