import "./polyfill.js";
import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api.js";

const require = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));

export const RENDER_SCALE = 2.5;

export interface TextSpan {
  str: string;
  minX: number;
  maxX: number;
  top: number;
  bottom: number;
}

export interface TextLine {
  text: string;
  spans: TextSpan[];
  minX: number;
  maxX: number;
  top: number;
  bottom: number;
}

export interface RenderedPage {
  canvas: Canvas;
  width: number;
  height: number;
}

export class LoadedPdf {
  private constructor(private readonly doc: PDFDocumentProxy) {}

  static async open(buffer: Buffer): Promise<LoadedPdf> {
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      standardFontDataUrl: path.join(pdfjsDir, "standard_fonts") + path.sep,
      isEvalSupported: false,
    }).promise;
    return new LoadedPdf(doc);
  }

  get numPages(): number {
    return this.doc.numPages;
  }

  /** Page height in PDF units (scale 1, same units as `textLines`). */
  async pageHeight(pageNumber: number): Promise<number> {
    const page = await this.doc.getPage(pageNumber);
    return page.getViewport({ scale: 1 }).height;
  }

  async renderPage(pageNumber: number): Promise<RenderedPage> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    return { canvas, width: canvas.width, height: canvas.height };
  }

  /** Text lines in PDF units with top-left origin, sorted top to bottom. */
  async textLines(pageNumber: number): Promise<TextLine[]> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const spans: TextSpan[] = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      const [x, yBaseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const h = item.height || 10;
      spans.push({
        str: item.str,
        minX: x,
        maxX: x + item.width,
        top: yBaseline - h,
        bottom: yBaseline + h * 0.28,
      });
    }

    const lines: TextLine[] = [];
    for (const span of spans.sort((a, b) => a.top - b.top)) {
      const line = lines.find(
        (l) => Math.abs((l.top + l.bottom) / 2 - (span.top + span.bottom) / 2) < (span.bottom - span.top) * 0.6
      );
      if (line) {
        line.spans.push(span);
        line.minX = Math.min(line.minX, span.minX);
        line.maxX = Math.max(line.maxX, span.maxX);
        line.top = Math.min(line.top, span.top);
        line.bottom = Math.max(line.bottom, span.bottom);
      } else {
        lines.push({ text: "", spans: [span], minX: span.minX, maxX: span.maxX, top: span.top, bottom: span.bottom });
      }
    }

    for (const line of lines) {
      line.spans.sort((a, b) => b.maxX - a.maxX);
      line.text = line.spans.map((s) => s.str).join(" ").trim();
    }

    const footerCut = viewport.height * 0.92;
    const isFooter = (l: TextLine): boolean =>
      l.top > footerCut && (/^(עמוד|page)\s+\d+/i.test(l.text) || /^\d+(\s*\/\s*\d+)?$/.test(l.text));

    return lines.filter((l) => !isFooter(l)).sort((a, b) => a.top - b.top);
  }

  async close(): Promise<void> {
    await this.doc.destroy();
  }
}
