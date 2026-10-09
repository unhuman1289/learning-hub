import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export * from './auth-schema';
export const workspace = sqliteTable('learning_workspace', { owner: text('owner').primaryKey(), payload: text('payload').notNull(), revision: integer('revision').notNull().default(0), updated: text('updated').notNull() });
export const dailyLessons = sqliteTable('learning_lessons', { id:text('id').primaryKey(), track:text('track').notNull(), payload:text('payload').notNull(), assignedDate:text('assigned_date').notNull(), completedAt:text('completed_at'), response:text('response').notNull().default(''), updated:text('updated').notNull() });
export const dailySlots = sqliteTable('learning_slots', { track:text('track').primaryKey(), lessonId:text('lesson_id').notNull(), revision:integer('revision').notNull().default(0) });
export const dailyRuns = sqliteTable('learning_runs', { day:text('day').primaryKey(), payload:text('payload').notNull(), updated:text('updated').notNull() });
export const runs = sqliteTable('runs', {
 id:text('id').primaryKey(),day:text('day').notNull(),status:text('status').notNull(),
 startedAt:text('started_at').notNull(),finishedAt:text('finished_at'),summary:text('summary').notNull().default(''),
 error:text('error'),origin:text('origin').notNull().default('scheduled'),requestHash:text('request_hash'),
});
export const runItems = sqliteTable('run_items', {
 runId:text('run_id').notNull().references(()=>runs.id),userId:text('user_id').notNull(),track:text('track').notNull(),
 outcome:text('outcome').notNull(),reason:text('reason').notNull(),previousLessonId:text('previous_lesson_id'),
 lessonId:text('lesson_id'),sources:text('sources').notNull().default('[]'),
},table=>[primaryKey({columns:[table.runId,table.userId,table.track]})]);
export const backupEvents = sqliteTable('backup_events', {id:text('id').primaryKey(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull()});
// Study time is measured per account and Berlin day while a notebook is open; the target is per account.
export const studyTime = sqliteTable('study_time', {
 userId:text('user_id').notNull(),day:text('day').notNull(),track:text('track').notNull(),
 seconds:integer('seconds').notNull().default(0),updated:text('updated').notNull(),
},table=>[primaryKey({columns:[table.userId,table.day,table.track]})]);
export const learnerSettings = sqliteTable('learner_settings', {userId:text('user_id').primaryKey(),dailyTargetMinutes:integer('daily_target_minutes').notNull().default(60),updated:text('updated').notNull()});
