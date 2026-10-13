import {z} from 'zod/v3';
import {learningTracks} from './daily-policy.ts';
const text=z.string().trim().min(1).max(18000);
const source=z.object({title:text,url:z.string().url().refine(v=>v.startsWith('https://')),readScope:text,retrievedAt:z.string().datetime(),publishedAt:z.string().max(100).nullable()});
export const lessonContentSchema=z.object({title:text,objective:text,minutes:z.number().int().min(5).max(240),level:text,sections:z.array(z.object({heading:text,text})).min(2).max(8),diagram:z.string().max(6000),exercise:text,questions:z.array(z.object({question:text,answer:text})).min(2).max(8),deliverable:text,sources:z.array(source).min(1).max(8),nextTopic:text});
export const runIdSchema=z.string().uuid();
export const runSchema=z.object({
  runId:runIdSchema,
  runDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v),
  summary:z.string().max(5000),
  issues:z.array(z.object({track:z.enum(learningTracks),reason:z.string().trim().min(1).max(1000)})).max(5).default([]),
  lessons:z.array(z.object({track:z.enum(learningTracks),expectedId:z.string().max(200).nullable(),content:lessonContentSchema})).max(5),
}).superRefine((x,ctx)=>{
  const tracks=[...x.lessons.map(l=>l.track),...x.issues.map(i=>i.track)];
  if(new Set(tracks).size!==tracks.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Mỗi mảng chỉ có một bài đề xuất hoặc một lỗi.'});
});
export type RunInput=z.infer<typeof runSchema>;
