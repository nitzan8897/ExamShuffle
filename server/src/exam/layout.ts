import type { LoadedPdf, TextLine } from "../pdf/pdf.js";
import type { AnalyzedQuestion, OptionLayout, QuestionLayout, Segment } from "../shared/types.js";

const LETTER_SETS = [
  ["א", "ב", "ג", "ד"],
  ["A", "B", "C", "D"],
  ["a", "b", "c", "d"],
];

const PAD = 3;
const GAP = 2;
// A vertical jump larger than this (same page) ends the question's content:
// trailers like "--- סוף המבחן ---" sit after a clearly larger gap.
const CONTENT_GAP_LIMIT = 15;

interface GlobalLine extends TextLine {
  page: number;
}

const QUESTION_WORD_PREFIX = /^(?:שאלה|question)\s*(?:מספר|number|no\.?)?\s*[.()\-:]{0,2}(\d{1,3})(?:\D|$)/i;

function questionNumberOf(text: string): number | null {
  const t = text.trim();
  const wordMatch = t.match(QUESTION_WORD_PREFIX);
  if (wordMatch) return Number(wordMatch[1]);
  const bareMatch = t.match(/^[.()\-:]{0,2}(\d{1,3})(?:\D|$)/);
  return bareMatch ? Number(bareMatch[1]) : null;
}

interface LabelMatch {
  labelMinX: number;
  labelMaxX: number;
  /** True when the label is made of standalone spans, so its bounds are exact. */
  exact: boolean;
}

const isPunctSpan = (str: string): boolean => /^[.)\-:]$/.test(str.trim());

function matchLetterLabel(line: TextLine, letter: string, rtl: boolean): LabelMatch | null {
  for (let i = 0; i < line.spans.length; i++) {
    const span = line.spans[i]!;
    const str = span.str;
    const stripped = str.replace(/^[\s.()\-:]*/, "");
    if (!stripped.startsWith(letter)) continue;
    const rest = stripped.slice(letter.length);
    if (rest !== "" && !/^[.)\-:\s]/.test(rest)) continue;

    if (str.trim().length <= letter.length + 1) {
      // Standalone label span; absorb adjacent punctuation spans ("א" + ".").
      let labelMinX = span.minX;
      let labelMaxX = span.maxX;
      const step = rtl ? 1 : -1;
      for (let j = i + step; j >= 0 && j < line.spans.length; j += step) {
        const next = line.spans[j]!;
        if (!isPunctSpan(next.str)) break;
        labelMinX = Math.min(labelMinX, next.minX);
        labelMaxX = Math.max(labelMaxX, next.maxX);
      }
      return { labelMinX, labelMaxX, exact: true };
    }

    const punct = rest.match(/^[.)\-:]?\s*/);
    const labelChars = str.length - rest.length + (punct ? punct[0].length : 0);
    const labelWidth = (span.maxX - span.minX) * Math.min(1, labelChars / Math.max(1, str.length));
    return rtl
      ? { labelMinX: span.maxX - labelWidth, labelMaxX: span.maxX, exact: false }
      : { labelMinX: span.minX, labelMaxX: span.minX + labelWidth, exact: false };
  }
  return null;
}

function blockEnd(lines: GlobalLine[], anchorIndex: number, laterNumbers: Set<number>): number {
  for (let i = anchorIndex + 1; i < lines.length; i++) {
    const n = questionNumberOf(lines[i]!.text);
    if (n !== null && laterNumbers.has(n)) return i;
  }
  return lines.length;
}

/** Walk from `from`, stopping at the first oversized same-page vertical gap. */
function contentEnd(lines: GlobalLine[], from: number, to: number): number {
  for (let i = from + 1; i < to; i++) {
    const prev = lines[i - 1]!;
    const line = lines[i]!;
    if (line.page === prev.page && line.top - prev.bottom > CONTENT_GAP_LIMIT) return i;
  }
  return to;
}

interface PageBounds {
  minX: number;
  maxX: number;
}

function boundsByPage(lines: GlobalLine[], from: number, to: number): Map<number, PageBounds> {
  const bounds = new Map<number, PageBounds>();
  for (let i = from; i < to; i++) {
    const line = lines[i]!;
    const b = bounds.get(line.page) ?? { minX: Infinity, maxX: -Infinity };
    b.minX = Math.min(b.minX, line.minX);
    b.maxX = Math.max(b.maxX, line.maxX);
    bounds.set(line.page, b);
  }
  return bounds;
}

/**
 * Slice a line range into per-page rectangles. `firstTop` positions the top
 * edge on the first page; `lastBottom` (when set) the bottom edge on the last.
 */
function segmentsForRange(
  lines: GlobalLine[],
  from: number,
  to: number,
  bounds: Map<number, PageBounds>,
  firstTop: number,
  lastBottom: number | null
): Segment[] {
  const segments: Segment[] = [];
  let i = from;
  while (i < to) {
    const page = lines[i]!.page;
    let j = i;
    while (j + 1 < to && lines[j + 1]!.page === page) j++;
    const b = bounds.get(page)!;
    const top = i === from ? firstTop : lines[i]!.top - GAP;
    const bottom = j === to - 1 && lastBottom !== null ? lastBottom : lines[j]!.bottom + GAP;
    segments.push({
      page,
      rect: { x: b.minX - PAD, y: top, w: b.maxX - b.minX + 2 * PAD, h: bottom - top },
    });
    i = j + 1;
  }
  return segments;
}

