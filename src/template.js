import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CSS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "exam.css"
);

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * Question/option fields arrive as minimal HTML fragments (tables, <sup>/<sub>,
 * MathML) so the original form is preserved verbatim. Rendered as-is after
 * stripping anything executable.
 */
const sanitizeFragment = (s) =>
  String(s ?? "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "");

/** Split an array into chunks of n (used to force 2 questions per page). */
const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const HE = {
  answerKey: "מפתח תשובות",
  question: "שאלה",
  correctAnswer: "התשובה הנכונה",
  why: "הסבר",
  whyNot: "מדוע שאר האפשרויות שגויות",
  subtitle: "גרסה מעורבלת",
};

const EN = {
  answerKey: "Answer Key",
  question: "Question",
  correctAnswer: "Correct answer",
  why: "Explanation",
  whyNot: "Why the other options are wrong",
  subtitle: "Shuffled version",
};

function renderQuestion(q, t) {
  return `
    <section class="question">
      <div class="question-title">
        <span class="question-number">${q.number}</span>
        <span class="question-text">${sanitizeFragment(q.question)}</span>
      </div>
      <ul class="options">
        ${q.options
          .map(
            (o) => `
        <li>
          <span class="option-letter">${o.letter}</span>
          <span class="option-text">${sanitizeFragment(o.text)}</span>
        </li>`
          )
          .join("")}
      </ul>
    </section>`;
}

function renderKeyEntry(q, t) {
  const correct = q.options[q.correctIndex];
  const wrong = q.options.filter((o) => !o.isCorrect);
  return `
    <div class="key-entry">
      <div class="key-answer">
        ${t.question} ${q.number}:
        <span class="correct-letter">${q.correctLetter}</span>
        — <span class="key-answer-text">${sanitizeFragment(correct.text)}</span>
      </div>
      <div class="key-explanation">
        <strong>${t.why}:</strong> ${sanitizeFragment(correct.note)}
      </div>
      <div class="key-refutations">
        <strong>${t.whyNot}:</strong>
        <ul>
          ${wrong
            .map(
              (o) => `
          <li><span class="ref-letter">${o.letter}</span> — ${sanitizeFragment(o.note)}</li>`
            )
            .join("")}
        </ul>
      </div>
    </div>`;
}

/**
 * Build the full printable HTML document for the shuffled exam:
 * RTL layout (for Hebrew), 2 questions per page, answer key on a new page.
 * @param {ReturnType<import("./shuffle.js").shuffleExam>} exam
 * @returns {Promise<string>} full HTML document
 */
export async function buildHtml(exam) {
  const rtl = exam.language === "he";
  const t = rtl ? HE : EN;
  const css = await readFile(CSS_PATH, "utf8");

  const pages = chunk(exam.questions, 2)
    .map((pair) => `<div class="question-pair">${pair.map((q) => renderQuestion(q, t)).join("")}</div>`)
    .join("");

  const key = `
    <section class="answer-key">
      <h2>${t.answerKey}</h2>
      ${exam.questions.map((q) => renderKeyEntry(q, t)).join("")}
    </section>`;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(exam.language || "he")}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(exam.examTitle)}</title>
<style>${css}</style>
</head>
<body>
  <header class="exam-header">
    <h1>${escapeHtml(exam.examTitle)}</h1>
    <div class="subtitle">${t.subtitle}</div>
  </header>
  ${pages}
  ${key}
</body>
</html>`;
}
