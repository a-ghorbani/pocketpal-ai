/**
 * Verbatim `GET /v1/models` bodies, captured from a live llama.cpp router
 * (47 models, trimmed to the five rows below) and from two of its children
 * reached directly. The two forms differ in shape, and `deriveListCaps` reads
 * both, so hand-written stand-ins would test the parser against a shape no
 * server emits.
 *
 * Only host-identifying values inside `status.args` and `status.preset` are
 * replaced - absolute paths keep their last two segments; the bind-address
 * flag and its value become placeholders. Every key, every array element and
 * every ordering
 * is as it arrived: `--ctx-size` and its value are adjacent by position, so a
 * redaction that dropped or merged an element would quietly change what the
 * parser sees.
 *
 * The rows were chosen to carry one distinct shape each:
 *   gemma-4-e2b                            loaded, image, meta.n_ctx, --mmproj
 *   ggml-org/gemma-4-31B-it-GGUF:Q8_0      unloaded, image, no meta
 *   gemma-3-4b                             loaded, text-only, meta.n_ctx
 *   bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M  unloaded, text-only, --hf-repo
 *   bonsai-27b-q1                          unloaded, text-only, --model
 *
 * Of the five router rows declaring `image`, one carries `--mmproj`; that is
 * why vision is read from `architecture`, not from the launch arguments.
 */
export const routerModelsBody = {
  data: [
    {
      id: 'gemma-4-e2b',
      aliases: [],
      tags: [],
      object: 'model',
      owned_by: 'llamacpp',
      created: 1784820254,
      status: {
        value: 'loaded',
        args: [
          '/redacted/bin/llama-server',
          '--redacted-flag',
          'redacted-host',
          '--jinja',
          '--port',
          '50693',
          '--alias',
          'gemma-4-e2b',
          '--ctx-size',
          '8192',
          '--flash-attn',
          'auto',
          '--model',
          '/redacted/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_K_M.gguf',
          '--mmproj',
          '/redacted/gemma-4-E2B-it-GGUF/mmproj-gemma-4-E2B-it-BF16.gguf',
          '--n-gpu-layers',
          '999',
        ],
        preset:
          '[gemma-4-e2b]\njinja = true\nctx-size = 8192\nflash-attn = auto\nmodel = /redacted/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_K_M.gguf\nmmproj = /redacted/gemma-4-E2B-it-GGUF/mmproj-gemma-4-E2B-it-BF16.gguf\nn-gpu-layers = 999\n\n',
      },
      architecture: {
        input_modalities: ['text', 'image', 'audio'],
        output_modalities: ['text'],
      },
      source: 'preset',
      can_remove: false,
      meta: {
        vocab_type: 2,
        n_vocab: 262144,
        n_ctx: 8192,
        n_ctx_train: 131072,
        n_embd: 1536,
        n_params: 4647450147,
        size: 3412060300,
        ftype: 'Q4_K - Medium',
      },
    },
    {
      id: 'ggml-org/gemma-4-31B-it-GGUF:Q8_0',
      aliases: [],
      tags: [],
      object: 'model',
      owned_by: 'llamacpp',
      created: 1784820254,
      status: {
        value: 'unloaded',
        args: [
          '/redacted/bin/llama-server',
          '--redacted-flag',
          'redacted-host',
          '--jinja',
          '--port',
          '0',
          '--alias',
          'ggml-org/gemma-4-31B-it-GGUF:Q8_0',
          '--ctx-size',
          '8192',
          '--flash-attn',
          'auto',
          '--hf-repo',
          'ggml-org/gemma-4-31B-it-GGUF:Q8_0',
          '--n-gpu-layers',
          '999',
        ],
        preset:
          '[ggml-org/gemma-4-31B-it-GGUF:Q8_0]\njinja = true\nctx-size = 8192\nflash-attn = auto\nhf-repo = ggml-org/gemma-4-31B-it-GGUF:Q8_0\nn-gpu-layers = 999\n\n',
      },
      architecture: {
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
      },
      source: 'cache',
      can_remove: true,
    },
    {
      id: 'gemma-3-4b',
      aliases: [],
      tags: [],
      object: 'model',
      owned_by: 'llamacpp',
      created: 1784820254,
      status: {
        value: 'loaded',
        args: [
          '/redacted/bin/llama-server',
          '--redacted-flag',
          'redacted-host',
          '--jinja',
          '--port',
          '36129',
          '--alias',
          'gemma-3-4b',
          '--ctx-size',
          '8192',
          '--flash-attn',
          'auto',
          '--model',
          '/redacted/gemma-3-4b-it-GGUF/gemma-3-4b-it-Q4_K_M.gguf',
          '--n-gpu-layers',
          '999',
        ],
        preset:
          '[gemma-3-4b]\njinja = true\nctx-size = 8192\nflash-attn = auto\nmodel = /redacted/gemma-3-4b-it-GGUF/gemma-3-4b-it-Q4_K_M.gguf\nn-gpu-layers = 999\n\n',
      },
      architecture: {
        input_modalities: ['text'],
        output_modalities: ['text'],
      },
      source: 'preset',
      can_remove: false,
      meta: {
        vocab_type: 1,
        n_vocab: 262144,
        n_ctx: 8192,
        n_ctx_train: 131072,
        n_embd: 2560,
        n_params: 3880099328,
        size: 2483218432,
        ftype: 'Q4_K - Medium',
      },
    },
    {
      id: 'bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M',
      aliases: [],
      tags: [],
      object: 'model',
      owned_by: 'llamacpp',
      created: 1784820254,
      status: {
        value: 'unloaded',
        args: [
          '/redacted/bin/llama-server',
          '--redacted-flag',
          'redacted-host',
          '--jinja',
          '--port',
          '40611',
          '--alias',
          'bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M',
          '--ctx-size',
          '8192',
          '--flash-attn',
          'auto',
          '--hf-repo',
          'bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M',
          '--n-gpu-layers',
          '999',
        ],
        preset:
          '[bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M]\njinja = true\nctx-size = 8192\nflash-attn = auto\nhf-repo = bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M\nn-gpu-layers = 999\n\n',
      },
      architecture: {
        input_modalities: ['text'],
        output_modalities: ['text'],
      },
      source: 'cache',
      can_remove: true,
    },
    {
      id: 'bonsai-27b-q1',
      aliases: [],
      tags: [],
      object: 'model',
      owned_by: 'llamacpp',
      created: 1784820254,
      status: {
        value: 'unloaded',
        args: [
          '/redacted/bin/llama-server',
          '--redacted-flag',
          'redacted-host',
          '--jinja',
          '--port',
          '46313',
          '--alias',
          'bonsai-27b-q1',
          '--ctx-size',
          '8192',
          '--flash-attn',
          'auto',
          '--model',
          '/redacted/Bonsai-27B-gguf/Bonsai-27B-Q1_0.gguf',
          '--n-gpu-layers',
          '999',
        ],
        preset:
          '[bonsai-27b-q1]\njinja = true\nctx-size = 8192\nflash-attn = auto\nmodel = /redacted/Bonsai-27B-gguf/Bonsai-27B-Q1_0.gguf\nn-gpu-layers = 999\n\n',
      },
      architecture: {
        input_modalities: ['text'],
        output_modalities: ['text'],
      },
      source: 'preset',
      can_remove: false,
    },
  ],
  object: 'list',
};

