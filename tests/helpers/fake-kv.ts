// In-memory stand-in for a Cloudflare KV namespace (only the methods the store uses).
type Entry = { value: Uint8Array; metadata: unknown };

export class FakeKV {
  data = new Map<string, Entry>();
  writes = 0;

  async put(key: string, value: ArrayBuffer | Uint8Array | string, opts: { metadata?: unknown } = {}) {
    if (opts.metadata && JSON.stringify(opts.metadata).length > 1024) throw new Error("metadata too large");
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value instanceof Uint8Array ? value : new Uint8Array(value));
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("value too large");
    this.writes++;
    this.data.set(key, { value: bytes, metadata: opts.metadata ?? null });
  }

  async getWithMetadata(key: string, _opts?: unknown) {
    const e = this.data.get(key);
    if (!e) return { value: null, metadata: null };
    const body = new Response(e.value.slice().buffer as ArrayBuffer).body;
    return { value: body, metadata: e.metadata };
  }

  async delete(key: string) {
    this.data.delete(key);
  }

  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const limit = opts.limit ?? 1000;
    const all = [...this.data.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).sort();
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const page = all.slice(start, start + limit);
    const done = start + limit >= all.length;
    return {
      keys: page.map((name) => ({ name, metadata: this.data.get(name)!.metadata })),
      list_complete: done,
      cursor: done ? undefined : String(start + limit),
    };
  }
}
