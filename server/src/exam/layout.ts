import type { LoadedPdf, TextLine } from "../pdf/pdf.js";
import type { AnalyzedQuestion, OptionLayout, QuestionLayout, Rect } from "../shared/types.js";

const LETTER_SETS = [
  ["א", "ב", "ג", "ד"],
  ["A", "B", "C", "D"],
  ["a", "b", "c", "d"],
];

const PAD = 3;
const GAP = 2;

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

interface ParsedQuestion {
  anchorIndex: number;
  endIndex: number;
  optionIndices: number[];
  labels: LabelMatch[];
  letters: string[];
}

function blockEnd(lines: TextLine[], anchorIndex: number, laterNumbers: Set<number>): number {
  for (let i = anchorIndex + 1; i < lines.length; i++) {
    const n = questionNumberOf(lines[i]!.text);
    if (n !== null && laterNumbers.has(n)) return i;
  }
  return lines.length;
}

function parseQuestionBlock(
  lines: TextLine[],
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
      return { anchorIndex, endIndex, optionIndices, labels, letters };
    }
  }
  return null;
}

function columnBounds(lines: TextLine[], from: number, to: number): { minX: number; maxX: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = from; i < to; i++) {
    minX = Math.min(minX, lines[i]!.minX);
    maxX = Math.max(maxX, lines[i]!.maxX);
  }
  return { minX: minX - PAD, maxX: maxX + PAD };
}

function buildLayout(question: AnalyzedQuestion, page: number, lines: TextLine[], parsed: ParsedQuestion): QuestionLayout {
  const { anchorIndex, endIndex, optionIndices, labels } = parsed;
  const rtl = parsed.letters[0] === "א";
  const bounds = columnBounds(lines, anchorIndex, endIndex);
  const anchor = lines[anchorIndex]!;
  const firstOption = lines[optionIndices[0]!]!;
  const lastLine = lines[endIndex - 1]!;

  // Line boundaries sit at top+1: below the previous line's descender tips,
  // above the line's own ascenders.
  const stem: Rect = {
    x: bounds.minX,
    y: anchor.top - PAD,
    w: bounds.maxX - bounds.minX,
    h: firstOption.top + 1 - (anchor.top - PAD),
  };

  const options: OptionLayout[] = optionIndices.map((lineIndex, k) => {
    const line = lines[lineIndex]!;
    const label = labels[k]!;
    const top = line.top + 1;
    const bottom = k < 3 ? lines[optionIndices[k + 1]!]!.top + 1 : lastLine.bottom + GAP;
    const rect: Rect = { x: bounds.minX, y: top, w: bounds.maxX - bounds.minX, h: bottom - top };
    const labelWidth = rtl ? bounds.maxX - label.labelMinX : label.labelMaxX - bounds.minX;
    return { rect, labelWidth, labelExact: label.exact, firstLineHeight: line.bottom - line.top };
  });

  return { number: question.number, page, kind: "mcq", stem, options };
}

function buildOpenLayout(
  question: AnalyzedQuestion,
  page: number,
  lines: TextLine[],
  anchorIndex: number,
  laterNumbers: Set<number>
): QuestionLayout {
  const endIndex = blockEnd(lines, anchorIndex, laterNumbers);
  const bounds = columnBounds(lines, anchorIndex, endIndex);
  const anchor = lines[anchorIndex]!;
  const lastLine = lines[endIndex - 1]!;
  const stem: Rect = {
    x: bounds.minX,
    y: anchor.top - PAD,
    w: bounds.maxX - bounds.minX,
    h: lastLine.bottom + PAD - (anchor.top - PAD),
  };
  return { number: question.number, page, kind: "open", stem, options: [] };
}

export async function locateQuestions(pdf: LoadedPdf, questions: AnalyzedQuestion[]): Promise<QuestionLayout[]> {
  const lineCache = new Map<number, TextLine[]>();
  const linesOf = async (page: number): Promise<TextLine[]> => {
    let lines = lineCache.get(page);
    if (!lines) {
      lines = await pdf.textLines(page);
      lineCache.set(page, lines);
    }
    return lines;
  };

  const allNumbers = questions.map((q) => q.number);
  const layouts: QuestionLayout[] = [];
  const missing: number[] = [];

  for (const [qi, question] of questions.entries()) {
    const laterNumbers = new Set(allNumbers.slice(qi + 1));
    const candidatePages = [
      question.page,
      ...Array.from({ length: pdf.numPages }, (_, i) => i + 1).filter((p) => p !== question.page),
    ].filter((p) => p >= 1 && p <= pdf.numPages);

    let located: QuestionLayout | null = null;
    for (const page of candidatePages) {
      const lines = await linesOf(page);
      for (let i = 0; i < lines.length; i++) {
        if (questionNumberOf(lines[i]!.text) !== question.number) continue;
        if (question.kind === "open") {
          located = buildOpenLayout(question, page, lines, i, laterNumbers);
          break;
        }
        const parsed = parseQuestionBlock(lines, i, laterNumbers);
        if (parsed) {
          located = buildLayout(question, page, lines, parsed);
          break;
        }
      }
      if (located) break;
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