/** A single-model child of that router, reached directly. Multimodal. */
export const directVisionModelsBody = {
  models: [
    {
      name: 'gemma-4-e2b',
      model: 'gemma-4-e2b',
      modified_at: '',
      size: '',
      digest: '',
      type: 'model',
      description: '',
      tags: [''],
      capabilities: ['completion', 'multimodal'],
      parameters: '',
      details: {
        parent_model: '',
        format: 'gguf',
        family: '',
        families: [''],
        parameter_size: '',
        quantization_level: '',
      },
    },
  ],
  object: 'list',
  data: [
    {
      id: 'gemma-4-e2b',
      aliases: ['gemma-4-e2b'],
      tags: [],
      object: 'model',
      created: 1784820235,
      owned_by: 'llamacpp',
      meta: {
        vocab_type: 2,
        n_vocab: 262144,
        n_ctx: 8192,
        n_ctx_train: 131072,
        n_embd: 1536,
        n_params: 4647450147,
        size: 3412060300,
        ftype: 'Q4_K - Medium',
      },
    },
  ],
};

/** The same, for a text-only child: `capabilities` without `multimodal`. */
export const directTextModelsBody = {
  models: [
    {
      name: 'gemma-3-4b',
      model: 'gemma-3-4b',
      modified_at: '',
      size: '',
      digest: '',
      type: 'model',
      description: '',
      tags: [''],
      capabilities: ['completion'],
      parameters: '',
      details: {
        parent_model: '',
        format: 'gguf',
        family: '',
        families: [''],
        parameter_size: '',
        quantization_level: '',
      },
    },
  ],
  object: 'list',
  data: [
    {
      id: 'gemma-3-4b',
      aliases: ['gemma-3-4b'],
      tags: [],
      object: 'model',
      created: 1784820255,
      owned_by: 'llamacpp',
      meta: {
        vocab_type: 1,
        n_vocab: 262144,
        n_ctx: 8192,
        n_ctx_train: 131072,
        n_embd: 2560,
        n_params: 3880099328,
        size: 2483218432,
        ftype: 'Q4_K - Medium',
      },
    },
  ],
};
