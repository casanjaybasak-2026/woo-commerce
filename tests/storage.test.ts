import { FakeKV } from "./helpers/fake-kv";
import { KvFileStore, canStore, FREE_STORAGE_CAP_BYTES, MAX_FILE_BYTES } from "../src/lib/storage";

const store = (kv = new FakeKV()) => ({ kv, files: new KvFileStore(kv as unknown as KVNamespace) });
const bytes = (n: number) => new Uint8Array(n).fill(65);

test("put then get returns the bytes, size and content type", async () => {
  const { files } = store();
  await files.put("products/p1/a.pdf", bytes(10), "application/pdf");
  const got = await files.get("products/p1/a.pdf");
  expect(got).not.toBeNull();
  expect(got!.size).toBe(10);
  expect(got!.contentType).toBe("application/pdf");
  expect(new Uint8Array(await new Response(got!.body).arrayBuffer())).toEqual(bytes(10));
});

test("get and head return null for missing keys", async () => {
  const { files } = store();
  expect(await files.get("nope")).toBeNull();
  expect(await files.head("nope")).toBeNull();
});

test("head returns size and type without the body", async () => {
  const { files } = store();
  await files.put("covers/p1/c.png", bytes(7), "image/png");
  expect(await files.head("covers/p1/c.png")).toEqual({ size: 7, contentType: "image/png" });
});

test("delete removes one key or many", async () => {
  const { files, kv } = store();
  await files.put("a", bytes(1), "x");
  await files.put("b", bytes(1), "x");
  await files.put("c", bytes(1), "x");
  await files.delete("a");
  await files.delete(["b", "c"]);
  expect(kv.data.size).toBe(0);
});

test("listKeys returns every key under a prefix across pages", async () => {
  const kv = new FakeKV();
  const files = new KvFileStore(kv as unknown as KVNamespace, { pageSize: 2 });
  for (const k of ["products/p1/a", "products/p1/b", "products/p1/c", "products/p2/x"]) await files.put(k, bytes(1), "x");
  expect(await files.listKeys("products/p1/")).toEqual(["products/p1/a", "products/p1/b", "products/p1/c"]);
});

test("usedBytes sums the size of every stored file", async () => {
  const kv = new FakeKV();
  const files = new KvFileStore(kv as unknown as KVNamespace, { pageSize: 2 });
  await files.put("covers/p1/c.png", bytes(100), "image/png");
  await files.put("products/p1/a.pdf", bytes(250), "application/pdf");
  await files.put("products/p2/b.zip", bytes(50), "application/zip");
  expect(await files.usedBytes()).toBe(400);
});

test("put rejects files over the 25 MB KV limit", async () => {
  const { files, kv } = store();
  expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
  await expect(files.put("big", bytes(MAX_FILE_BYTES + 1), "x")).rejects.toThrow(/25 MB/);
  expect(kv.writes).toBe(0);
});

test("canStore keeps total storage under the free-tier safety cap (900 MB)", () => {
  expect(FREE_STORAGE_CAP_BYTES).toBe(900 * 1024 * 1024);
  expect(canStore(0, 10)).toEqual({ ok: true });
  expect(canStore(FREE_STORAGE_CAP_BYTES - 10, 10)).toEqual({ ok: true });
  const r = canStore(FREE_STORAGE_CAP_BYTES - 10, 11);
  expect(r.ok).toBe(false);
  expect(!r.ok && r.message).toMatch(/free storage/i);
});
