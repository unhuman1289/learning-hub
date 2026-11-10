import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('fixtures/eval/assess/pilot.json','utf8'));
if(process.argv.includes('--execute-paid'))throw Error('Paid model APIs are disabled. Use the ChatGPT subscription evaluation workflow.');
console.log(JSON.stringify({cases:fixture.cases.length,images:fixture.cases.filter(c=>c.image).length,injections:fixture.cases.filter(c=>c.injection).length,goldStatus:fixture.goldStatus,modelCalls:0,mode:'subscription-review',acceptance:'Human-approved gold and actual ChatGPT results still required'}));
