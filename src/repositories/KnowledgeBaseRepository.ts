import {Q} from '@nozbe/watermelondb';
import {database, KbDocument, KbChunk} from '../database';
import type {KbDocStatus} from '../database/models/KbDocument';

export interface NewKbDoc {
  name: string;
  mime?: string;
  size: number;
  contentHash: string;
  presetId: string;
  dims: number;
  source: 'attach' | 'manual';
}

/**
 * WatermelonDB CRUD for the local knowledge base. Vector blobs live on
 * the filesystem (see utils/rag/vectorStore); this layer owns document
 * metadata and chunk text.
 */
class KnowledgeBaseRepository {
  async getDocuments(): Promise<KbDocument[]> {
    return database.get<KbDocument>('kb_documents').query().fetch();
  }

  async getReadyDocuments(): Promise<KbDocument[]> {
    const all = await this.getDocuments();
    return all.filter(d => d.status === 'ready');
  }

  async findByHash(contentHash: string): Promise<KbDocument[]> {
    return database
      .get<KbDocument>('kb_documents')
      .query(Q.where('content_hash', contentHash))
      .fetch();
  }

  async createDocument(input: NewKbDoc): Promise<KbDocument> {
    const now = Date.now();
    return await database.write(async () => {
      return await database.get<KbDocument>('kb_documents').create(doc => {
        doc.name = input.name;
        doc.mime = input.mime;
        doc.size = input.size;
        doc.contentHash = input.contentHash;
        doc.presetId = input.presetId;
        doc.dims = input.dims;
        doc.source = input.source;
        doc.chunkCount = 0;
        doc.charCount = 0;
        doc.status = 'indexing' satisfies KbDocStatus;
        doc.createdAt = now;
        doc.updatedAt = now;
      });
    });
  }

  async finalizeDocument(
    doc: KbDocument,
    update: {chunkCount: number; charCount: number; dims?: number},
  ): Promise<KbDocument> {
    return await database.write(async () => {
      return await doc.update(d => {
        d.chunkCount = update.chunkCount;
        d.charCount = update.charCount;
        if (update.dims != null) {
          d.dims = update.dims;
        }
        d.status = 'ready';
        d.error = undefined;
        d.updatedAt = Date.now();
      });
    });
  }

  async failDocument(doc: KbDocument, error: string): Promise<void> {
    await database.write(async () => {
      await doc.update(d => {
        d.status = 'error';
        d.error = error;
        d.updatedAt = Date.now();
      });
    });
  }

  async getChunks(docId: string): Promise<KbChunk[]> {
    return database
      .get<KbChunk>('kb_chunks')
      .query(Q.where('doc_id', docId), Q.sortBy('position', Q.asc))
      .fetch();
  }

  async getChunksForDocs(docIds: string[]): Promise<Map<string, KbChunk[]>> {
    const out = new Map<string, KbChunk[]>();
    // One query per doc is fine at phone corpus sizes and avoids
    // WatermelonDB's awkward Q.or nesting.
    for (const id of docIds) {
      out.set(id, await this.getChunks(id));
    }
    return out;
  }

  async replaceChunks(
    doc: KbDocument,
    chunks: {position: number; text: string}[],
  ): Promise<void> {
    await database.write(async () => {
      const existing = await this.getChunks(doc.id);
      await database.batch(
        ...existing.map(c => c.prepareDestroyPermanently()),
        ...chunks.map(chunk =>
          database.get<KbChunk>('kb_chunks').prepareCreate(c => {
            c.docId = doc.id;
            c.position = chunk.position;
            c.text = chunk.text;
            c.createdAt = Date.now();
          }),
        ),
      );
    });
  }

  async deleteDocument(doc: KbDocument): Promise<void> {
    await database.write(async () => {
      const chunks = await this.getChunks(doc.id);
      await database.batch(
        ...chunks.map(c => c.prepareDestroyPermanently()),
        doc.prepareDestroyPermanently(),
      );
    });
  }

  async totalChunkCount(): Promise<number> {
    const docs = await this.getReadyDocuments();
    return docs.reduce((sum, d) => sum + d.chunkCount, 0);
  }
}

export const knowledgeBaseRepository = new KnowledgeBaseRepository();
