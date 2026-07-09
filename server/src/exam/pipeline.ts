import { readFile } from "node:fs/promises";
import { analyzeExam } from "../ai/analyze.js";
import { LoadedPdf, type RenderedPage } from "../pdf/pdf.js";
import { renderPdf } from "../pdf/render.js";
import { cropOptionRow, cropSegments } from "./crop.js";
import { locateQuestions } from "./layout.js";
import { fisherYates, lettersFor } from "./shuffle.js";
import { buildHtml } from "./template.js";
import type {
  AnalyzedQuestion,
  PipelineOptions,
  ProgressFn,
  ShuffledExam,
  ShuffledOption,
  ShuffledQuestion,
} from "../shared/types.js";

const noProgress: ProgressFn = () => {};

interface OptionSource {
  content: ShuffledOption["content"];
  isCorrect: boolean;
  note: string;
}

function textOptionSources(question: AnalyzedQuestion): OptionSource[] {
  return [
    { content: { type: "text", html: question.convertedCorrect! }, isCorrect: true, note: question.correctExplanation! },
    ...question.convertedWrong!.map((text, i) => ({
      content: { type: "text", html: text } as const,
      isCorrect: false,
      note: question.wrongRefutations![i]!,
    })),
  ];
}

export async function runPipeline(
  inputPdfPath: string,
  outputPdfPath: string,
  options: PipelineOptions = {},
  onProgress: ProgressFn = noProgress
): Promise<ShuffledExam> {
  const pdfBuffer = await readFile(inputPdfPath);

  onProgress("מנתח את המבחן בעזרת AI...", 10);
  const analyzed = await analyzeExam(pdfBuffer, options);

  const pdf = await LoadedPdf.open(pdfBuffer);
  try {
    onProgress("מאתר שאלות במסמך...", 55);
    const layouts = await locateQuestions(pdf, analyzed.questions);

    onProgress("גוזר ומערבל שאלות...", 65);
    // Rendered pages are ~12MB each at RENDER_SCALE; questions arrive in page
    // order, so keeping more than the current + previous page only burns RAM
    // (small containers get OOM-killed mid-job).
    const MAX_CACHED_PAGES = 2;
    const pageCache = new Map<number, RenderedPage>();
    const renderedPage = async (n: number): Promise<RenderedPage> => {
      let page = pageCache.get(n);
      if (!page) {
        page = await pdf.renderPage(n);
        pageCache.set(n, page);
        for (const key of pageCache.keys()) {
          if (pageCache.size <= MAX_CACHED_PAGES) break;
          pageCache.delete(key);
        }
      }
      return page;
    };

    const rtl = analyzed.language === "he";
    const letters = lettersFor(analyzed.language);
    const questions: ShuffledQuestion[] = [];

    for (const [i, layout] of layouts.entries()) {
      const question = analyzed.questions[i]!;
      const stem = await cropSegments(renderedPage, layout.stem, rtl);

      if (question.kind === "open" && options.openMode === "keep") {
        questions.push({
          number: layout.number,
          kind: "open",
          stemImageDataUri: stem.dataUri,
          stemWidthPx: stem.widthPx,
          options: [],
          answerText: question.answerText,
        });
        continue;
      }

      const sources: OptionSource[] = [];
      if (question.kind === "open") {
        sources.push(...textOptionSources(question));
      } else {
        const notes = [question.correctExplanation!, ...question.wrongRefutations!];
        for (const [k, option] of layout.options.entries()) {
          const crop = await cropOptionRow(renderedPage, option, rtl);
          sources.push({
            content: { type: "image", dataUri: crop.dataUri, widthPx: crop.widthPx },
            isCorrect: k === 0,
            note: notes[k]!,
          });
        }
      }

      const shuffled = fisherYates(sources);
      const correctIndex = shuffled.findIndex((o) => o.isCorrect);
      questions.push({
        number: layout.number,
        kind: question.kind,
        stemImageDataUri: stem.dataUri,
        stemWidthPx: stem.widthPx,
        options: shuffled.map((o, k) => ({ letter: letters[k]!, ...o })),
        correctLetter: letters[correctIndex]!,
      });
    }

    const exam: ShuffledExam = {
      examTitle: analyzed.examTitle,
      institution: analyzed.institution,
      courseName: analyzed.courseName,
      examTerm: analyzed.examTerm,
      language: analyzed.language,
      questions,
    };

    onProgress("בונה את קובץ ה-PDF...", 85);
    const html = await buildHtml(exam);
    await renderPdf(html, outputPdfPath);

    onProgress("הסתיים", 100);
    return exam;
  } finally {
    await pdf.close();
  }
}
