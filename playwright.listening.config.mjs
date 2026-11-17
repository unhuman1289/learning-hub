import config from './playwright.u5.config.mjs';

// Give the listening scenarios fresh demo databases, separate from the U5/U6 run.
const listeningConfig = {
  ...config,
  testMatch: 'listening.spec.mjs',
  webServer: config.webServer.map(server => ({ ...server, env: { ...server.env, E2E_LISTENING: '1' } })),
};
export default listeningConfig;
