import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspace = sqliteTable('learning_workspace', { owner: text('owner').primaryKey(), payload: text('payload').notNull(), revision: integer('revision').notNull().default(0), updated: text('updated').notNull() });
export const dailyLessons = sqliteTable('learning_lessons', { id:text('id').primaryKey(), track:text('track').notNull(), payload:text('payload').notNull(), assignedDate:text('assigned_date').notNull(), completedAt:text('completed_at'), response:text('response').notNull().default(''), updated:text('updated').notNull() });
export const dailySlots = sqliteTable('learning_slots', { track:text('track').primaryKey(), lessonId:text('lesson_id').notNull(), revision:integer('revision').notNull().default(0) });
export const dailyRuns = sqliteTable('learning_runs', { day:text('day').primaryKey(), payload:text('payload').notNull(), updated:text('updated').notNull() });
