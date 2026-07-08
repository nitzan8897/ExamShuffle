import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: [path.resolve(here, "../../../.env"), path.resolve(here, "../../.env")],
});

export function geminiApiKey(override?: string): string {
  const key = override?.trim() || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is missing. Set it in .env or provide one in the UI.");
  }
  return key;
}

export const geminiModel = (override?: string): string =>
  override?.trim() || process.env.GEMINI_MODEL || "gemini-2.5-flash";
