/**
 * SQLiteShardProvider - Air-gapped offline SQLite Knowledge Store for NJIT
 *
 * Designed for pure on-device, zero-network environments.
 * Stores pre-compiled NJIT binary blobs keyed by topic, prompt hashes, or semantic tags.
 * Since small models (Qwen 2.5 0.5B) lack complex tool-calling / MCP support,
 * this provider intercepts user queries locally, retrieves relevant NJIT parametric
 * shards, and prepares them for direct KV-cache memory grafting into the runtime.
 */

import { NJITKnowledgeShard } from './types';
import { NJITService } from './NJITService';

export interface SQLiteShardRecord {
  key: string;
  topic: string;
  title: string;
  description: string;
  modelTarget: string;
  seqLen: number;
  payload: Uint8Array;
}

export interface ISQLiteDriver {
  execute(query: string, params?: any[]): Promise<any>;
  query<T = any>(query: string, params?: any[]): Promise<T[]>;
}

/**
 * In-memory fallback and standard abstraction for React Native SQLite / op-sqlite
 */
export class MemorySQLiteDriver implements ISQLiteDriver {
  private tables: Map<string, Map<string, any>> = new Map();

  constructor() {
    this.tables.set('njit_shards', new Map());
  }

  async execute(query: string, params?: any[]): Promise<any> {
    if (query.includes('CREATE TABLE')) {
      if (!this.tables.has('njit_shards')) {
        this.tables.set('njit_shards', new Map());
      }
      return { rowsAffected: 0 };
    }

    if (query.includes('INSERT OR REPLACE') && params) {
      const [key, topic, title, description, modelTarget, seqLen, payload] = params;
      const table = this.tables.get('njit_shards')!;
      table.set(key, { key, topic, title, description, modelTarget, seqLen, payload });
      return { rowsAffected: 1 };
    }

    if (query.includes('DELETE FROM') && params) {
      const [key] = params;
      const table = this.tables.get('njit_shards')!;
      const existed = table.delete(key);
      return { rowsAffected: existed ? 1 : 0 };
    }

    return { rowsAffected: 0 };
  }

  async query<T = any>(query: string, params?: any[]): Promise<T[]> {
    const table = this.tables.get('njit_shards')!;
    if (query.includes('SELECT') && query.includes('WHERE key =') && params) {
      const row = table.get(params[0]);
      return row ? ([row] as unknown as T[]) : [];
    }

    if (query.includes('SELECT') && query.includes('WHERE topic =') && params) {
      const rows: any[] = [];
      for (const item of table.values()) {
        if (item.topic === params[0]) {
          rows.push(item);
        }
      }
      return rows as unknown as T[];
    }

    return Array.from(table.values()) as unknown as T[];
  }
}

export class SQLiteShardProvider {
  private driver: ISQLiteDriver;
  private initialized: boolean = false;

  constructor(driver?: ISQLiteDriver) {
    this.driver = driver || new MemorySQLiteDriver();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.driver.execute(`
      CREATE TABLE IF NOT EXISTS njit_shards (
        key TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        modelTarget TEXT NOT NULL,
        seqLen INTEGER NOT NULL,
        payload BLOB NOT NULL
      )
    `);

    this.initialized = true;
  }

  /**
   * Put an NJIT knowledge shard into the air-gapped local database.
   */
  public async putShard(shard: NJITKnowledgeShard): Promise<void> {
    await this.initialize();
    await this.driver.execute(
      `INSERT OR REPLACE INTO njit_shards (key, topic, title, description, modelTarget, seqLen, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        shard.id,
        shard.topic,
        shard.title,
        shard.description || '',
        shard.modelTarget,
        shard.seqLen,
        shard.data,
      ]
    );
  }

  /**
   * Fetch a shard and load it directly into NJITService for memory grafting.
   */
  public async loadShardToNJIT(key: string): Promise<boolean> {
    await this.initialize();
    const rows = await this.driver.query<SQLiteShardRecord>(
      'SELECT * FROM njit_shards WHERE key = ? LIMIT 1',
      [key]
    );

    if (rows.length === 0) {
      return false;
    }

    const rec = rows[0];
    const shard: NJITKnowledgeShard = {
      id: rec.key,
      topic: rec.topic,
      title: rec.title,
      description: rec.description,
      modelTarget: rec.modelTarget,
      seqLen: rec.seqLen,
      sizeBytes: rec.payload.byteLength,
      data: rec.payload,
    };

    NJITService.getInstance().registerShard(shard);
    return true;
  }

  /**
   * Query matching shards by topic without needing LLM tool-calling.
   */
  public async findShardsByTopic(topic: string): Promise<SQLiteShardRecord[]> {
    await this.initialize();
    return this.driver.query<SQLiteShardRecord>(
      'SELECT key, topic, title, description, modelTarget, seqLen FROM njit_shards WHERE topic = ?',
      [topic]
    );
  }
}
