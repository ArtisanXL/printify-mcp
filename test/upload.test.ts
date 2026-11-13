import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertExtensionsMatch } from "../src/extensions.js";
import { tools } from "../src/generated/tools.js";
import { resultText, startHarness } from "./support/harness.js";

let dir: string;
let png: string;
const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "printify-upload-"));
  png = join(dir, "logo.png");
  await writeFile(png, bytes);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function upload(body: unknown) {
  const h = await startHarness({ readOnly: false });
  const result = await h.client.callTool({ name: "upload_an_image", arguments: { body } as never });
  await h.close();
  return { result, requests: h.http.requests };
}

describe("upload_an_image", () => {
  it("lists file_path in the input schema", async () => {
    const h = await startHarness({ readOnly: false });
    const { tools } = await h.client.listTools();
    const t = tools.find((x) => x.name === "upload_an_image")!;
    expect(JSON.stringify(t.inputSchema)).toContain("file_path");
    await h.close();
  });

  it("is a Write Tool, absent in Read-only Mode", async () => {
    const h = await startHarness();
    const { tools } = await h.client.listTools();
    expect(tools.some((x) => x.name === "upload_an_image")).toBe(false);
    await h.close();
  });

  it("reads file_path, sends base64 contents, defaults file_name to basename", async () => {
    const { result, requests } = await upload({ file_path: png });
    expect(result.isError).toBeFalsy();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toMatch(/\/v1\/uploads\/images\.json$/);
    expect(JSON.parse(requests[0].body!)).toEqual({ file_name: "logo.png", contents: bytes.toString("base64") });
  });

  it("keeps an explicit file_name with file_path", async () => {
    const { requests } = await upload({ file_path: png, file_name: "custom.png" });
    expect(JSON.parse(requests[0].body!)).toEqual({ file_name: "custom.png", contents: bytes.toString("base64") });
  });

  it("passes url through unchanged", async () => {
    const { result, requests } = await upload({ url: "http://x/a.png", file_name: "a.png" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(requests[0].body!)).toEqual({ url: "http://x/a.png", file_name: "a.png" });
  });

  it("passes contents through unchanged", async () => {
    const { requests } = await upload({ contents: "AAAA", file_name: "a.png" });
    expect(JSON.parse(requests[0].body!)).toEqual({ contents: "AAAA", file_name: "a.png" });
  });

  it.each([
    ["none given", {}],
    ["url and contents", { url: "http://x", contents: "AA", file_name: "a.png" }],
    ["url and file_path", { url: "http://x", file_path: "/x", file_name: "a.png" }],
    ["all three", { url: "http://x", contents: "AA", file_path: "/x" }],
  ])("rejects %s without calling Printify", async (_n, body) => {
    const { result, requests } = await upload(body);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("exactly one of url, contents, file_path");
    expect(requests).toHaveLength(0);
  });

  it("requires file_name with url or contents", async () => {
    for (const body of [{ url: "http://x" }, { contents: "AA" }]) {
      const { result, requests } = await upload(body);
      expect(result.isError).toBe(true);
      expect(resultText(result)).toContain("file_name");
      expect(requests).toHaveLength(0);
    }
  });

  it("returns isError for an unreadable file without calling Printify", async () => {
    const missing = join(dir, "nope.png");
    for (const p of [missing, dir]) {
      const { result, requests } = await upload({ file_path: p });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toContain("Cannot read file_path");
      expect(requests).toHaveLength(0);
    }
  });

  it("expands ~/ and bare ~ with the home directory", async () => {
    const orig = process.env.HOME;
    process.env.HOME = dir;
    try {
      expect(homedir()).toBe(dir);
      const { result, requests } = await upload({ file_path: "~/logo.png" });
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(requests[0].body!)).toEqual({ file_name: "logo.png", contents: bytes.toString("base64") });
      const bare = await upload({ file_path: "~" });
      expect(bare.result.isError).toBe(true);
      expect(resultText(bare.result)).toContain("Cannot read file_path");
    } finally {
      process.env.HOME = orig;
    }
  });

  it("rejects relative file_path without calling Printify", async () => {
    for (const p of ["logo.png", "./logo.png", "../logo.png", "~other/x.png"]) {
      const { result, requests } = await upload({ file_path: p });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toContain("absolute");
      expect(requests).toHaveLength(0);
    }
  });

  it("rejects empty url, contents and file_path without calling Printify", async () => {
    for (const body of [{ url: "", file_name: "a.png" }, { contents: "", file_name: "a.png" }, { file_path: "" }]) {
      const { result, requests } = await upload(body);
      expect(result.isError).toBe(true);
      expect(resultText(result)).toContain("non-empty");
      expect(requests).toHaveLength(0);
    }
  });

  it("passes unknown extra body fields through", async () => {
    const { requests } = await upload({ file_path: png, extra: { a: 1 } });
    expect(JSON.parse(requests[0].body!)).toEqual({ file_name: "logo.png", contents: bytes.toString("base64"), extra: { a: 1 } });
    const u = await upload({ url: "http://x/a.png", file_name: "a.png", extra: 2 });
    expect(JSON.parse(u.requests[0].body!)).toEqual({ url: "http://x/a.png", file_name: "a.png", extra: 2 });
  });

  it("falls back to basename for an empty file_name with file_path", async () => {
    const { requests } = await upload({ file_path: png, file_name: "" });
    expect(JSON.parse(requests[0].body!).file_name).toBe(basename(png));
  });
});

describe("extension table guard", () => {
  it("accepts the real table against the generated tools", () => {
    expect(() => assertExtensionsMatch(tools.map((t) => t.operationId))).not.toThrow();
  });

  it("throws for a key matching no operationId", () => {
    expect(() => assertExtensionsMatch(["a", "b"], ["a", "renamedOp"])).toThrow(/renamedOp/);
  });
});
