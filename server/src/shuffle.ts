import { randomInt } from "node:crypto";

export const lettersFor = (language: string): string[] =>
  language === "he" ? ["א", "ב", "ג", "ד"] : ["A", "B", "C", "D"];

export function fisherYates<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
