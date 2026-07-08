import { GoogleGenAI, Type, type Part } from "@google/genai";
import { geminiApiKey, geminiModel } from "../shared/env.js";
import type { AnalyzedExam, AnalyzedQuestion, OpenMode, PipelineOptions } from "../shared/types.js";

const EXAM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    examTitle: {
      type: Type.STRING,
      description: "Exam title as printed, original language.",
    },
    institution: {
      type: Type.STRING,
      description: "College/university name as printed on the exam, e.g. 'המכללה למנהל'. Empty string if absent.",
    },
    courseName: {
      type: Type.STRING,
      description: "Course name as printed, e.g. 'מבוא לאבטחת סייבר'. Empty string if absent.",
    },
    examTerm: {
      type: Type.STRING,
      description:
        "The exam term/מועד line as printed, e.g. 'תשפ\"ה סמסטר א' מועד ב''. Empty string if absent.",
    },
    language: {
      type: Type.STRING,
      description: "Primary exam language as ISO 639-1 code, e.g. 'he' or 'en'.",
    },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          number: {
            type: Type.INTEGER,
            description: "Question number exactly as printed.",
          },
          page: {
            type: Type.INTEGER,
            description: "1-based PDF page containing the question.",
          },
          kind: {
            type: Type.STRING,
            enum: ["mcq", "open"],
            description: "'mcq' when the question has exactly 4 lettered options, otherwise 'open'.",
          },
          correctExplanation: {
            type: Type.STRING,
            description:
              "Brief, logical explanation of WHY the correct option is correct. " +
              "Exam language. Plain text; wrap inline math in <span dir=\"ltr\"> with <sup>/<sub>.",
          },
          wrongRefutations: {
            type: Type.ARRAY,
            description:
              "Exactly 3 brief refutations of the wrong options, in their printed/generated order. " +
              "Same language and formatting rules as correctExplanation.",
            items: { type: Type.STRING },
          },
          convertedCorrect: {
            type: Type.STRING,
            description: "Converted open question only: the correct answer phrased as a concise option.",
          },
          convertedWrong: {
            type: Type.ARRAY,
            description: "Converted open question only: exactly 3 plausible but wrong concise options.",
            items: { type: Type.STRING },
          },
          answerText: {
            type: Type.STRING,
            description: "Kept open question only: a correct, complete but concise answer in the exam language.",
          },
        },
        required: ["number", "page", "kind"],
      },
    },
  },
  required: ["examTitle", "institution", "courseName", "examTerm", "language", "questions"],
};

const BASE_PROMPT = `You are given a PDF of an academic exam.
In multiple-choice questions, the FIRST printed option is ALWAYS the correct answer.

Return the exam metadata (title, institution, course name, exam term/מועד, language) and
every real question in original order with:
- "number": the question number exactly as printed.
- "page": the 1-based PDF page it appears on.
- For multiple-choice questions (kind="mcq"):
  - "correctExplanation": why the first printed option is correct.
  - "wrongRefutations": why the 2nd, 3rd and 4th printed options are wrong, in printed order.

Explanations are in the exam's language, plain text, with inline math wrapped in
<span dir="ltr">...</span> using <sup>/<sub> where needed. Discuss subject matter only —
never the document's formatting or typography.

Ignore pages with no questions: cover pages, instructions, formula sheets, draft/scratch
pages, blank pages.`;

const OPEN_MODE_PROMPT: Record<OpenMode, string> = {
  remove: `
The exam may contain non-multiple-choice (open) questions. SKIP them entirely —
return only the multiple-choice questions, all with kind="mcq".`,
  keep: `
The exam may contain non-multiple-choice (open) questions. Include them with kind="open"
and provide "answerText": a correct, complete but concise answer in the exam's language.
Do not provide options or refutations for open questions.`,
  convert: `
The exam may contain non-multiple-choice (open) questions. Include them with kind="open"
and convert each to multiple-choice: provide "convertedCorrect" (the correct answer as a
concise option), "convertedWrong" (exactly 3 plausible but clearly wrong options),
"correctExplanation" and "wrongRefutations" (for the 3 wrong options, in their order).
Options are in the exam's language and match its terminology.`,
};

const MCQ_ONLY_PROMPT = `
Every question in this exam is multiple-choice with exactly 4 options; mark all questions kind="mcq".`;

const CONTEXT_PROMPT = `
Attached is additional source material (course notes/summary). Ground every explanation,
refutation and answer in this material when relevant — prefer its terminology and reasoning.`;

function buildParts(pdfBuffer: Buffer, options: PipelineOptions): Part[] {
  const parts: Part[] = [
    { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
  ];
  if (options.contextPdf) {
    parts.push({ inlineData: { mimeType: "application/pdf", data: options.contextPdf.toString("base64") } });
  }
  if (options.contextText) {
    parts.push({ text: `Source material for grounding explanations:\n${options.contextText.slice(0, 100_000)}` });
  }

  let prompt = BASE_PROMPT;
  prompt += options.openMode ? OPEN_MODE_PROMPT[options.openMode] : MCQ_ONLY_PROMPT;
  if (options.contextPdf || options.contextText) prompt += CONTEXT_PROMPT;
  parts.push({ text: prompt });
  return parts;
}

export async function analyzeExam(pdfBuffer: Buffer, options: PipelineOptions = {}): Promise<AnalyzedExam> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey(options.apiKey) });

  const response = await ai.models.generateContent({
    model: geminiModel(options.model),
    contents: [{ role: "user", parts: buildParts(pdfBuffer, options) }],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXAM_SCHEMA,
      temperature: 0,
      maxOutputTokens: 65536,
    },
  });

  const exam = JSON.parse(response.text ?? "") as AnalyzedExam;
  validate(exam, options.openMode);
  return exam;
}

function validate(exam: AnalyzedExam, openMode?: OpenMode): void {
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    throw new Error("AI analysis found no questions in the PDF.");
  }
  for (const q of exam.questions) {
    if (q.kind === "open" && openMode === "remove") continue;
    if (q.kind === "open" && openMode === "keep") {
      if (!q.answerText) throw new Error(`Question ${q.number}: missing answer for open question.`);
      continue;
    }
    if (q.kind === "open" && openMode === "convert") {
      if (!q.convertedCorrect || q.convertedWrong?.length !== 3) {
        throw new Error(`Question ${q.number}: incomplete converted options.`);
      }
    }
    requireExplanations(q);
  }
  if (openMode === "remove") {
    exam.questions = exam.questions.filter((q) => q.kind === "mcq");
    if (exam.questions.length === 0) {
      throw new Error("No multiple-choice questions left after removing open questions.");
    }
  }
}

function requireExplanations(q: AnalyzedQuestion): void {
  if (!q.correctExplanation || q.wrongRefutations?.length !== 3) {
    throw new Error(`Question ${q.number}: expected an explanation and exactly 3 refutations.`);
  }
}
