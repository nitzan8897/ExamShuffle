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

The `.env` is optional — if it is missing, provide the Gemini API key and model in the
UI's advanced settings instead. If neither the server nor the UI supplies them, the app
shows a toast asking you to fill in the Gemini details.

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

A job keeps running on the server even if you close or refresh the tab — reopening the
page restores the in-progress jobs and their download links.

## Deploy (Railway)

The repo ships a `Dockerfile` and `railway.json`. Railway builds the image (which
installs Chromium + Hebrew/Latin fonts for Puppeteer), builds the web bundle, and runs
`npm start`, which serves both the API and the built UI on `$PORT`.

1. Create a Railway project from this GitHub repo (it auto-detects the Dockerfile).
2. Optionally set `GEMINI_API_KEY` and `GEMINI_MODEL` as service variables — otherwise
   users enter them in the UI.
3. Optionally set `MONGODB_URI` (and `MONGODB_DB`) to persist jobs and output PDFs — see
   below.
4. Deploy. The public URL serves the full app.

### Job persistence

Jobs run one at a time in memory. Without `MONGODB_URI`, job records fall back to a local
`output/jobs.json` file and output PDFs live on the container's disk — both are lost when
Railway restarts or redeploys the container (e.g. after an out-of-memory kill), so an
in-flight upload comes back as "the task was lost".

Set `MONGODB_URI` to a MongoDB connection string (any provider — MongoDB Atlas has a free
tier) to store job records and the generated PDFs (in GridFS) durably: a restart then
reports interrupted jobs as a clear error instead of a dead poll, and already-finished
downloads keep working. If the URI is missing or unreachable the server logs a warning and
falls back to the local file store, so a bad value never blocks startup.

Still run a single instance — the in-memory queue is per-process (do not scale to multiple
replicas). If uploads keep failing mid-job, the container is hitting its memory limit;
raise the service's memory in Railway.

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
