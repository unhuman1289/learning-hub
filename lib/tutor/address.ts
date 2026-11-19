export const tutorSelfOptions = ['con', 'em', 'cháu'] as const;
export type TutorSelf = typeof tutorSelfOptions[number];
export type TutorAddress = { self: TutorSelf; call: string };

export function tutorAddress(
  settings: { tutor_self?: TutorSelf | null; tutor_call?: string | null } | null,
  displayName: string,
): TutorAddress {
  return { self: settings?.tutor_self ?? 'con', call: settings?.tutor_call?.trim() || displayName.trim() };
}

export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);

export function tutorGreeting({ self, call }: TutorAddress, period = '', ending = '!') {
  return `${capitalize(self)} chào${call ? ` ${call}` : ''}${period ? ` ${period}` : ''} ạ${ending}`;
}

const registers: Record<TutorSelf, string> = {
  cháu: 'Lễ phép, điềm đạm. Hạn chế “nè”, “á” và “nha”, kể cả trong các ví dụ bên dưới.',
  em: 'Thân mật, vui vẻ và lễ phép. Dùng “nè”, “á” và “nha” vừa phải.',
  con: 'Ấm áp, lễ phép như em bé nói chuyện với bố. Dùng “nè”, “á” và “nha” vừa phải.',
};

export function tutorInstructions(prompt: string, self: TutorSelf) {
  return prompt.replaceAll('{xung}', self).replaceAll('{Xung}', capitalize(self)).replaceAll('{giong}', registers[self]);
}
