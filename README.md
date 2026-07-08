# ExamShuffle

Automated local pipeline for academic multiple-choice exams:
takes a raw exam PDF where **option A is always the correct answer**, and produces a
clean, shuffled, Notability-ready PDF with a full answer key.

## How it works

1. **Extract** — the input PDF is sent to Google Gemini with an enforced JSON schema.
   The model returns every question verbatim: the correct option (original A), the 3 wrong
   options, an explanation of why the correct answer is right, and a refutation for each
   wrong option.
   Question and option content is never rewritten: it comes back as minimal HTML fragments
   that preserve the original form — tables as real `<table>` markup, math with
   `<sup>`/`<sub>`/MathML in logical reading order, Latin symbols kept in Latin script,
   and inline formulas wrapped in `<span dir="ltr">` so they render correctly inside RTL text.
2. **Shuffle** — the 4 options are shuffled **locally** with a crypto-random Fisher-Yates.
   Because the shuffle never happens inside the LLM, the answer-key letter is guaranteed
   to point at the true answer.
3. **Render** — the shuffled exam is rendered to HTML (RTL for Hebrew) and exported to
   PDF via headless Chromium (Puppeteer).

## Output format

- Right-to-left layout with Hebrew option letters (א/ב/ג/ד); falls back to LTR + A/B/C/D
  for non-Hebrew exams.
- Exactly **2 questions per page**, enforced with CSS page breaks.
- **Answer key** starts on a completely new page at the end. Each entry contains, in order:
  1. The new shuffled correct letter (e.g. "שאלה 1: ג").
  2. Why that option is correct.
  3. Why each of the other 3 options is wrong.

## Setup

```bash
npm install
cp .env.example .env   # then put your Gemini API key in .env
```

`.env`:

```ini
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.5-flash   # optional
```

## Usage

```bash
npm start -- path/to/exam.pdf                 # -> output/exam.shuffled.pdf
npm start -- path/to/exam.pdf -o my-exam.pdf  # explicit output path
```

The pipeline also writes `output/<name>.data.json` — the shuffled exam data
(questions, letters, correct indices, explanations) for debugging or reuse.

## Try it

```bash
node scripts/make-sample.js                   # writes samples/sample-exam.pdf
npm start -- samples/sample-exam.pdf
```

## Project structure

```text
src/index.js      CLI orchestration (extract -> shuffle -> html -> pdf)
src/extract.js    Gemini call, structured JSON schema, validation
src/shuffle.js    local Fisher-Yates shuffle + answer-key mapping
src/template.js   HTML builder (RTL, 2 questions/page, answer key)
src/render.js     Puppeteer HTML -> PDF export
templates/exam.css  print stylesheet (page breaks, RTL, answer key)
scripts/make-sample.js  generates a sample Hebrew exam for testing
```
