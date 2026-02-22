# OCI Registry Support

PocketPal AI now supports pulling GGUF model files from Docker Hub and other OCI (Open Container Initiative) registries. This feature allows you to easily access models stored as OCI artifacts.

## Available OCI Models

The following models are available from `docker.io/ai/*`:

### Language Models
- **llama3.1** - Meta's Llama 3.1 model
- **llama3.2** - Meta's Llama 3.2 model
- **llama3.3** - Meta's Llama 3.3 model
- **gemma3** - Google's Gemma 3 model
- **gemma3n** - Google's Gemma 3N model
- **gemma3-qat** - Google's Gemma 3 QAT (Quantization-Aware Training) model
- **phi4** - Microsoft's Phi 4 model
- **qwen2.5** - Alibaba's Qwen 2.5 model
- **qwen3** - Alibaba's Qwen 3 model
- **qwen3-coder** - Qwen 3 optimized for code generation
- **qwq** - Qwen QwQ reasoning model
- **mistral** - Mistral AI's base model
- **mistral-nemo** - Mistral Nemo model
- **magistral-small-3.2** - Magistral Small 3.2 model
- **smollm2** - HuggingFace's SmolLM 2
- **smollm3** - HuggingFace's SmolLM 3

### Specialized Models
- **deepcoder-preview** - Code generation model (preview)
- **deepseek-r1-distill-llama** - DeepSeek R1 distilled to Llama architecture
- **devstral-small** - Development-focused Mistral variant
- **gpt-oss** - Open-source GPT variant
- **seed-oss** - Seed OSS model

### Granite Models
- **granite-4.0-micro** - IBM's Granite 4.0 Micro
- **granite-4.0-h-tiny** - Granite 4.0 H Tiny
- **granite-4.0-h-small** - Granite 4.0 H Small
- **granite-4.0-h-micro** - Granite 4.0 H Micro
- **granite-docling** - Granite model optimized for document understanding
- **granite-embedding-multilingual** - Granite embedding model for multiple languages

### Vision Models
- **moondream2** - Vision-language model
- **smolvlm** - Small vision-language model

### Embedding Models
- **mxbai-embed-large** - MxBai large embedding model
- **nomic-embed-text-v1.5** - Nomic text embedding model v1.5

## How It Works

### Shortened Model Names

For convenience, you can use shortened model names that automatically resolve to the full OCI reference:

- `gemma3` → `docker.io/ai/gemma3:latest`
- `llama3.1` → `docker.io/ai/llama3.1:latest`
- `phi4` → `docker.io/ai/phi4:latest`

### Full OCI References

You can also use full OCI references for more control:

- `docker.io/ai/qwen3:v1.0` - Specific version from Docker Hub
- `ghcr.io/org/model:latest` - Model from GitHub Container Registry
- `myregistry.io/org/model:tag` - Custom OCI registry

### Supported Registries

The OCI client supports any OCI-compliant registry including:
- Docker Hub (`docker.io` / `registry-1.docker.io`)
- GitHub Container Registry (`ghcr.io`)
- Google Container Registry (`gcr.io`)
- Amazon ECR
- Azure Container Registry
- Any custom OCI-compliant registry

## Using OCI Models in the App

OCI models appear in the Models list just like Hugging Face models. To download an OCI model:

1. Open the **Menu** and navigate to **Models**
2. Scroll to find the OCI model you want (they're listed alongside other models)
3. Tap **Download** on the model
4. The app will:
   - Authenticate with the OCI registry (if needed)
   - Fetch the model manifest
   - Extract the GGUF model layer
   - Download the model to your device
5. Once downloaded, tap **Load** to use the model

## Technical Details

### How Download URLs Are Resolved

When you select an OCI model for download:

1. The app parses the model reference (e.g., `gemma3` or `docker.io/ai/llama3.1:v1.0`)
2. It authenticates with the OCI registry using token-based authentication
3. It fetches the OCI manifest for the specified model and tag
4. It identifies the GGUF model layer in the manifest (usually the largest layer)
5. It generates a download URL with the necessary authentication headers
6. The model is downloaded using the existing download infrastructure

### Storage Location

OCI models are stored in a dedicated directory structure:
```
DocumentDirectoryPath/models/oci/<repository>/<filename>
```

For example:
- `DocumentDirectoryPath/models/oci/ai/gemma3/gemma3.gguf`
- `DocumentDirectoryPath/models/oci/ai/llama3.1/llama3.1.gguf`

## Troubleshooting

### Model Not Found
If you get a "model not found" error, verify:
- The model name is correct
- The model exists in the specified registry
- You have network connectivity

### Authentication Failed
For private models:
- Ensure you have the necessary credentials
- Note: Currently only supports public models from Docker Hub

### Download Failed
If the download fails:
- Check your internet connection
- Ensure you have enough storage space
- Try again - temporary network issues can cause failures

## Future Enhancements

Planned improvements include:
- Support for authenticated private registries
- Model search and discovery from OCI registries
- Automatic model updates when new versions are pushed
- Support for multi-file models (model + projection files)

## Contributing

If you'd like to add more OCI models to the default list, please submit a PR with:
- Model name and reference
- Appropriate capabilities and settings
- Testing confirmation

---

For questions or issues with OCI models, please open an issue on GitHub.
