import { z } from 'zod';

export const TUTOR_QUESTION_LIMIT = 500;
export const TUTOR_ANSWER_LIMIT = 2000;
export const TUTOR_TURN_LIMIT = 20;
export const TUTOR_OPEN_TURN_LIMIT = 1;

export const tutorQuestion = z.object({
  lessonId: z.string().regex(/^les_[0-9a-f]{20}$/),
  itemId: z.string().regex(/^i[0-9]{1,2}$/),
  question: z.string().trim().min(1).refine(text => !text.includes('\0') && [...text].length <= TUTOR_QUESTION_LIMIT),
}).strict();

export const tutorAnswer = z.string().trim().min(1).refine(text => !text.includes('\0') && [...text].length <= TUTOR_ANSWER_LIMIT);

export type TutorQuestion = z.infer<typeof tutorQuestion>;
export type TutorTurn = {
  id: string;
  lesson_id: string;
  item_id: string;
  question: string;
  answer: string | null;
  status: 'queued' | 'streaming' | 'answered' | 'failed' | 'blocked';
  leak_blocked: number;
  first_token_ms: number | null;
  created_at: string;
  answered_at: string | null;
};
