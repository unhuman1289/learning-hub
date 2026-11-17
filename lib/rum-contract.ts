export const rumScreens = ["desk", "first_question", "grade", "audio_play", "tutor_first_token", "inp", "submit_feedback", "lesson_ready"] as const;
export type RumScreen = typeof rumScreens[number];

export const rumConnections = ["slow-2g", "2g", "3g", "4g", "unknown"] as const;
export const rumDevices = ["phone", "computer"] as const;
export const rumMaxSamples = 16;
export const rumMaxMs = 120_000;

export type RumSample = {
  screen: RumScreen;
  ms: number;
  connection: typeof rumConnections[number];
  device: typeof rumDevices[number];
};
