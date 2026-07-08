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

Drag a PDF in, watch the progress bar, and the shuffled exam downloads automatically.

For development (Vite hot reload on :5173, API on :3000):

```bash
npm run dev
```

## CLI

```bash
npm run cli -- path/to/exam.pdf                 # -> server/output/exam.shuffled.pdf
npm run cli -- path/to/exam.pdf -o my-exam.pdf
```

## Try it

```bash
npm run sample                        # writes samples/sample-exam.pdf
npm run cli -- ../samples/sample-exam.pdf
```

## Project structure

```text
server/src/analyze.ts    Gemini call: question list + explanations (JSON schema)
server/src/pdf.ts        pdf.js wrapper: page rendering + text-layer lines
server/src/layout.ts     deterministic question/option region detection
server/src/crop.ts       pixel cropping, label erase, whitespace trim
server/src/shuffle.ts    crypto Fisher-Yates + option letters
server/src/template.ts   RTL HTML composition (2 questions/page, answer key)
server/src/render.ts     Puppeteer HTML -> PDF
server/src/pipeline.ts   orchestration with progress reporting
server/src/server.ts     Express API: upload, job progress, download
server/src/cli.ts        command-line entry
web/src/                 React UI (Hebrew, RTL): drop zone, progress, auto-download
```