interface ParsedQuestion {
  anchorIndex: number;
  tailEnd: number;
  optionIndices: number[];
  labels: LabelMatch[];
  letters: string[];
}

function parseQuestionBlock(
  lines: GlobalLine[],
  anchorIndex: number,
  laterNumbers: Set<number>
): ParsedQuestion | null {
  const endIndex = blockEnd(lines, anchorIndex, laterNumbers);

  for (const letters of LETTER_SETS) {
    const rtl = letters[0] === "א";
    const optionIndices: number[] = [];
    const labels: LabelMatch[] = [];
    let from = anchorIndex + 1;
    for (const letter of letters) {
      let found = -1;
      for (let i = from; i < endIndex; i++) {
        const label = matchLetterLabel(lines[i]!, letter, rtl);
        if (label) {
          found = i;
          labels.push(label);
          break;
        }
      }
      if (found === -1) break;
      optionIndices.push(found);
      from = found + 1;
    }
    if (optionIndices.length === 4) {
      const tailEnd = contentEnd(lines, optionIndices[3]!, endIndex);
      return { anchorIndex, tailEnd, optionIndices, labels, letters };
    }
  }
  return null;
}

function buildLayout(question: AnalyzedQuestion, lines: GlobalLine[], parsed: ParsedQuestion): QuestionLayout {
  const { anchorIndex, tailEnd, optionIndices, labels } = parsed;
  const rtl = parsed.letters[0] === "א";
  const bounds = boundsByPage(lines, anchorIndex, tailEnd);
  const anchor = lines[anchorIndex]!;
  const firstOptionIndex = optionIndices[0]!;
  const firstOption = lines[firstOptionIndex]!;

  const stemLastBottom =
    lines[firstOptionIndex - 1]!.page === firstOption.page ? firstOption.top + 1 : null;
  const stem = segmentsForRange(
    lines,
    anchorIndex,
    firstOptionIndex,
    bounds,
    anchor.top - PAD,
    stemLastBottom
  );

  const options: OptionLayout[] = optionIndices.map((lineIndex, k) => {
    const line = lines[lineIndex]!;
    const label = labels[k]!;
    const nextStart = k < 3 ? optionIndices[k + 1]! : tailEnd;
    const nextLine = k < 3 ? lines[optionIndices[k + 1]!]! : null;
    const lastBottom =
      nextLine && lines[nextStart - 1]!.page === nextLine.page ? nextLine.top + 1 : null;

    const segments = segmentsForRange(lines, lineIndex, nextStart, bounds, line.top + 1, lastBottom);
    const pageBounds = bounds.get(line.page)!;
    const labelWidth = rtl
      ? pageBounds.maxX + PAD - label.labelMinX
      : label.labelMaxX - (pageBounds.minX - PAD);
    return { segments, labelWidth, labelExact: label.exact, firstLineHeight: line.bottom - line.top };
  });

  return { number: question.number, page: anchor.page, kind: "mcq", stem, options };
}

function buildOpenLayout(
  question: AnalyzedQuestion,
  lines: GlobalLine[],
  anchorIndex: number,
  laterNumbers: Set<number>
): QuestionLayout {
  const endIndex = blockEnd(lines, anchorIndex, laterNumbers);
  const tailEnd = contentEnd(lines, anchorIndex, endIndex);
  const bounds = boundsByPage(lines, anchorIndex, tailEnd);
  const anchor = lines[anchorIndex]!;
  const stem = segmentsForRange(lines, anchorIndex, tailEnd, bounds, anchor.top - PAD, null);
  return { number: question.number, page: anchor.page, kind: "open", stem, options: [] };
}

export async function locateQuestions(pdf: LoadedPdf, questions: AnalyzedQuestion[]): Promise<QuestionLayout[]> {
  const lines: GlobalLine[] = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    for (const line of await pdf.textLines(page)) {
      lines.push({ ...line, page });
    }
  }

  const allNumbers = questions.map((q) => q.number);
  const layouts: QuestionLayout[] = [];
  const missing: number[] = [];

  for (const [qi, question] of questions.entries()) {
    const laterNumbers = new Set(allNumbers.slice(qi + 1));

    const candidates = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => questionNumberOf(line.text) === question.number)
      .sort((a, b) => Number(b.line.page === question.page) - Number(a.line.page === question.page));

    let located: QuestionLayout | null = null;
    for (const { index } of candidates) {
      if (question.kind === "open") {
        located = buildOpenLayout(question, lines, index, laterNumbers);
        break;
      }
      const parsed = parseQuestionBlock(lines, index, laterNumbers);
      if (parsed) {
        located = buildLayout(question, lines, parsed);
        break;
      }
    }

    if (located) layouts.push(located);
    else missing.push(question.number);
  }

  if (missing.length > 0) {
    throw new Error(
      `Could not locate questions ${missing.join(", ")} in the PDF text layer. ` +
        "Scanned (image-only) PDFs are not supported yet — the PDF must contain selectable text."
    );
  }
  return layouts;
}
