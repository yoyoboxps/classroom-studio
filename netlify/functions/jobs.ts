import type { Config } from '@netlify/functions';
import { authenticate,check,failure,HttpError,json,uuid } from './_shared/core';
import { inspectJob } from './_shared/provider';
export default async(req:Request)=>{try{const {client,user}=await authenticate(req);const id=uuid(new URL(req.url).searchParams.get('id'));const {data:job,error}=await client.from('generation_jobs').select('id,kind,status,provider_id,created_at').eq('id',id).eq('user_id',user.id).maybeSingle();check(error);if(!job)throw new HttpError(404,'找不到此任務。');return json(await inspectJob(client,job,true));}catch(e){return failure(e);}};
export const config:Config={path:'/api/jobs',method:'GET'};
