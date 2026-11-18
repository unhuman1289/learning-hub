import {prepareAssess} from '../ai-jobs/apply/assess.ts';

/** Synthetic read-only submission state; prepared mutations are never executed. */
function syntheticDb(context) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() {
          if (sql.startsWith('SELECT payload FROM learning_lessons'))
            return {payload: JSON.stringify({gradingMode:'whole-lesson',items:[],stages:[]})};
          if (sql.startsWith('SELECT status,current_grade_id,answer FROM attempts')) {
            const attempt = context.attempts.find(item => item.attemptId === params[0]);
            return attempt ? {status:'pending',current_grade_id:null,answer:attempt.answer} : null;
          }
          if (sql.startsWith('SELECT created_at,submission_id,context,status,answer FROM attempts')) {
            const attempt = context.attempts.find(item => item.attemptId === params[0]);
            return attempt ? {created_at:'2026-01-01T00:00:00.000Z',submission_id:'synthetic',context:'lesson',status:'pending',answer:attempt.answer} : null;
          }
          if (sql.startsWith('SELECT limits FROM subjects')) return {limits:JSON.stringify({maxDifficulty:5})};
          return null;
        },
        async all() { return {results:[]}; },
        async run() { throw new Error('Synthetic calibration cannot write'); },
      };
      return statement;
    },
    async batch() { throw new Error('Synthetic calibration cannot write'); },
  };
}

/** Run the actual assess dry-run validator against synthetic state. */
export async function calibrationDryRun(context, result) {
  const job = {id:context.jobId,learner_id:'synthetic',purpose:'submission',ref_id:'synthetic'};
  const prepared = await prepareAssess(syntheticDb(context),job,context,result,'synthetic',new Date('2026-01-01T00:00:00.000Z'));
  return prepared.errors;
}
