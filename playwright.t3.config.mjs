import config from './playwright.u5.config.mjs';
const t3Config = {...config, testMatch:'t3.spec.mjs', webServer:config.webServer.map(server=>({...server,env:{...server.env,E2E_TUTOR:'1'}}))};
export default t3Config;
