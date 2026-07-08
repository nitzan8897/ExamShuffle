import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { RENDER_SCALE, type RenderedPage } from "../pdf/pdf.js";
import type { OptionLayout, Rect, Segment } from "../shared/types.js";

// Rendered pixels -> CSS px so crops print at their original physical size
// (PDF is 72dpi-based, CSS is 96dpi-based).
export const CSS_SCALE = 96 / 72 / RENDER_SCALE;

const INK_THRESHOLD = 245;
const LABEL_GAP_PX = Math.round(2.2 * RENDER_SCALE);
const MAX_LABEL_SHARE = 0.3;

export type PageGetter = (pageNumber: number) => Promise<RenderedPage>;

export interface Crop {
  dataUri: string;
  widthPx: number;
}

function toCrop(canvas: Canvas): Crop {
  return {
    dataUri: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
    widthPx: Math.round(canvas.width * CSS_SCALE),
  };
}

function cropCanvas(page: RenderedPage, rect: Rect): Canvas {
  const x = Math.max(0, Math.floor(rect.x * RENDER_SCALE));
  const y = Math.max(0, Math.floor(rect.y * RENDER_SCALE));
  const w = Math.max(1, Math.min(page.width - x, Math.ceil(rect.w * RENDER_SCALE)));
  const h = Math.max(1, Math.min(page.height - y, Math.ceil(rect.h * RENDER_SCALE)));
  const canvas = createCanvas(w, h);
  canvas.getContext("2d").drawImage(page.canvas, x, y, w, h, 0, 0, w, h);
  return canvas;
}

/** Stack per-page slices vertically into one image, label-side aligned. */
function mergeVertically(canvases: Canvas[], rtl: boolean): Canvas {
  if (canvases.length === 1) return canvases[0]!;
  const width = Math.max(...canvases.map((c) => c.width));
  const height = canvases.reduce((sum, c) => sum + c.height, 0);
  const merged = createCanvas(width, height);
  const ctx = merged.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const canvas of canvases) {
    ctx.drawImage(canvas, rtl ? width - canvas.width : 0, y);
    y += canvas.height;
  }
  return merged;
}

async function segmentCanvases(getPage: PageGetter, segments: Segment[]): Promise<Canvas[]> {
  const canvases: Canvas[] = [];
  for (const segment of segments) {
    canvases.push(cropCanvas(await getPage(segment.page), segment.rect));
  }
  return canvases;
}

export async function cropSegments(getPage: PageGetter, segments: Segment[], rtl: boolean): Promise<Crop> {
  return toCrop(mergeVertically(await segmentCanvases(getPage, segments), rtl));
}

/**
 * Find where the letter label ends inside the first-line band by scanning
 * pixel columns from the label side: skip blank margin, pass through the
 * label's ink, and stop at the first clear whitespace gap.
 * Returns the erase width in pixels from the label-side edge, or null when
 * no gap is found (fall back to the caller's estimate).
 */
function measureLabel(canvas: Canvas, rtl: boolean, bandHeightPx: number): number | null {
  const w = canvas.width;
  const band = canvas
    .getContext("2d")
    .getImageData(0, 0, w, Math.min(canvas.height, Math.max(4, bandHeightPx)));

  const columnHasInk = (x: number): boolean => {
    for (let y = 0; y < band.height; y++) {
      const i = (y * w + x) * 4;
      if (
        band.data[i]! < INK_THRESHOLD ||
        band.data[i + 1]! < INK_THRESHOLD ||
        band.data[i + 2]! < INK_THRESHOLD
      ) {
        return true;
      }
    }
    return false;
  };

  const maxScan = Math.floor(w * MAX_LABEL_SHARE);
  let inkSeen = false;
  let gapRun = 0;

  for (let step = 0; step < maxScan; step++) {
    const x = rtl ? w - 1 - step : step;
    if (columnHasInk(x)) {
      inkSeen = true;
      gapRun = 0;
    } else if (inkSeen) {
      gapRun++;
      if (gapRun >= LABEL_GAP_PX) {
        return step - gapRun + 1;
      }
    }
  }
  return null;
}

function trimHorizontal(canvas: Canvas): Canvas {
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height);

  const columnHasInk = (x: number): boolean => {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (
        data.data[i]! < INK_THRESHOLD ||
        data.data[i + 1]! < INK_THRESHOLD ||
        data.data[i + 2]! < INK_THRESHOLD
      ) {
        return true;
      }
    }
    return false;
  };

  let minX = 0;
  let maxX = width - 1;
  while (minX < maxX && !columnHasInk(minX)) minX++;
  while (maxX > minX && !columnHasInk(maxX)) maxX--;

  const pad = Math.round(RENDER_SCALE);
  const x = Math.max(0, minX - pad);
  const w = Math.min(width, maxX + pad + 1) - x;
  if (w >= width || w < 1) return canvas;

  const trimmed = createCanvas(w, height);
  trimmed.getContext("2d").drawImage(canvas, x, 0, w, height, 0, 0, w, height);
  return trimmed;
}

export async function cropOptionRow(getPage: PageGetter, option: OptionLayout, rtl: boolean): Promise<Crop> {
  const canvases = await segmentCanvases(getPage, option.segments);
  const first = canvases[0]!;
  const ctx = first.getContext("2d");

  const bandHeightPx = Math.ceil((option.firstLineHeight + 2) * RENDER_SCALE);
  const eraseWidth = option.labelExact
    ? Math.ceil((option.labelWidth + 1.5) * RENDER_SCALE)
    : measureLabel(first, rtl, bandHeightPx) ?? Math.ceil((option.labelWidth + 1) * RENDER_SCALE);

  ctx.fillStyle = "#ffffff";
  if (rtl) {
    ctx.fillRect(first.width - eraseWidth, 0, eraseWidth, Math.min(first.height, bandHeightPx));
  } else {
    ctx.fillRect(0, 0, eraseWidth, Math.min(first.height, bandHeightPx));
  }
  return toCrop(trimHorizontal(mergeVertically(canvases, rtl)));
}
