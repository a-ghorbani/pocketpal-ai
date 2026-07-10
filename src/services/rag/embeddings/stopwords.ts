/**
 * Stopword lists for lexical embedding.
 *
 * These are function/very-common words that carry little semantic weight.
 * Removing them sharpens retrieval and shrinks the active vocabulary.
 *
 * The English list covers the most frequent closed-class words. The CJK list
 * covers common function words / particles; they are matched both as single
 * characters and as the bigrams that the tokenizer produces.
 */

export const EN_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the',
  'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will',
  'with', 'we', 'you', 'your', 'i', 'he', 'she', 'his', 'her', 'its', 'our',
  'from', 'about', 'can', 'do', 'does', 'did', 'has', 'have', 'had', 'what',
  'when', 'where', 'which', 'who', 'whom', 'how', 'why', 'all', 'any', 'both',
  'each', 'more', 'most', 'other', 'some', 'than', 'too', 'very', 'just',
  'should', 'now', 'so', 'up', 'out', 'if', 'then', 'once',
]);

export const CJK_STOPWORDS: ReadonlySet<string> = new Set([
  // single-character particles
  '的', '了', '和', '是', '在', '我', '你', '他', '她', '它', '们', '这',
  '那', '有', '个', '不', '也', '都', '就', '要', '会', '能', '说', '着',
  '没', '看', '去', '又', '很', '把', '被', '让', '给', '与', '及', '或',
  '但', '而', '等', '里', '中', '上', '下', '从', '向', '对', '为', '以',
  // common two-character function words / bigrams
  '我们', '你们', '他们', '自己', '这个', '那个', '这些', '那些', '可以',
  '已经', '因为', '所以', '如果', '但是', '然后', '什么', '怎么', '为什么',
  '通过', '对于', '以及', '并且', '或者', '一个', '一种', '一些', '没有',
  '不是', '就是', '这样', '那样', '的话', '进行', '成为', '由于', '根据',
]);

export const ALL_STOPWORDS: ReadonlySet<string> = new Set([
  ...EN_STOPWORDS,
  ...CJK_STOPWORDS,
]);
