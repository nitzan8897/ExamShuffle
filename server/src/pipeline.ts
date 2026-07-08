import { readFile } from "node:fs/promises";
import { analyzeExam } from "./analyze.js";
import { cropOptionRow, cropRegion } from "./crop.js";
import { locateQuestions } from "./layout.js";
import { LoadedPdf, type RenderedPage } from "./pdf.js";
import { renderPdf } from "./render.js";
import { fisherYates, lettersFor } from "./shuffle.js";
import { buildHtml } from "./template.js";
import type { ProgressFn, ShuffledExam, ShuffledQuestion } from "./types.js";

const noProgress: ProgressFn = () => {};

export async function runPipeline(
  inputPdfPath: string,
  outputPdfPath: string,
  onProgress: ProgressFn = noProgress
): Promise<ShuffledExam> {
  const pdfBuffer = await readFile(inputPdfPath);

  onProgress("מנתח את המבחן בעזרת AI...", 10);
  const analyzed = await analyzeExam(pdfBuffer);

  const pdf = await LoadedPdf.open(pdfBuffer);
  try {
    onProgress("מאתר שאלות במסמך...", 55);
    const layouts = await locateQuestions(pdf, analyzed.questions);

    onProgress("גוזר ומערבל שאלות...", 65);
    const pageCache = new Map<number, RenderedPage>();
    const renderedPage = async (n: number): Promise<RenderedPage> => {
      let page = pageCache.get(n);
      if (!page) {
        page = await pdf.renderPage(n);
        pageCache.set(n, page);
      }
      return page;
    };

    const rtl = analyzed.language === "he";
    const letters = lettersFor(analyzed.language);
    const questions: ShuffledQuestion[] = [];

    for (const [i, layout] of layouts.entries()) {
      const question = analyzed.questions[i]!;
      const page = await renderedPage(layout.page);

      const stem = cropRegion(page, layout.stem);
      const notes = [question.correctExplanation, ...question.wrongRefutations];
      const shuffled = fisherYates(
        layout.options.map((option, k) => ({
          crop: cropOptionRow(page, option, rtl),
          isCorrect: k === 0,
          note: notes[k]!,
        }))
      );

      const correctIndex = shuffled.findIndex((o) => o.isCorrect);
      questions.push({
        number: layout.number,
        stemImageDataUri: stem.dataUri,
        stemWidthPx: stem.widthPx,
        options: shuffled.map((o, k) => ({
          letter: letters[k]!,
          imageDataUri: o.crop.dataUri,
          widthPx: o.crop.widthPx,
          isCorrect: o.isCorrect,
          note: o.note,
        })),
        correctLetter: letters[correctIndex]!,
      });
    }

    const exam: ShuffledExam = {
      examTitle: analyzed.examTitle,
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
