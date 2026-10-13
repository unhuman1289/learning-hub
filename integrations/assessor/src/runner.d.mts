export function runAssessment(
 env:Record<string,string|undefined>,
 options?:{fetcher?:typeof fetch; model?:(context:unknown,schema:unknown,images?:unknown[],issues?:unknown)=>Promise<unknown>;allowedLearnerRef?:string}
):Promise<{status:string;jobId?:string;outcome?:unknown}>;
