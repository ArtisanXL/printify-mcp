import { readFile } from "node:fs/promises";
import { basename } from "node:path";
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
    .describe("Path to a local image file; it is read and uploaded base64-encoded. Exactly one of url, contents, file_path is required."),
});

const uploadAnImage: ToolExtension = {
  inputSchema: { body: uploadBody },
  async prepare(args) {
    const body = args.body;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return { error: "Invalid upload: `body` is required and must contain exactly one of url, contents, file_path." };
    }
    const { file_path, ...rest } = body as Record<string, unknown>;
    const given = (["url", "contents", "file_path"] as const).filter(
      (k) => (body as Record<string, unknown>)[k] !== undefined,
    );
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
    let data: Buffer;
    try {
      data = await readFile(file_path);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { error: `Cannot read file_path "${file_path}": ${reason}` };
    }
    const file_name = typeof rest.file_name === "string" && rest.file_name !== "" ? rest.file_name : basename(file_path);
    return { args: { ...args, body: { ...rest, file_name, contents: data.toString("base64") } } };
  },
};

const extensions: Record<string, ToolExtension> = { uploadAnImage };

export const extensionFor = (tool: ToolDef): ToolExtension | undefined => extensions[tool.operationId];
