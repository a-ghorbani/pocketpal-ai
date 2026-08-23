import {
  binaryToVectors,
  cosineSimilarity,
  dotProduct,
  l2Normalize,
  vectorsToBinary,
} from '../rag/vectorStore';
import {bm25Scores, retrieveChunks, rrfFuse} from '../rag/retrieval';
import {chunkText} from '../rag/chunking';

const makeVec = (...vals: number[]) => l2Normalize(vals);

describe('vectorStore', () => {
  it('l2-normalizes to unit length', () => {
    const v = l2Normalize([3, 4]);
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    expect(len).toBeCloseTo(1, 6);
  });

  it('handles the zero vector', () => {
    const v = l2Normalize([0, 0, 0]);
    expect(dotProduct(v, v)).toBe(0);
  });

  it('cosine of parallel vectors is 1, orthogonal is 0', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 5])).toBeCloseTo(0, 6);
  });

  it('round-trips vectors through the binary format', () => {
    const vecs = [makeVec(0.1, -0.2, 0.3, 0.4), makeVec(1, 2, 3, 4)];
    const binary = vectorsToBinary(vecs);
    // Each float32 = 4 bytes.
    expect(binary.length).toBe(vecs.length * vecs[0].length * 4);
    const back = binaryToVectors(binary, 4);
    expect(back).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) {
        expect(back[i][j]).toBeCloseTo(vecs[i][j], 5);
      }
    }
  });
});

describe('chunking', () => {
  it('returns empty for empty input', () => {
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('keeps short text as a single chunk', () => {
    const out = chunkText('one paragraph');
    expect(out).toHaveLength(1);
    expect(out[0].index).toBe(0);
  });

  it('splits on paragraph boundaries near the target size', () => {
    const para = 'word '.repeat(200).trim(); // ~1000 chars
    const text = [para, para, para, para].join('\n\n'); // ~4000 chars
    const out = chunkText(text, {targetChars: 1400, minChars: 200});
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(5);
    // Consecutive indices.
    out.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('splits pathological long single paragraphs', () => {
    const text = 'a'.repeat(10_000); // no spaces, no newlines
    const out = chunkText(text, {targetChars: 1400, overlapChars: 0});
    expect(out.length).toBeGreaterThanOrEqual(7);
    const total = out.map(c => c.text).join('');
    expect(total.length).toBeGreaterThanOrEqual(10_000);
  });

  it('merges a trailing undersized chunk', () => {
    const big = 'word '.repeat(280).trim(); // ~1400
    const text = `${big}\n\n${big}\n\ntiny tail`;
    const out = chunkText(text, {targetChars: 1400, minChars: 200});
    expect(out[out.length - 1].text).toContain('tiny tail');
  });
});

describe('retrieval', () => {
  it('BM25 zeroes out with no query terms', () => {
    expect(bm25Scores('  ', ['a', 'b'])).toEqual([0, 0]);
  });

  it('BM25 ranks the exact-match doc first', () => {
    const docs = [
      'completely unrelated content',
      'the ORA-00942 error means table or view does not exist',
      'some other discussion',
    ];
    const scores = bm25Scores('ORA-00942 table missing', docs);
    expect(scores[1]).toBeGreaterThan(scores[0]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  it('RRF favors items ranked well in both lists', () => {
    // Item 0 is 1st in list A and 2nd in list B; item 1 is 1st in B but
    // only 3rd in A. Consistent high ranks should win.
    const fused = rrfFuse([
      [0, 2, 1],
      [1, 0, 2],
    ]);
    expect(fused.get(0)!).toBeGreaterThan(fused.get(1)!);
    expect(fused.get(0)!).toBeGreaterThan(fused.get(2)!);
  });

  it('retrieves dense matches when no keyword overlap exists', () => {
    const texts = [
      'the chef prepared a wonderful pasta dish',
      'quantum entanglement links particle states',
    ];
    const items = [{id: 'a'}, {id: 'b'}];
    const out = retrieveChunks({
      query: 'cooking meal dinner', // no token overlap with texts
      texts,
      items,
      queryVector: makeVec(1, 0, 0, 0),
      vectors: [makeVec(1, 0, 0, 0), makeVec(0, 1, 0, 0)],
      topK: 1,
    });
    expect(out).toHaveLength(1);
    expect(out[0].item.id).toBe('a');
    expect(out[0].cosine).toBeCloseTo(1, 5);
  });

  it('fuses sparse hits into the ranking', () => {
    // Vector pass has no useful signal; keyword pass must still return
    // the exact-match chunk.
    const texts = ['error code X17 occurred', 'nothing relevant here'];
    const items = ['chunk0', 'chunk1'];
    const out = retrieveChunks({
      query: 'X17',
      texts,
      items,
      queryVector: null,
      topK: 1,
    });
    expect(out).toHaveLength(1);
    expect(out[0].item).toBe('chunk0');
  });

  it('respects the cosine floor', () => {
    const texts = ['a', 'b'];
    const vectors = [makeVec(1, 0), makeVec(0, 1)];
    const out = retrieveChunks({
      query: 'whatever',
      texts,
      items: [0, 1],
      queryVector: makeVec(1, 0),
      vectors,
      minCosine: 0.99,
      topK: 5,
    });
    expect(out.map(o => o.item)).toEqual([0]);
  });

  it('returns nothing when both passes are empty', () => {
    const out = retrieveChunks({
      query: 'zzz',
      texts: ['a', 'b'],
      items: [0, 1],
      queryVector: null,
      topK: 5,
    });
    expect(out).toEqual([]);
  });
});
