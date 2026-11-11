import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, foreignKey } from 'drizzle-orm/sqlite-core';
export * from './auth-schema';
export const workspace = sqliteTable('learning_workspace', { owner: text('owner').primaryKey(), payload: text('payload').notNull(), revision: integer('revision').notNull().default(0), updated: text('updated').notNull() });
export const dailyLessons = sqliteTable('learning_lessons', {
 id:text('id').primaryKey(), userId:text('user_id').notNull(), track:text('track'), payload:text('payload').notNull(),
 assignedDate:text('assigned_date').notNull(), completedAt:text('completed_at'), response:text('response').notNull().default(''), updated:text('updated').notNull(), automationReviewedAt:text('automation_reviewed_at'),
 subjectId:text('subject_id'), packageVersion:text('package_version').notNull().default('1'), template:text('template'), kind:text('kind').notNull().default('legacy'),
 slot:text('slot').notNull().default('primary'), reason:text('reason').notNull().default(''), reasonRefs:text('reason_refs').notNull().default('[]'), estMinutes:integer('est_minutes'),
 draft:text('draft').notNull().default('{}'), draftRevision:integer('draft_revision').notNull().default(0), support:text('support').notNull().default('{}'),
 snoozedUntil:text('snoozed_until'), originJobId:text('origin_job_id'),
}, table => [
 uniqueIndex('learning_lessons_user_id_unique').on(table.userId, table.id),
]);
export const lessonItems = sqliteTable('lesson_items', {
 lessonId:text('lesson_id').notNull(), itemId:text('item_id').notNull(), learnerId:text('learner_id').notNull(), subjectId:text('subject_id').notNull(),
 stage:text('stage').notNull(), activity:text('activity').notNull(), inputKind:text('input_kind').notNull(), skillIds:text('skill_ids').notNull(),
 difficulty:integer('difficulty').notNull(), autoGradable:integer('auto_gradable').notNull(), promptHash:text('prompt_hash').notNull(),
 origin:text('origin').notNull().default('plan'), payload:text('payload').notNull(), flag:text('flag'), createdAt:text('created_at').notNull(),
}, table => [primaryKey({columns:[table.lessonId, table.itemId]})]);
export const dailySlots = sqliteTable('learning_slots', {
 userId:text('user_id').notNull(), track:text('track').notNull(), lessonId:text('lesson_id').notNull(), revision:integer('revision').notNull().default(0),
}, table => [
 primaryKey({columns:[table.userId,table.track]}),
 foreignKey({columns:[table.userId,table.lessonId],foreignColumns:[dailyLessons.userId,dailyLessons.id]}).onDelete('cascade'),
]);
export const dailyRuns = sqliteTable('learning_runs', { day:text('day').primaryKey(), payload:text('payload').notNull(), updated:text('updated').notNull() });
export const runs = sqliteTable('runs', {
 id:text('id').primaryKey(),day:text('day').notNull(),status:text('status').notNull(),
 startedAt:text('started_at').notNull(),finishedAt:text('finished_at'),summary:text('summary').notNull().default(''),
 error:text('error'),origin:text('origin').notNull().default('scheduled'),requestHash:text('request_hash'),
});
export const legacyRunItems = sqliteTable('legacy_run_items', {
 runId:text('run_id').notNull().references(()=>runs.id),userId:text('user_id').notNull(),track:text('track').notNull(),
 outcome:text('outcome').notNull(),reason:text('reason').notNull(),previousLessonId:text('previous_lesson_id'),
 lessonId:text('lesson_id'),sources:text('sources').notNull().default('[]'),
},table=>[primaryKey({columns:[table.runId,table.userId,table.track]})]);
export const automationRuns = sqliteTable('automation_runs', {
 id:text('id').primaryKey(),clientId:text('client_id').notNull(),contractVersion:text('contract_version').notNull(),trigger:text('trigger').notNull(),
 runnerName:text('runner_name').notNull(),runnerVersion:text('runner_version').notNull(),runnerModel:text('runner_model').notNull(),idempotencyKey:text('idempotency_key'),
 requestHash:text('request_hash').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
 contextHash:text('context_hash'),contextJson:text('context_json'),resultHash:text('result_hash'),resultJson:text('result_json'),finishedAt:text('finished_at'),error:text('error'),
},table=>[uniqueIndex('automation_runs_client_idempotency_unique').on(table.clientId,table.idempotencyKey)]);
export const runTargets = sqliteTable('run_targets', {
 runId:text('run_id').notNull(),targetId:text('target_id').notNull(),userId:text('user_id').notNull(),track:text('track').notNull(),currentLessonId:text('current_lesson_id'),
 eligible:integer('eligible').notNull(),eligibility:text('eligibility').notNull(),contextJson:text('context_json').notNull(),
},table=>[
 primaryKey({columns:[table.runId,table.targetId]}),
 uniqueIndex('run_targets_run_user_track_unique').on(table.runId,table.userId,table.track),
 foreignKey({columns:[table.runId],foreignColumns:[automationRuns.id]}).onDelete('cascade'),
 foreignKey({columns:[table.userId,table.currentLessonId],foreignColumns:[dailyLessons.userId,dailyLessons.id]}),
]);
export const runItems = sqliteTable('run_items', {
 runId:text('run_id').notNull(),targetId:text('target_id').notNull(),action:text('action').notNull(),outcome:text('outcome').notNull(),reason:text('reason').notNull(),lessonId:text('lesson_id'),payload:text('payload'),
},table=>[
 primaryKey({columns:[table.runId,table.targetId]}),
 foreignKey({columns:[table.runId,table.targetId],foreignColumns:[runTargets.runId,runTargets.targetId]}).onDelete('cascade'),
 foreignKey({columns:[table.lessonId],foreignColumns:[dailyLessons.id]}),
]);
export const runEvents = sqliteTable('run_events', {
 id:text('id').primaryKey(),runId:text('run_id').notNull(),occurredAt:text('occurred_at').notNull(),type:text('type').notNull(),detail:text('detail').notNull().default('{}'),
},table=>[foreignKey({columns:[table.runId],foreignColumns:[automationRuns.id]}).onDelete('cascade')]);
export const backupEvents = sqliteTable('backup_events', {id:text('id').primaryKey(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull()});
// Study time is measured per account and Berlin day while a notebook is open; the target is per account.
export const studyTime = sqliteTable('study_time', {
 userId:text('user_id').notNull(),day:text('day').notNull(),track:text('track').notNull(),
 seconds:integer('seconds').notNull().default(0),updated:text('updated').notNull(),
},table=>[primaryKey({columns:[table.userId,table.day,table.track]})]);
export const learnerSettings = sqliteTable('learner_settings', {
 userId:text('user_id').primaryKey(),dailyTargetMinutes:integer('daily_target_minutes').notNull().default(60),updated:text('updated').notNull(),
 role:text('role').notNull().default('adult'),displayName:text('display_name'),explainLanguage:text('explain_language').notNull().default('vi'),
 preferences:text('preferences').notNull().default('{}'),aiBudget:text('ai_budget'),
});
export const guardians = sqliteTable('guardians', {
 guardianId:text('guardian_id').notNull(),learnerId:text('learner_id').notNull(),createdBy:text('created_by').notNull(),createdAt:text('created_at').notNull(),
},table=>[primaryKey({columns:[table.guardianId,table.learnerId]})]);
export const subjects = sqliteTable('subjects', {
 id:text('id').primaryKey(),learnerId:text('learner_id').notNull(),title:text('title').notNull(),template:text('template').notNull(),
 sensitivity:text('sensitivity').notNull().default('normal'),goal:text('goal').notNull().default(''),level:text('level').notNull().default(''),
 curriculum:text('curriculum').notNull().default(''),openingBrief:text('opening_brief'),limits:text('limits').notNull(),weight:integer('weight').notNull().default(3),
 status:text('status').notNull().default('setup'),aiEnabled:integer('ai_enabled').notNull().default(0),legacyTrack:text('legacy_track'),
 progressSummary:text('progress_summary').notNull().default(''),progressUpdatedAt:text('progress_updated_at'),revision:integer('revision').notNull().default(0),
 createdBy:text('created_by').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},table=>[uniqueIndex('subjects_learner_title_unique').on(table.learnerId,table.title)]);
export const skills = sqliteTable('skills', {
 id:text('id').primaryKey(),subjectId:text('subject_id').notNull().references(()=>subjects.id,{onDelete:'cascade'}),learnerId:text('learner_id').notNull(),
 key:text('key').notNull(),name:text('name').notNull(),description:text('description').notNull().default(''),pathOrder:integer('path_order').notNull().default(0),
 prerequisites:text('prerequisites').notNull().default('[]'),status:text('status').notNull().default('planned'),origin:text('origin').notNull(),
 createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},table=>[uniqueIndex('skills_subject_key_unique').on(table.subjectId,table.key)]);
export const learnerRequests = sqliteTable('learner_requests', {
 id:text('id').primaryKey(),learnerId:text('learner_id').notNull(),subjectId:text('subject_id').references(()=>subjects.id,{onDelete:'set null'}),
 kind:text('kind').notNull(),text:text('text').notNull(),urgency:text('urgency').notNull().default('tonight'),createdBy:text('created_by').notNull(),
 status:text('status').notNull().default('queued'),activeUntil:text('active_until'),resultLessonId:text('result_lesson_id'),responseNote:text('response_note'),
 jobId:text('job_id'),createdAt:text('created_at').notNull(),processedAt:text('processed_at'),
});

// H3 evidence is append-only; retry links keep previous answers and grades.
export const submissions = sqliteTable('submissions', {
 id:text('id').primaryKey(),learnerId:text('learner_id').notNull(),lessonId:text('lesson_id').notNull().references(()=>dailyLessons.id),
 stage:text('stage'),clientSubmissionId:text('client_submission_id').notNull(),requestHash:text('request_hash').notNull(),
 status:text('status').notNull(),aiJobId:text('ai_job_id'),createdAt:text('created_at').notNull(),gradedAt:text('graded_at'),
},t=>[uniqueIndex('submissions_learner_client_unique').on(t.learnerId,t.clientSubmissionId)]);
export const attempts = sqliteTable('attempts', {
 id:text('id').primaryKey(),submissionId:text('submission_id').notNull().references(()=>submissions.id),learnerId:text('learner_id').notNull(),
 lessonId:text('lesson_id').notNull(),itemId:text('item_id').notNull(),subjectId:text('subject_id').notNull().references(()=>subjects.id),
 skillIds:text('skill_ids').notNull(),activity:text('activity').notNull(),attemptNo:integer('attempt_no').notNull(),retryOf:text('retry_of'),
 answer:text('answer').notNull(),attachmentIds:text('attachment_ids').notNull().default('[]'),support:text('support').notNull(),context:text('context').notNull(),
 status:text('status').notNull(),currentGradeId:text('current_grade_id'),day:text('day').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('attempts_lesson_item_no_unique').on(t.lessonId,t.itemId,t.attemptNo),foreignKey({columns:[t.lessonId,t.itemId],foreignColumns:[lessonItems.lessonId,lessonItems.itemId]}),foreignKey({columns:[t.retryOf],foreignColumns:[t.id]})]);
export const grades = sqliteTable('grades', {
 id:text('id').primaryKey(),attemptId:text('attempt_id').notNull().references(()=>attempts.id),grader:text('grader').notNull(),jobId:text('job_id'),
 result:text('result').notNull(),score:real('score').notNull(),rubricScores:text('rubric_scores').notNull().default('[]'),feedback:text('feedback').notNull(),
 correction:text('correction').notNull().default(''),errors:text('errors').notNull().default('[]'),supersededBy:text('superseded_by'),createdAt:text('created_at').notNull(),
},t=>[foreignKey({columns:[t.supersededBy],foreignColumns:[t.id]})]);
export const disputes = sqliteTable('disputes', {
 id:text('id').primaryKey(),attemptId:text('attempt_id').notNull().references(()=>attempts.id),gradeId:text('grade_id').notNull().references(()=>grades.id),
 learnerId:text('learner_id').notNull(),raisedBy:text('raised_by').notNull(),reason:text('reason').notNull(),message:text('message').notNull(),
 recheckRequested:integer('recheck_requested').notNull().default(0),status:text('status').notNull().default('open'),resolutionGradeId:text('resolution_grade_id').references(()=>grades.id),
 resolvedBy:text('resolved_by'),resolutionNote:text('resolution_note'),createdAt:text('created_at').notNull(),resolvedAt:text('resolved_at'),
});
