/** The relay receives the visible exercise and a nickname. No profile ID or answer key. */
export type TutorRelayInput = { nickname: string; prompt: string; question: string };
export type TutorRelay = (input: TutorRelayInput) => Promise<string>;

export const fakeTutorRelay: TutorRelay = async () =>
  'Quay lại câu đang làm nhé. Gạch dưới từ khóa trong đề rồi thử tự giải thích câu hỏi bằng lời của em.';
