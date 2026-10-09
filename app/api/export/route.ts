import {getHubUser} from '../../../lib/auth/session';
import {storage} from '../../../db/storage';
import {createBackup} from '../../../lib/backup-store';
import {apiFailure} from '../../../lib/api-error';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){
 const user=await getHubUser();
 if(!user)return Response.json({error:'Sign in required'},{status:401,headers});
 if(user.role!=='admin')return Response.json({error:'Admin access required'},{status:403,headers});
 try{
   const data=await createBackup(storage(),user.id);
   return new Response(JSON.stringify(data,null,2),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="learning-hub-backup-${data.exportedAt.slice(0,10)}.json"`,'X-Content-Type-Options':'nosniff'}});
 }catch(e){return apiFailure(e,'Không tạo được bản sao lưu. Chưa có file để tải; hãy thử lại.',headers);}
}
