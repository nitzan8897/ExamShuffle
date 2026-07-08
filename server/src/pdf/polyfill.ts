// pdfjs-dist relies on process.getBuiltinModule (Node >= 20.16) to load its
// Node polyfills; shim it and the canvas globals for older Node 20 releases.
import { createRequire } from "node:module";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

const require = createRequire(import.meta.url);
const proc = process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown };

if (typeof proc.getBuiltinModule !== "function") {
  proc.getBuiltinModule = (id: string) => require(id.includes(":") ? id : `node:${id}`);
}

const g = globalThis as Record<string, unknown>;
g.DOMMatrix ??= DOMMatrix;
g.ImageData ??= ImageData;
g.Path2D ??= Path2D;
