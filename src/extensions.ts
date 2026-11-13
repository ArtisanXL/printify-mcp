import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { z, type ZodType } from "zod";
import type { ToolDef } from "./tool-def.js";

/**
 * The only hand-written Tool behaviour (ADR-0001), kept isolated and keyed by
 * `operationId`. Generated code is untouched; the server applies these at
 * registration time and dispatch time.
 */
export interface ToolExtension {
  /** Replaces/extends entries of the generated input schema. */
  inputSchema: Record<string, ZodType>;
  /** Transforms the arguments before dispatch; `error` short-circuits with an isError result. */
  prepare(args: Record<string, unknown>): Promise<{ args: Record<string, unknown> } | { error: string }>;
}

const uploadBody = z.looseObject({
  file_name: z
    .string()
    .optional()
    .describe("File name. Required with url or contents; with file_path defaults to the file's basename."),
  url: z.string().optional().describe("URL of the image. Exactly one of url, contents, file_path is required."),
  contents: z.string().optional().describe("Base64-encoded image content. Exactly one of url, contents, file_path is required."),
  file_path: z
    .string()
    .optional()
    .describe(
      "Absolute path to a local image file on the machine running this server (a leading ~/ is expanded to the home directory; other relative paths are rejected). It is read and uploaded base64-encoded. Exactly one of url, contents, file_path is required.",
    ),
});

const uploadAnImage: ToolExtension = {
  inputSchema: { body: uploadBody },
  async prepare(args) {
    // `body` is required by the generated input schema, so it is always an object here.
    const body = args.body as Record<string, unknown>;
    const { file_path, ...rest } = body;
    for (const k of ["url", "contents", "file_path"] as const) {
      if (body[k] !== undefined && body[k] === "") return { error: `Invalid upload: ${k} must be a non-empty string.` };
    }
    const given = (["url", "contents", "file_path"] as const).filter((k) => body[k] !== undefined);
    if (given.length !== 1) {
      return {
        error: `Invalid upload: exactly one of url, contents, file_path is required, but ${
          given.length === 0 ? "none was" : `${given.join(", ")} were`
        } given.`,
      };
    }
    if (given[0] !== "file_path") {
      if (typeof rest.file_name !== "string" || rest.file_name === "") {
        return { error: `Invalid upload: file_name is required when using ${given[0]}.` };
      }
      return { args };
    }
    if (typeof file_path !== "string" || file_path === "") {
      return { error: "Invalid upload: file_path must be a non-empty string." };
    }
    const resolved = file_path === "~" ? homedir() : file_path.startsWith("~/") ? join(homedir(), file_path.slice(2)) : file_path;
    if (!isAbsolute(resolved)) {
      return { error: `Invalid upload: file_path must be an absolute path (or start with ~/), got "${file_path}".` };
    }
    let data: Buffer;
    try {
      data = await readFile(resolved);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { error: `Cannot read file_path "${file_path}": ${reason}` };
    }
    const file_name = typeof rest.file_name === "string" && rest.file_name !== "" ? rest.file_name : basename(resolved);
    return { args: { ...args, body: { ...rest, file_name, contents: data.toString("base64") } } };
  },
};

const extensions: Record<string, ToolExtension> = { uploadAnImage };

export const extensionFor = (tool: ToolDef): ToolExtension | undefined => extensions[tool.operationId];

/** Fail fast when an extension key matches no generated Tool (e.g. after a spec rename). */
export function assertExtensionsMatch(operationIds: Iterable<string>, keys: readonly string[] = Object.keys(extensions)): void {
  const ids = new Set(operationIds);
  const orphans = keys.filter((k) => !ids.has(k));
  if (orphans.length > 0) {
    throw new Error(`Tool extension(s) match no generated operationId: ${orphans.join(", ")}. Was the spec renamed?`);
  }
}
