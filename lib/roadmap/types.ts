export type StepStatus = 'planned' | 'open' | 'practising' | 'passed' | 'placed' | 'retired';
export type StepKind = 'new' | 'review' | 'mixed';
export type StepRole = 'intro' | 'practice' | 'challenge' | 'placement';
export type RoadmapStep = {
  id: string; learnerId: string; subjectId: string; ord: number; title: string; objective: string;
  situation: string; skills: string[]; requires: string[]; band: number; levelLabel: string | null;
  mode: StepKind; status: StepStatus; passedVia: 'mastery' | 'challenge' | 'placement' | 'learner' | null;
  passedAt: string | null; revision: number; listening: number;
};
