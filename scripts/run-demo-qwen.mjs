import { readFileSync } from 'node:fs';
import { probeTts } from '../integrations/home-runner/tts.mjs';
import { buildFromConfig, runOnce } from '../integrations/home-runner/runner.mjs';

const { bearer } = JSON.parse(readFileSync('.wrangler/demo-runner.json', 'utf8'));
const { hub, qwen } = buildFromConfig({
  HUB_BASE_URL: 'http://localhost:5174',
  HUB_BEARER: bearer.replace(/^Bearer /, ''),
  QWEN_BASE_URL: 'http://127.0.0.1:1234/v1',
  RUNNER_DAILY: '0',
});
const ttsVoices = await probeTts(process.env.RUNNER_TTS_VOICES ??
  'de-DE:f=Anna (German (Germany)),m=Reed (German (Germany));zh-CN:f=Tingting,m=Eddy (Chinese (China mainland))');
const watch = process.argv.includes('--watch');
do {
  const outcome = await runOnce(hub, qwen, { ttsVoices });
  if (!watch || !outcome.idle) console.log(outcome);
  if (watch) await new Promise(resolve => setTimeout(resolve, 15000));
} while (watch);
