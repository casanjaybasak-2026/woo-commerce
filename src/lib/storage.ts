// File storage for covers and deliverables, backed by Cloudflare Workers KV.
// KV's free tier needs no payment method: 1 GB storage, 25 MB per value,
// 1,000 writes/deletes/lists and 100,000 reads per day.
// Everything else in the app talks to the small FileStore interface, so moving to
// R2 later only means adding another implementation.

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // KV value limit
export const FREE_STORAGE_CAP_BYTES = 900 * 1024 * 1024; // stay safely under KV's 1 GB free tier

export interface StoredFile {
  body: ReadableStream;
  size: number;
  contentType: string;
}

export interface FileStore {
  put(key: string, data: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  delete(keys: string | string[]): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
  usedBytes(): Promise<number>;
}

interface FileMeta {
  size: number;
  type: string;
}

export class KvFileStore implements FileStore {
  private pageSize: number;
  constructor(private kv: KVNamespace, opts: { pageSize?: number } = {}) {
    this.pageSize = opts.pageSize ?? 1000;
  }

  async put(key: string, data: ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
    if (data.byteLength > MAX_FILE_BYTES) throw new RangeError("Files must be 25 MB or smaller.");
    const meta: FileMeta = { size: data.byteLength, type: contentType.slice(0, 200) || "application/octet-stream" };
    await this.kv.put(key, data, { metadata: meta });
  }

  async get(key: string): Promise<StoredFile | null> {
    const { value, metadata } = await this.kv.getWithMetadata<FileMeta>(key, { type: "stream" });
    if (!value) return null;
    return { body: value, size: metadata?.size ?? 0, contentType: metadata?.type ?? "application/octet-stream" };
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    // KV has no HEAD: listing the exact key returns its metadata without reading the value.
    const { keys } = await this.kv.list<FileMeta>({ prefix: key, limit: 1 });
    const hit = keys.find((k) => k.name === key);
    if (!hit) return null;
    return { size: hit.metadata?.size ?? 0, contentType: hit.metadata?.type ?? "application/octet-stream" };
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) await this.kv.delete(k);
  }

  private async *entries(prefix: string) {
    let cursor: string | undefined;
    do {
      const page = await this.kv.list<FileMeta>({ prefix, cursor, limit: this.pageSize });
      for (const k of page.keys) yield k;
      cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;
    } while (cursor);
  }

  async listKeys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for await (const k of this.entries(prefix)) out.push(k.name);
    return out;
  }

  async usedBytes(): Promise<number> {
    let total = 0;
    for await (const k of this.entries("")) total += k.metadata?.size ?? 0;
    return total;
  }
}

/** Refuses uploads that would push total storage past the free-tier safety cap. */
export function canStore(usedBytes: number, newBytes: number): { ok: true } | { ok: false; message: string } {
  if (usedBytes + newBytes <= FREE_STORAGE_CAP_BYTES) return { ok: true };
  const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
  return {
    ok: false,
    message: `This upload would go past the free storage limit (${mb(usedBytes)} MB of ${mb(FREE_STORAGE_CAP_BYTES)} MB used). Remove old files first.`,
  };
}
