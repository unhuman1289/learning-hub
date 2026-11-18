import {getHubUser} from '../../../../../lib/auth/session';
import {storage} from '../../../../../db/storage';
import {apiFailure} from '../../../../../lib/api-error';
export const dynamic = 'force-dynamic';
const headers = {'Cache-Control':'private, no-store'};
export async function GET(_req: Request, {params}: {params: Promise<{id:string}>}) {
  const user = await getHubUser();
  if (!user || user.role !== 'admin') return Response.json({error:'Forbidden'},{status:user ? 403 : 401,headers});
  const {id} = await params;
  if (!/^cal_[0-9a-f-]{36}$/.test(id)) return Response.json({error:'Not found'},{status:404,headers});
  try {
    const db=storage();
    if (!await db.prepare('SELECT id FROM grader_calibrations WHERE id=?').bind(id).first()) return Response.json({error:'Not found'},{status:404,headers});
    const {results=[]}=await db.prepare('SELECT fixture_id,item_id,expected_result,model_result,fixture_answer,rubric_scores,error_code FROM grader_calibration_details WHERE calibration_id=? ORDER BY fixture_id,item_id').bind(id).all<{rubric_scores:string}>();
    return Response.json({details:results.map(row=>({...row,rubric_scores:JSON.parse(row.rubric_scores)}))},{headers});
  } catch(e) {return apiFailure(e,'Chưa tải được chi tiết hiệu chuẩn.',headers);}
}
