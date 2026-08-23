/**
 * Bundled embedding-model presets for the knowledge base.
 *
 * Both presets run as a second, tiny llama.rn context with mean
 * pooling. Default is bge-small-en-v1.5 (33MB q8, 384-dim, ~3ms/chunk
 * on a Pixel-class device, English-focused); Qwen3-Embedding-0.6B is
 * the multilingual quality option (1024-dim, instruction-tuned).
 * URLs verified live against huggingface.co.
 */

export interface EmbeddingPreset {
  id: string;
  label: string;
  description: string;
  repo: string;
  filename: string;
  url: string;
  /** Expected embedding dimensionality (bumped from metadata at runtime). */
  dims: number;
  /** Approximate download size in MB. */
  sizeMB: number;
  /** Max input tokens the encoder reliably handles. */
  maxTokens: number;
}

export const EMBEDDING_PRESETS: EmbeddingPreset[] = [
  {
    id: 'bge-small-en-v1.5',
    label: 'BGE Small (EN) v1.5',
    description:
      'Fast default. 33 MB, 384-dim. Best for English text; near-instant indexing.',
    repo: 'CompendiumLabs/bge-small-en-v1.5-gguf',
    filename: 'bge-small-en-v1.5-q8_0.gguf',
    url: 'https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf',
    dims: 384,
    sizeMB: 33,
    maxTokens: 512,
  },
  {
    id: 'qwen3-embedding-0.6b',
    label: 'Qwen3 Embedding 0.6B',
    description:
      'Multilingual quality option. ~640 MB, 1024-dim, instruction-tuned.',
    repo: 'Qwen/Qwen3-Embedding-0.6B-GGUF',
    filename: 'Qwen3-Embedding-0.6B-Q8_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf',
    dims: 1024,
    sizeMB: 640,
    maxTokens: 2048,
  },
];

export const DEFAULT_EMBEDDING_PRESET_ID = 'bge-small-en-v1.5';

export const getPreset = (id: string): EmbeddingPreset | undefined =>
  EMBEDDING_PRESETS.find(p => p.id === id);
