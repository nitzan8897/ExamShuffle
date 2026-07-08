import { randomInt } from "node:crypto";

const LETTERS_HE = ["א", "ב", "ג", "ד"];
const LETTERS_EN = ["A", "B", "C", "D"];

/** Unbiased in-place Fisher-Yates shuffle using crypto randomness. */
function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Take the extracted exam (option A always correct) and produce the shuffled
 * exam model used for rendering. Because the shuffle happens here — not in
 * the LLM — the answer key letter is guaranteed to point at the true answer.
 *
 * @param {{examTitle: string, language: string, questions: Array}} exam
 * @returns {{examTitle: string, language: string, letters: string[], questions: Array}}
 */
export function shuffleExam(exam) {
  const letters = exam.language === "he" ? LETTERS_HE : LETTERS_EN;

  const questions = exam.questions.map((q, idx) => {
    const options = fisherYates([
      { text: q.correctOption, isCorrect: true, note: q.correctExplanation },
      ...q.wrongOptions.map((w) => ({ text: w.text, isCorrect: false, note: w.refutation })),
    ]);

    const correctIndex = options.findIndex((o) => o.isCorrect);

    return {
      number: q.number ?? idx + 1,
      question: q.question,
      options: options.map((o, i) => ({ letter: letters[i], ...o })),
      correctIndex,
      correctLetter: letters[correctIndex],
    };
  });

  return { examTitle: exam.examTitle, language: exam.language, letters, questions };
}
