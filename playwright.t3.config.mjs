import config from './playwright.u5.config.mjs';
const ports = [5296, 5297];
const t3Config = {
  ...config,
  testMatch:'t3.spec.mjs',
  webServer:config.webServer.map((server,index)=>({...server, url:`http://127.0.0.1:${ports[index]}/api/health`,
    env:{...server.env,LEARNING_HUB_DEMO_PORT:String(ports[index]),E2E_TUTOR:'1'}})),
  projects:config.projects.map((project,index)=>({...project,use:{...project.use,baseURL:`http://127.0.0.1:${ports[index]}`}})),
};
export default t3Config;
