import { readFile } from "node:fs/promises";
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Structured output schema enforced on the LLM response.
 * The raw exam always has option A as the correct answer, so the model
 * returns the correct option separately from the three wrong ones —
 * shuffling happens locally (see shuffle.js), never in the model.
 */
const EXAM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    examTitle: {
      type: Type.STRING,
      description: "The exam title as it appears in the document (keep original language).",
    },
    language: {
      type: Type.STRING,
      description: "Primary language of the exam as ISO 639-1 code, e.g. 'he' or 'en'.",
    },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          number: {
            type: Type.INTEGER,
            description: "Question number as it appears in the exam.",
          },
          question: {
            type: Type.STRING,
            description:
              "Full question content, verbatim, without the options. HTML fragment: plain text " +
              "as-is, tables as <table> markup, math as Unicode/<sup>/<sub>/MathML. Never reworded.",
          },
          correctOption: {
            type: Type.STRING,
            description:
              "Verbatim content of option A (the correct answer), without the letter prefix. " +
              "Same HTML-fragment rules as the question.",
          },
          correctExplanation: {
            type: Type.STRING,
            description:
              "Brief, logical explanation of WHY this option is correct. Same language as " +
              "the exam. Plain text; math may use <sup>/<sub>/MathML.",
          },
          wrongOptions: {
            type: Type.ARRAY,
            description: "Exactly the 3 incorrect options (original B, C, D), each with a refutation.",
            items: {
              type: Type.OBJECT,
              properties: {
                text: {
                  type: Type.STRING,
                  description:
                    "Verbatim option content without the letter prefix. " +
                    "Same HTML-fragment rules as the question.",
                },
                refutation: {
                  type: Type.STRING,
                  description:
                    "Brief explanation of WHY this option is incorrect. Same language as " +
                    "the exam. Plain text; math may use <sup>/<sub>/MathML.",
                },
              },
              required: ["text", "refutation"],
            },
          },
        },
        required: ["number", "question", "correctOption", "correctExplanation", "wrongOptions"],
      },
    },
  },
  required: ["examTitle", "language", "questions"],
};

const PROMPT = `You are given a PDF of an academic multiple-choice exam.
In this raw exam, option A is ALWAYS the correct answer for every question.

Extract every question with:
1. The verbatim question text.
2. The verbatim text of option A as "correctOption".
3. The verbatim texts of the other 3 options as "wrongOptions".
4. A brief, logical explanation of why the correct option is right ("correctExplanation").
5. For each wrong option, a brief refutation of why it is incorrect ("refutation").

Rules:
- Do NOT reorder, rewrite or translate the questions or options; keep them verbatim.
- Explanations and refutations must be in the same language as the exam.
- Include every question in the document, in original order.

CONTENT FIDELITY (critical — applies to "question", "correctOption" and every wrong option "text"):
- Copy the content character-for-character. NEVER paraphrase, summarize, fix typos,
  translate, normalize spacing, or reformat numbers/units.
- These fields are minimal HTML fragments:
  - Plain text stays plain text, no wrapper tags.
  - Tables MUST be reproduced as real <table><tr><td>/<th> markup, preserving every row,
    column, header and cell value exactly as printed. Never flatten a table into a sentence.
  - Math formulas MUST keep their exact form: use the original Unicode characters where
    they suffice, <sup>/<sub> for exponents and indices, and MathML (<math>...</math>) for
    structures like fractions, roots, integrals and matrices. Never convert a formula into
    a plain-language description.
  - RTL exams often embed LTR math inside Hebrew text, and PDF rendering can visually
    mirror it. Always transcribe formulas in their logical mathematical reading order
    (e.g. "x<sup>2</sup> − 9 = 0", never "0 = 9 − x<sup>2</sup>").
  - Wrap every inline formula, equation or expression that appears inside RTL text in
    <span dir="ltr">...</span> so it renders in the correct direction
    (e.g. <span dir="ltr">(−3)<sup>2</sup> = 9</span>). This applies to explanations
    and refutations too.
  - Line breaks inside a question become <br>.
  - No style/class attributes, no scripts, nothing that is not in the source document.
- Latin letters, chemical symbols, variable names and units must remain in Latin script
  exactly as printed — NEVER substitute visually similar Hebrew letters. When a standalone
  character functions as a scientific symbol, variable or unit, it is Latin: the chemical
  symbol for oxygen is "O", never "ס"; a variable is "x", never "א".
- Never add commentary about the transcription, typos or formatting of the source —
  explanations discuss only the subject matter.
- Explanations and refutations are plain text, except math which follows the same
  <sup>/<sub>/MathML rules. No tables or other markup there.`;

/**
 * Send the exam PDF to Gemini and get back structured exam data.
 * @param {string} pdfPath absolute or relative path to the input PDF
 * @returns {Promise<{examTitle: string, language: string, questions: Array}>}
 */
export async function extractExam(pdfPath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Copy .env.example to .env and set your key.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });
  const pdfBase64 = (await readFile(pdfPath)).toString("base64");

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
          { text: PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXAM_SCHEMA,
      temperature: 0,
      maxOutputTokens: 65536,
    },
  });

  const exam = JSON.parse(response.text);
  validateExam(exam);
  return exam;
}

function validateExam(exam) {
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    throw new Error("AI extraction returned no questions.");
  }
  for (const q of exam.questions) {
    if (!q.correctOption || !Array.isArray(q.wrongOptions) || q.wrongOptions.length !== 3) {
      throw new Error(
        `Question ${q.number}: expected 1 correct option and exactly 3 wrong options, ` +
          `got ${q.wrongOptions?.length ?? 0} wrong options.`
      );
    }
  }
}
