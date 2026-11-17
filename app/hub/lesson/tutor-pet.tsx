export type TutorPetState = 'idle' | 'cheer' | 'enter' | 'greet' | 'listen' | 'think' | 'talk' | 'blocked' | 'offline' | 'busy' | 'limit' | 'leave';

/** Static placeholder; T3b will provide the character artwork. */
export function TutorPet({ state }: { state: TutorPetState }) {
  return <span aria-hidden="true" data-pet-state={state} className="inline-grid size-12 shrink-0 place-items-center rounded-full border-2 border-[#765342] bg-[#f8e4bf] text-2xl text-[#493026]">☺</span>;
}
