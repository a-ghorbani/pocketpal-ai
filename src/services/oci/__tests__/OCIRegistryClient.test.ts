import {OCIRegistryClient} from '../OCIRegistryClient';

describe('OCIRegistryClient', () => {
  describe('parseReference', () => {
    it('should parse short model names with default registry and org', () => {
      const result = OCIRegistryClient.parseReference('gemma3');
      expect(result).toEqual({
        registry: 'registry-1.docker.io',
        repository: 'ai/gemma3',
        tag: 'latest',
      });
    });

    it('should parse model names with explicit tag', () => {
      const result = OCIRegistryClient.parseReference('llama3.1:v1.0');
      expect(result).toEqual({
        registry: 'registry-1.docker.io',
        repository: 'ai/llama3.1',
        tag: 'v1.0',
      });
    });

    it('should parse org/model format', () => {
      const result = OCIRegistryClient.parseReference('myorg/mymodel');
      expect(result).toEqual({
        registry: 'registry-1.docker.io',
        repository: 'myorg/mymodel',
        tag: 'latest',
      });
    });

    it('should parse full docker.io references', () => {
      const result = OCIRegistryClient.parseReference(
        'docker.io/ai/phi4:latest',
      );
      expect(result).toEqual({
        registry: 'registry-1.docker.io',
        repository: 'ai/phi4',
        tag: 'latest',
      });
    });

    it('should parse custom registry references', () => {
      const result = OCIRegistryClient.parseReference(
        'ghcr.io/user/model:v2.0',
      );
      expect(result).toEqual({
        registry: 'ghcr.io',
        repository: 'user/model',
        tag: 'v2.0',
      });
    });

    it('should handle references with https protocol', () => {
      const result = OCIRegistryClient.parseReference(
        'https://docker.io/ai/qwen3',
      );
      expect(result).toEqual({
        registry: 'registry-1.docker.io',
        repository: 'ai/qwen3',
        tag: 'latest',
      });
    });
  });

  describe('findModelLayer', () => {
    let client: OCIRegistryClient;

    beforeEach(() => {
      client = new OCIRegistryClient();
    });

    it('should find layer with GGUF annotation in title', () => {
      const manifest = {
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        config: {
          mediaType: 'application/vnd.oci.image.config.v1+json',
          size: 100,
          digest: 'sha256:config123',
        },
        layers: [
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            size: 1000,
            digest: 'sha256:layer1',
            annotations: {},
          },
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            size: 5000000,
            digest: 'sha256:model',
            annotations: {
              'org.opencontainers.image.title': 'model.gguf',
            },
          },
        ],
      };

      const result = client.findModelLayer(manifest);
      expect(result).toEqual({
        digest: 'sha256:model',
        size: 5000000,
      });
    });

    it('should return largest layer when no GGUF annotations found', () => {
      const manifest = {
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        config: {
          mediaType: 'application/vnd.oci.image.config.v1+json',
          size: 100,
          digest: 'sha256:config123',
        },
        layers: [
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            size: 1000,
            digest: 'sha256:small',
            annotations: {},
          },
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            size: 9000000,
            digest: 'sha256:large',
            annotations: {},
          },
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            size: 5000,
            digest: 'sha256:medium',
            annotations: {},
          },
        ],
      };

      const result = client.findModelLayer(manifest);
      expect(result).toEqual({
        digest: 'sha256:large',
        size: 9000000,
      });
    });

    it('should return null for empty layers', () => {
      const manifest = {
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        config: {
          mediaType: 'application/vnd.oci.image.config.v1+json',
          size: 100,
          digest: 'sha256:config123',
        },
        layers: [],
      };

      const result = client.findModelLayer(manifest);
      expect(result).toBeNull();
    });
  });
});
