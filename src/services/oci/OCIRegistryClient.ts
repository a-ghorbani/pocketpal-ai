/**
 * OCI Registry Client for pulling model artifacts from OCI registries (Docker Hub, etc.)
 *
 * This implementation follows the OCI Distribution Specification to download
 * GGUF model files stored as OCI artifacts.
 */

import axios from 'axios';

export interface OCIManifest {
  schemaVersion: number;
  mediaType: string;
  config: {
    mediaType: string;
    size: number;
    digest: string;
  };
  layers: Array<{
    mediaType: string;
    size: number;
    digest: string;
    annotations?: {
      [key: string]: string;
    };
  }>;
}

export interface OCIAuthToken {
  token: string;
  access_token?: string;
  expires_in?: number;
  issued_at?: string;
}

export interface OCIBlobDownloadInfo {
  url: string;
  size: number;
  digest: string;
  headers?: {[key: string]: string};
}

export class OCIRegistryClient {
  private registry: string;
  private authToken?: string;

  constructor(registry: string = 'registry-1.docker.io') {
    this.registry = registry;
  }

  /**
   * Parse a reference string into registry, repository and tag components
   * Supports formats like:
   * - gemma3 -> docker.io/ai/gemma3:latest
   * - docker.io/ai/llama3.1 -> docker.io/ai/llama3.1:latest
   * - ghcr.io/user/model:v1.0 -> ghcr.io/user/model:v1.0
   */
  static parseReference(ref: string): {
    registry: string;
    repository: string;
    tag: string;
  } {
    // Default registry and org
    const defaultRegistry = 'registry-1.docker.io';
    const defaultOrg = 'ai';
    const defaultTag = 'latest';

    // Remove any protocol prefix
    let cleanRef = ref.replace(/^(https?:\/\/)?/, '');

    // Split by / to get components
    const parts = cleanRef.split('/');

    let registry: string;
    let repository: string;
    let tag: string;

    if (parts.length === 1) {
      // Format: model or model:tag
      registry = defaultRegistry;
      const [name, tagPart] = parts[0].split(':');
      repository = `${defaultOrg}/${name}`;
      tag = tagPart || defaultTag;
    } else if (parts.length === 2) {
      // Format: org/model or org/model:tag
      // Check if first part looks like a registry (contains dots)
      if (parts[0].includes('.')) {
        // It's a registry
        registry = parts[0];
        const [name, tagPart] = parts[1].split(':');
        repository = `${defaultOrg}/${name}`;
        tag = tagPart || defaultTag;
      } else {
        // It's org/model
        registry = defaultRegistry;
        const [name, tagPart] = parts[1].split(':');
        repository = `${parts[0]}/${name}`;
        tag = tagPart || defaultTag;
      }
    } else {
      // Format: registry/org/model or registry/org/model:tag
      registry = parts[0];
      const [name, tagPart] = parts[parts.length - 1].split(':');
      const org = parts.slice(1, -1).join('/');
      repository = `${org}/${name}`;
      tag = tagPart || defaultTag;
    }

    // For docker.io, use the actual registry endpoint
    if (registry === 'docker.io') {
      registry = 'registry-1.docker.io';
    }

    return {registry, repository, tag};
  }

  /**
   * Authenticate with the OCI registry
   */
  private async authenticate(repository: string): Promise<string | undefined> {
    try {
      // For Docker Hub, we need to get a token from auth.docker.io
      const authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;

      const response = await axios.get<OCIAuthToken>(authUrl);

      if (response.data.token || response.data.access_token) {
        this.authToken = response.data.token || response.data.access_token;
        return this.authToken;
      }
    } catch (error) {
      console.error('Failed to authenticate with OCI registry:', error);
      // Continue without auth for public repos
    }

    return undefined;
  }

  /**
   * Get the manifest for a given reference
   */
  async getManifest(repository: string, tag: string): Promise<OCIManifest> {
    // Try to authenticate first
    await this.authenticate(repository);

    const url = `https://${this.registry}/v2/${repository}/manifests/${tag}`;

    const headers: {[key: string]: string} = {
      Accept:
        'application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json',
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    try {
      const response = await axios.get<OCIManifest>(url, {headers});
      return response.data;
    } catch (error) {
      console.error('Failed to get manifest:', error);
      throw new Error(
        `Failed to get manifest for ${repository}:${tag}: ${error}`,
      );
    }
  }

  /**
   * Get download information for a blob (layer)
   * Returns URL and headers needed to download the blob
   */
  async getBlobDownloadInfo(
    repository: string,
    digest: string,
    size: number,
  ): Promise<OCIBlobDownloadInfo> {
    // Ensure we have a valid auth token
    if (!this.authToken) {
      await this.authenticate(repository);
    }

    const url = `https://${this.registry}/v2/${repository}/blobs/${digest}`;

    const headers: {[key: string]: string} = {};
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return {
      url,
      size,
      digest,
      headers,
    };
  }

  /**
   * Find the GGUF model layer in the manifest
   * GGUF files are typically the largest layer or annotated appropriately
   */
  findModelLayer(manifest: OCIManifest): {
    digest: string;
    size: number;
  } | null {
    // Look for layers with GGUF-related annotations or the largest layer
    let modelLayer: {digest: string; size: number} | null = null;
    let maxSize = 0;

    for (const layer of manifest.layers) {
      // Check annotations for GGUF indicators
      const annotations = layer.annotations || {};
      const title = annotations['org.opencontainers.image.title'] || '';
      const filename = annotations['org.opencontainers.artifact.created'] || '';

      if (
        title.toLowerCase().includes('.gguf') ||
        filename.toLowerCase().includes('.gguf')
      ) {
        return {
          digest: layer.digest,
          size: layer.size,
        };
      }

      // Track the largest layer as fallback
      if (layer.size > maxSize) {
        maxSize = layer.size;
        modelLayer = {
          digest: layer.digest,
          size: layer.size,
        };
      }
    }

    return modelLayer;
  }

  /**
   * Get download URL for a model from OCI registry
   */
  async getModelDownloadUrl(ref: string): Promise<OCIBlobDownloadInfo> {
    const {registry, repository, tag} = OCIRegistryClient.parseReference(ref);

    // Update the registry for this request
    this.registry = registry;

    // Get the manifest
    const manifest = await this.getManifest(repository, tag);

    // Find the model layer
    const modelLayer = this.findModelLayer(manifest);
    if (!modelLayer) {
      throw new Error('No model layer found in OCI manifest');
    }

    // Get download info for the blob
    return this.getBlobDownloadInfo(
      repository,
      modelLayer.digest,
      modelLayer.size,
    );
  }
}
