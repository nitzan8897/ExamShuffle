import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OptionContent, ShuffledExam, ShuffledQuestion } from "../shared/types.js";

const CSS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "exam.css");

const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const sanitizeFragment = (s: string): string =>
  s
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "");

const chunk = <T,>(arr: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

interface Labels {
  answerKey: string;
  question: string;
  why: string;
  whyNot: string;
  answer: string;
}

const HE: Labels = {
  answerKey: "מפתח תשובות",
  question: "שאלה",
  why: "הסבר",
  whyNot: "מדוע שאר האפשרויות שגויות",
  answer: "תשובה",
};

const EN: Labels = {
  answerKey: "Answer Key",
  question: "Question",
  why: "Explanation",
  whyNot: "Why the other options are wrong",
  answer: "Answer",
};

const renderContent = (content: OptionContent, className: string): string =>
  content.type === "image"
    ? `<img class="${className}" src="${content.dataUri}" style="width:${content.widthPx}px" alt="">`
    : `<span class="option-text">${sanitizeFragment(content.html)}</span>`;

function renderQuestion(q: ShuffledQuestion): string {
  const options =
    q.options.length === 0
      ? ""
      : `
      <ul class="options">
        ${q.options
          .map(
            (o) => `
        <li>
          <span class="option-letter">${o.letter}</span>
          ${renderContent(o.content, "option-img")}
        </li>`
          )
          .join("")}
      </ul>`;

  return `
    <section class="question">
      <img class="stem" src="${q.stemImageDataUri}" style="width:${q.stemWidthPx}px" alt="">
      ${options}
    </section>`;
}

function renderKeyEntry(q: ShuffledQuestion, t: Labels): string {
  if (q.kind === "open" && q.options.length === 0) {
    return `
    <div class="key-entry">
      <div class="key-answer">${t.question} ${q.number}</div>
      <div class="key-explanation">
        <strong>${t.answer}:</strong> ${sanitizeFragment(q.answerText ?? "")}
      </div>
    </div>`;
  }

  const correct = q.options.find((o) => o.isCorrect)!;
  const wrong = q.options.filter((o) => !o.isCorrect);
  return `
    <div class="key-entry">
      <div class="key-answer">
        <span class="key-answer-label">${t.question} ${q.number}:
          <span class="correct-letter">${q.correctLetter}</span></span>
        <span class="key-option">${renderContent(correct.content, "key-option-img")}</span>
      </div>
      <div class="key-explanation">
        <strong>${t.why}:</strong> ${sanitizeFragment(correct.note)}
      </div>
      <div class="key-refutations">
        <strong>${t.whyNot}:</strong>
        <ul>
          ${wrong
            .map((o) => `<li><span class="ref-letter">${o.letter}</span> — ${sanitizeFragment(o.note)}</li>`)
            .join("")}
        </ul>
      </div>
    </div>`;
}

export async function buildHtml(exam: ShuffledExam): Promise<string> {
  const rtl = exam.language === "he";
  const t = rtl ? HE : EN;
  const css = await readFile(CSS_PATH, "utf8");

  const titleLine =
    [exam.institution, exam.courseName].filter((s) => s?.trim()).join(" - ") || exam.examTitle;
  const subtitle = exam.examTerm?.trim()
    ? `<div class="subtitle">${escapeHtml(exam.examTerm)}</div>`
    : "";

  const pages = chunk(exam.questions, 2)
    .map((pair) => `<div class="question-pair">${pair.map(renderQuestion).join("")}</div>`)
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
<title>${escapeHtml(titleLine)}</title>
<style>${css}</style>
</head>
<body>
  <header class="exam-header">
    <h1>${escapeHtml(titleLine)}</h1>
    ${subtitle}
  </header>
  ${pages}
  ${key}
</body>
</html>`;
}
