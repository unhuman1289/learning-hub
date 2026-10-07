export class ApiError extends Error {
  status:number;
  constructor(status:number,message:string){super(message);this.status=status;this.name='ApiError';}
}
export function apiFailure(error:unknown,fallback:string,headers:HeadersInit={}){
  if(error instanceof ApiError)return Response.json({error:error.message},{status:error.status,headers});
  if(error instanceof SyntaxError)return Response.json({error:'JSON không hợp lệ.'},{status:400,headers});
  console.error(fallback,error);
  return Response.json({error:fallback},{status:503,headers});
}
