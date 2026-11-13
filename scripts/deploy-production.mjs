import { checkRelease } from './release.mjs';

try {
  if (process.env.LEARNING_HUB_RELEASE !== '1') {
    throw Error('Production deploy requires a verified release checkout. Start with node scripts/release.mjs check.');
  }
  checkRelease();
  process.argv.splice(1, Infinity, 'vinext-cloudflare', 'deploy', '--env', 'production');
  await import('../node_modules/@vinext/cloudflare/dist/cli.js');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
