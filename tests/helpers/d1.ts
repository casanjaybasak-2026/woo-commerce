// Minimal D1 API adapter over node:sqlite so repository code runs real SQL in tests.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, unknown>;

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p)));
  }
  async first<T = Row>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[])) as Row | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T = Row>(): Promise<{ results: T[]; success: true; meta: object }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[])) as Row[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  runSync() {
    return this.db.prepare(this.sql).run(...(this.params as never[]));
  }
}

class TestD1 {
  constructor(public raw: DatabaseSync) {}
  prepare(sql: string) {
    return new Statement(this.raw, sql);
  }
  async batch(stmts: Statement[]) {
    this.raw.exec("BEGIN");
    try {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      this.raw.exec("COMMIT");
      return out;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
  async exec(sql: string) {
    this.raw.exec(sql);
    return { count: 0, duration: 0 };
  }
}

const migrationsDir = join(import.meta.dirname, "..", "..", "migrations");

export async function createTestDb(): Promise<D1Database> {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  return new TestD1(raw) as unknown as D1Database;
}
