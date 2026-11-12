import type {Db} from '../subjects/service.ts';
import type {RoadmapStep} from './types.ts';

export async function listSteps(db:Db,learnerId:string,subjectId:string):Promise<RoadmapStep[]> {
 const {results=[]}=await db.prepare(`SELECT id,learner_id AS learnerId,subject_id AS subjectId,ord,title,objective,situation,
 skill_ids AS skills,requires,band,level_label AS levelLabel,kind AS mode,status,passed_via AS passedVia,passed_at AS passedAt,revision
 FROM roadmap_steps WHERE learner_id=? AND subject_id=? ORDER BY ord,id`)
 .bind(learnerId,subjectId).all<Omit<RoadmapStep,'skills'|'requires'>&{skills:string;requires:string}>();
 return results.map(row=>({...row,skills:JSON.parse(row.skills) as string[],requires:JSON.parse(row.requires) as string[]}));
}

export function nextSteps(steps:RoadmapStep[],k=3){
 return steps.filter(step=>step.status==='planned').slice(0,k);
}

export { applyRoadmapChanges } from './changes.ts';
