import { GoogleGenAI, Type } from "@google/genai";
import { geminiApiKey, geminiModel } from "./env.js";
import type { AnalyzedExam } from "./types.js";

const EXAM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    examTitle: {
      type: Type.STRING,
      description: "Exam title as printed, original language.",
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
          correctExplanation: {
            type: Type.STRING,
            description:
              "Brief, logical explanation of WHY the first printed option is correct. " +
              "Exam language. Plain text; wrap inline math in <span dir=\"ltr\"> with <sup>/<sub>.",
          },
          wrongRefutations: {
            type: Type.ARRAY,
            description:
              "Exactly 3 brief refutations of the 2nd, 3rd and 4th printed options, in " +
              "printed order. Same language and formatting rules as correctExplanation.",
            items: { type: Type.STRING },
          },
        },
        required: ["number", "page", "correctExplanation", "wrongRefutations"],
      },
    },
  },
  required: ["examTitle", "language", "questions"],
};

const PROMPT = `You are given a PDF of an academic multiple-choice exam.
The FIRST printed option of every question is ALWAYS the correct answer.

List every real question in the document, in original order, with:
- "number": the question number exactly as printed.
- "page": the 1-based PDF page it appears on.
- "correctExplanation": a brief, logical explanation of why the first printed option is correct.
- "wrongRefutations": brief refutations of the 2nd, 3rd and 4th printed options, in printed order.

Explanations are in the exam's language, plain text, with inline math wrapped in
<span dir="ltr">...</span> using <sup>/<sub> where needed. Discuss subject matter only —
never the document's formatting or typography.

Ignore pages with no questions: cover pages, instructions, formula sheets, draft/scratch
pages, blank pages.`;

export async function analyzeExam(pdfBuffer: Buffer): Promise<AnalyzedExam> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey() });

  const response = await ai.models.generateContent({
    model: geminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
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

  const exam = JSON.parse(response.text ?? "") as AnalyzedExam;
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    throw new Error("AI analysis found no questions in the PDF.");
  }
  for (const q of exam.questions) {
    if (!Array.isArray(q.wrongRefutations) || q.wrongRefutations.length !== 3) {
      throw new Error(`Question ${q.number}: expected exactly 3 refutations.`);
    }
  }
  return exam;
}
