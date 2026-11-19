'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import './tutor-pet.css';

export type TutorPetState = 'idle' | 'cheer' | 'enter' | 'greet' | 'listen' | 'think' | 'talk' | 'blocked' | 'offline' | 'busy' | 'limit' | 'leave' | 'point' | 'nod';
const rows: Record<TutorPetState, [string, number]> = {
  idle:['sit',6], cheer:['jump',5], enter:['run_left',8], greet:['wave',4], listen:['tilt',6], think:['think',6], talk:['talk',8], blocked:['cover_mouth',6], offline:['umbrella',6], busy:['rest',8], limit:['sleep',6], leave:['run_right',8], point:['point_up',6], nod:['nod',6],
};

/** Bột wears the outfit of the current Berlin month (m01–m12); every monthly strip has 4 frames. */
export function monthlySet(now = new Date()) {
  return 'm' + new Intl.DateTimeFormat('en', {timeZone:'Europe/Berlin', month:'2-digit'}).format(now);
}

function PetImage({state, size}: {state:TutorPetState; size:"panel" | "corner" | "child"}) {
  // A month whose outfit is not uploaded yet falls back to the default v2 outfit.
  const [set,setSet] = useState(monthlySet);
  const monthly = set !== 'v2';
  const [failed,setFailed] = useState(false), [covered,setCovered] = useState(false), [alternate,setAlternate] = useState(false);
  useEffect(() => {
    if (state === 'blocked') { const timer = setTimeout(() => setCovered(true), 720); return () => clearTimeout(timer); }
    if (state === 'talk') { const timer = setInterval(() => setAlternate(value => !value), 4000); return () => clearInterval(timer); }
    if (state !== 'idle') return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { clearTimeout(timer); setAlternate(false); timer = setTimeout(() => setAlternate(true), 20_000); };
    schedule();
    if (state === 'idle') { window.addEventListener('pointerdown', schedule); window.addEventListener('keydown', schedule); }
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', schedule); window.removeEventListener('keydown', schedule); };
  }, [state]);
  const [name, frames] = state === 'idle' && alternate ? ['idle',6] : state === 'talk' && alternate ? ['explain',6] : state === 'blocked' && covered ? rows.talk : rows[state];
  const count = monthly ? 4 : frames;
  const style = {'--frames':count, '--duration':`${count * (monthly ? 180 : 120)}ms`} as CSSProperties;
  return <span aria-hidden="true" data-pet-state={state} data-pet-row={name} className={`tutor-pet tutor-pet-${size}`}>
    <span className="tutor-pet-fallback" hidden={!failed}>☺</span>
    {!failed && <span className="tutor-pet-window"><img key={name} alt="" src={`/api/tutor/sprite/${set}/${name}.webp`} data-pet-set={set} style={style}
      className={`tutor-pet-strip ${state === 'offline' && !monthly ? 'tutor-pet-offline' : ''} ${state === 'cheer' || state === 'nod' || state === 'greet' || state === 'point' || (state === 'blocked' && !covered) ? 'tutor-pet-once' : ''}`}
      onError={()=>monthly ? setSet('v2') : setFailed(true)} onAnimationEnd={()=>{if(state === 'blocked' && !covered) setCovered(true);}} /></span>}
  </span>;
}
export function TutorPet({state, size}: {state:TutorPetState; size:"panel" | "corner" | "child"}) { return <PetImage key={state} state={state} size={size}/>; }
