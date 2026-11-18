import { audioVariant } from '../audio/hash.mjs';

export async function uploadPlanAudio(hub, lease, context, result, render, uploaded = new Set()) {
  const packages = result.subjects.flatMap(subject => [subject.primaryLesson, subject.reviewSet])
    .concat(result.explorations.map(exploration => exploration.lesson)).filter(Boolean);
  for (const lesson of packages) {
    for (const { audio } of lesson.items) {
      const pair = audio && context.tts?.voices[audio.lang];
      if (!pair) continue;
      for (const variant of ['f', 'm']) {
        const { hash, voices } = await audioVariant(audio, pair, variant);
        if (uploaded.has(hash)) continue;
        const bytes = await render(audio, voices);
        const spec = Buffer.from(JSON.stringify({ audio, variant }), 'utf8').toString('base64');
        await hub.putBinary(lease, hash, bytes, spec);
        uploaded.add(hash);
      }
    }
  }
}
