export interface AnalyzedQuestion {
  number: number;
  page: number;
  correctExplanation: string;
  wrongRefutations: string[];
}

export interface AnalyzedExam {
  examTitle: string;
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
  stem: Rect;
  options: OptionLayout[];
}

export interface ShuffledOption {
  letter: string;
  imageDataUri: string;
  widthPx: number;
  isCorrect: boolean;
  note: string;
}

export interface ShuffledQuestion {
  number: number;
  stemImageDataUri: string;
  stemWidthPx: number;
  options: ShuffledOption[];
  correctLetter: string;
}

export interface ShuffledExam {
  examTitle: string;
  language: string;
  questions: ShuffledQuestion[];
}

export type ProgressFn = (stage: string, percent: number) => void;
