import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ShuffledExam, ShuffledQuestion } from "./types.js";

const CSS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates", "exam.css");

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
  subtitle: string;
}

const HE: Labels = {
  answerKey: "מפתח תשובות",
  question: "שאלה",
  why: "הסבר",
  whyNot: "מדוע שאר האפשרויות שגויות",
  subtitle: "גרסה מעורבלת",
};

const EN: Labels = {
  answerKey: "Answer Key",
  question: "Question",
  why: "Explanation",
  whyNot: "Why the other options are wrong",
  subtitle: "Shuffled version",
};

function renderQuestion(q: ShuffledQuestion): string {
  return `
    <section class="question">
      <img class="stem" src="${q.stemImageDataUri}" style="width:${q.stemWidthPx}px" alt="">
      <ul class="options">
        ${q.options
          .map(
            (o) => `
        <li>
          <span class="option-letter">${o.letter}</span>
          <img class="option-img" src="${o.imageDataUri}" style="width:${o.widthPx}px" alt="">
        </li>`
          )
          .join("")}
      </ul>
    </section>`;
}

function renderKeyEntry(q: ShuffledQuestion, t: Labels): string {
  const correct = q.options.find((o) => o.isCorrect)!;
  const wrong = q.options.filter((o) => !o.isCorrect);
  return `
    <div class="key-entry">
      <div class="key-answer">
        <span class="key-answer-label">${t.question} ${q.number}:
          <span class="correct-letter">${q.correctLetter}</span></span>
        <span class="key-option">
          <img class="key-option-img" src="${correct.imageDataUri}" style="width:${correct.widthPx}px" alt="">
        </span>
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
