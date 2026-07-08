export type OpenMode = "convert" | "keep" | "remove";

export interface PipelineOptions {
  apiKey?: string;
  model?: string;
  contextText?: string;
  contextPdf?: Buffer;
  openMode?: OpenMode;
}

export type QuestionKind = "mcq" | "open";

export interface AnalyzedQuestion {
  number: number;
  page: number;
  kind: QuestionKind;
  correctExplanation?: string;
  wrongRefutations?: string[];
  convertedCorrect?: string;
  convertedWrong?: string[];
  answerText?: string;
}

export interface AnalyzedExam {
  examTitle: string;
  institution: string;
  courseName: string;
  examTerm: string;
  language: string;
  questions: AnalyzedQuestion[];
}

/** Rectangle in PDF units, top-left origin. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OptionLayout {
  rect: Rect;
  labelWidth: number;
  labelExact: boolean;
  firstLineHeight: number;
}

export interface QuestionLayout {
  number: number;
  page: number;
  kind: QuestionKind;
  stem: Rect;
  options: OptionLayout[];
}

export type OptionContent =
  | { type: "image"; dataUri: string; widthPx: number }
  | { type: "text"; html: string };

export interface ShuffledOption {
  letter: string;
  content: OptionContent;
  isCorrect: boolean;
  note: string;
}

export interface ShuffledQuestion {
  number: number;
  kind: QuestionKind;
  stemImageDataUri: string;
  stemWidthPx: number;
  options: ShuffledOption[];
  correctLetter?: string;
  answerText?: string;
}

export interface ShuffledExam {
  examTitle: string;
  institution: string;
  courseName: string;
  examTerm: string;
  language: string;
  questions: ShuffledQuestion[];
}

export type ProgressFn = (stage: string, percent: number) => void;
