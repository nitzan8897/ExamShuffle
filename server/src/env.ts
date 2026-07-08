import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: [path.resolve(here, "../../.env"), path.resolve(here, "../.env")],
});

export function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is missing. Copy .env.example to .env and set your key.");
  }
  return key;
}

export const geminiModel = (): string => process.env.GEMINI_MODEL || "gemini-2.5-flash";
