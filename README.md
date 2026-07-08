# ExamShuffle

Local pipeline + web UI for academic multiple-choice exams:
upload a raw exam PDF where **option A is always the correct answer**, get back a
clean, shuffled, Notability-ready PDF with a full answer key.

## How it works

1. **Analyze (AI)** — the PDF goes to Google Gemini once, with an enforced JSON schema.
   The model only lists the questions (number + page) and writes the explanations and
   refutations. It never touches the question content.
2. **Locate (deterministic)** — the PDF text layer (pdf.js) provides exact glyph
   coordinates. Question numbers and option letters (`א.`/`ב.`/`A.`/`B.`) anchor each
   question; stem and option regions are computed geometrically. Cover pages,
   instructions and draft pages are skipped automatically.
3. **Copy (pixels)** — each question stem and option row is cropped from a high-resolution
   render of the original page. Fonts, sizes, tables, math formulas and images are
   preserved exactly because the original pixels are copied, never re-typeset.
   The printed option letter is erased via pixel scanning and replaced with the new
   shuffled letter.
4. **Shuffle** — options are shuffled locally (crypto Fisher-Yates), so the answer-key
   letter is always truthful.
5. **Render** — the shuffled exam is composed as RTL HTML and exported to PDF via
   headless Chromium: 2 questions per page, answer key starting on a new page with the
   correct letter, the correct option image, an explanation, and refutations.

## Requirements

- Node.js 20+
- A Gemini API key in `.env` (see `.env.example`)
- Input PDFs must contain selectable text (scanned image-only PDFs are not supported)

## Setup

```bash
npm install
cp .env.example .env   # then put your Gemini API key in .env
```

## Web UI

```bash
npm run build   # build the React app once
npm start       # serves UI + API at http://localhost:3000
```

Drag one or more exam PDFs in — each file gets its own progress bar and downloads
automatically when ready.

Advanced settings (optional, collapsible panel):

- **Gemini model / API key** — override the server's `.env` per run.
- **Reference material** — a public URL or an uploaded PDF/TXT/MD file (e.g. a summary
  exported from NotebookLM) used to ground the explanations. NotebookLM links themselves
  are login-walled and can't be fetched by the server — export the notebook's summary
  and upload it as a file instead.
- **Non-multiple-choice questions** — when the exam contains open questions, choose:
  convert them to multiple-choice (AI-generated options), keep them as-is (with a model
  answer in the key), or remove them from the output.

The output header shows the institution and course name on the first line and the exam
term (מועד) below it, both extracted from the exam itself.

For development (Vite hot reload on :5173, API on :3000):

```bash
npm run dev
```

## CLI

```bash
npm run cli -- path/to/exam.pdf                              # -> output/exam.shuffled.pdf
npm run cli -- path/to/exam.pdf -o my-exam.pdf
npm run cli -- path/to/exam.pdf --open-mode convert          # convert|keep|remove
```

## Try it

```bash
npm run sample                        # writes samples/sample-exam.pdf
npm run cli -- samples/sample-exam.pdf
```

## Project structure

```text
server/src/ai/analyze.ts      Gemini call: metadata, question list, explanations
server/src/pdf/pdf.ts         pdf.js wrapper: page rendering + text-layer lines
server/src/pdf/polyfill.ts    Node 20 shims for pdfjs-dist
server/src/pdf/render.ts      Puppeteer HTML -> PDF
server/src/exam/layout.ts     deterministic question/option region detection
server/src/exam/crop.ts       pixel cropping, label erase, whitespace trim
server/src/exam/shuffle.ts    crypto Fisher-Yates + option letters
server/src/exam/template.ts   RTL HTML composition (2 questions/page, answer key)
server/src/exam/pipeline.ts   orchestration with progress reporting
server/src/api/server.ts      Express API: batch upload, job queue, download
server/src/api/jobs.ts        in-memory job store
server/src/shared/            types + env loading
server/src/cli.ts             command-line entry
web/src/                      React UI: multi-upload, settings, per-file progress
```
