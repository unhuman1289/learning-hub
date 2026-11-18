import config from './playwright.u5.config.mjs';

const ports = [18761, 18762];

const tutorConfig = {
  ...config,
  testMatch: 'tutor.spec.mjs',
  webServer: config.webServer.map((server, index) => {
    const port = ports[index];
    return {
      ...server,
      url: 'http://127.0.0.1:' + port + '/api/health',
      env: { E2E_TUTOR: '1', LEARNING_HUB_DEMO_PORT: String(port), LEARNING_HUB_DEMO_STATE: '.wrangler/e2e-tutor-' + port + '-' + process.pid },
    };
  }),
  projects: config.projects.map((project, index) => ({
    ...project,
    use: { ...project.use, baseURL: 'http://127.0.0.1:' + ports[index] },
  })),
};

export default tutorConfig;
