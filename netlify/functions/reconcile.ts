import type { Config } from '@netlify/functions';
import { db,check } from './_shared/core';
import { inspectJob } from './_shared/provider';
export default async()=>{const client=db();const {data:jobs,error}=await client.from('generation_jobs').select('id,kind,status,provider_id,created_at').eq('status','processing').order('checked_at').limit(10);check(error);
 await Promise.allSettled((jobs||[]).map(async job=>{try{await inspectJob(client,job);}finally{await client.from('generation_jobs').update({checked_at:new Date().toISOString()}).eq('id',job.id);}}));
};
export const config:Config={schedule:'* * * * *'};
