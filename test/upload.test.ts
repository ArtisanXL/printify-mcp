import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
});
