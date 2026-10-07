import type {LearningTrack} from './daily-policy';
export type DailyContent = {
 title:string; objective:string; minutes:number; level:string;
 sections:{heading:string,text:string}[]; diagram:string; exercise:string;
 questions:{question:string,answer:string}[]; deliverable:string;
 sources:{title:string,url:string,readScope:string,retrievedAt:string,publishedAt:string|null}[];
 nextTopic:string;
};
export type DailyLesson = {id:string,track:LearningTrack,assignedDate:string,completedAt:string|null,response:string,updated:string,content:DailyContent};
export type DailyView = {active:DailyLesson[],history:DailyLesson[],lastRun:{day:string,updated:string,summary:unknown}|null};
