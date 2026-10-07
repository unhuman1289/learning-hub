import type {LearningTrack} from './daily-policy';
export type DailyContent = {
 title:string; objective:string; minutes:number; level:string;
 sections:{heading:string,text:string}[]; diagram:string; exercise:string;
 questions:{question:string,answer:string}[]; deliverable:string;
 sources:{title:string,url:string,readScope:string,retrievedAt:string,publishedAt:string|null}[];
 nextTopic:string;
};
export type DailyLesson = {id:string,track:LearningTrack,assignedDate:string,completedAt:string|null,response:string,updated:string,content:DailyContent};
export type DailyView = {active:DailyLesson[],history:DailyLesson[],lastRun:{day:string,updated:string,summary:unknown}|null,runs:RunEntry[],health:RunHealth,backup:{lastCreatedAt:string|null,due:boolean}};

export type RunItem={userId:string,track:LearningTrack,outcome:'updated'|'kept'|'skipped'|'error',reason:string,previousLessonId:string|null,lessonId:string|null,sources:DailyContent['sources']};
export type RunEntry={id:string,day:string,status:'started'|'finished'|'failed',startedAt:string,finishedAt:string|null,summary:string,error:string|null,origin:string,items:RunItem[]};
export type RunHealth={lastSuccessfulAt:string|null,stale:boolean,stalledRunId:string|null,latestFailed:boolean};
