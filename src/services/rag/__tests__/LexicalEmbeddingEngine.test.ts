/**
 * LexicalEmbeddingEngine unit tests.
 *
 * These are pure (no React Native / AsyncStorage), so they run fast and also
 * validate the retrieval behaviour that RAGManager.search depends on.
 */

import {LexicalEmbeddingEngine} from '../embeddings/LexicalEmbeddingEngine';
import {NoopEmbeddingEngine} from '../embeddings/NoopEmbeddingEngine';

const cosine = (a: number[], b: number[]): number => {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
};

describe('LexicalEmbeddingEngine', () => {
  it('produces a fixed-dimension vector', async () => {
    const eng = new LexicalEmbeddingEngine(384);
    const v = await eng.embed('hello world');
    expect(v).toHaveLength(384);
    expect(eng.dimension).toBe(384);
    expect(eng.kind).toBe('lexical');
  });

  it('returns a zero vector for empty / stopword-only text', async () => {
    const eng = new LexicalEmbeddingEngine(384);
    expect(await eng.embed('')).toEqual(new Array(384).fill(0));
    expect(await eng.embed('a the of and')).toEqual(new Array(384).fill(0));
  });

  it('is deterministic for the same input', async () => {
    const eng = new LexicalEmbeddingEngine(384);
    const a = await eng.embed('Python programming language');
    const b = await eng.embed('Python programming language');
    expect(a).toEqual(b);
  });

  it('produces an L2-normalized vector', async () => {
    const eng = new LexicalEmbeddingEngine(384);
    const v = await eng.embed('apple banana cherry date');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it('ranks a semantically closer chunk higher than an unrelated one', async () => {
    const eng = new LexicalEmbeddingEngine(384);
    const q = await eng.embed('Python programming');
    const related = await eng.embed(
      'Python is a versatile programming language used for web development',
    );
    const unrelated = await eng.embed(
      'completely unrelated content about cats and dogs',
    );
    expect(cosine(q, related)).toBeGreaterThan(cosine(q, unrelated));
    expect(cosine(q, related)).toBeGreaterThan(0.3);
    expect(cosine(q, unrelated)).toBe(0);
  });

  it('tokenizes CJK into bigrams so Chinese text is retrievable', async () => {
    const eng = new LexicalEmbeddingEngine(384);
    const tokens = eng.tokenize('苹果手机');
    // "苹果手机" -> bigrams 苹果, 果手, 手机
    expect(tokens).toContain('苹果');
    expect(tokens).toContain('手机');
    expect(tokens).toContain('果手');

    const q = await eng.embed('苹果手机');
    const hit = await eng.embed('我想买一台苹果手机');
    const miss = await eng.embed('今天天气真好');
    expect(cosine(q, hit)).toBeGreaterThan(cosine(q, miss));
  });

  it('removes CJK and English stopwords', () => {
    const eng = new LexicalEmbeddingEngine(384);
    const tokens = eng.tokenize('我们是学生 and the cat');
    expect(tokens).not.toContain('我们');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('and');
    expect(tokens).toContain('学生');
    expect(tokens).toContain('cat');
  });

  it('does not collapse when the corpus is a single document', async () => {
    // Regression guard: a single-doc corpus must still yield a non-zero,
    // comparable vector (unlike corpus-IDF which would zero everything).
    const eng = new LexicalEmbeddingEngine(384);
    const v = await eng.embed('python programming content here');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });
});

describe('NoopEmbeddingEngine', () => {
  it('returns null so callers fall back to keyword search', async () => {
    const eng = new NoopEmbeddingEngine();
    expect(await eng.embed('anything')).toBeNull();
    expect(eng.kind).toBe('none');
  });
});
