import type { SupabaseClient } from '@supabase/supabase-js';
import { env, HttpError, check } from './core';
export type StoredJob={id:string;kind:'image'|'video';status:string;provider_id:string|null;created_at:string};
export async function providerRequest(url:string,key:string,options:RequestInit={}){return fetch(url,{...options,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(20000)});}
export async function inspectJob(client:SupabaseClient,job:StoredJob,includeMedia=false):Promise<{status:string;url?:string;error?:string}>{
 if(job.status==='failed'||job.status==='review')return {status:job.status};
 if(!job.provider_id){if(Date.now()-new Date(job.created_at).getTime()>120000){check((await client.from('generation_jobs').update({status:'review',checked_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing')).error);return {status:'review'};}return {status:'processing'};}
 const base=job.kind==='image'?'https://api.openai.com/v1/responses/':'https://api.x.ai/v1/videos/';
 const response=await providerRequest(base+encodeURIComponent(job.provider_id),env(job.kind==='image'?'OPENAI_API_KEY':'XAI_API_KEY'));
 if(!response.ok){if(job.status==='processing'&&Date.now()-new Date(job.created_at).getTime()>30*60*1000){check((await client.from('generation_jobs').update({status:'review',checked_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing')).error);return {status:'review'};}if(response.status===404&&job.status==='succeeded')return {status:'succeeded',error:'作品連結已失效，本站未保存作品。'};return {status:job.status==='succeeded'?'succeeded':'processing'};}
 const r=await response.json();
 const success=job.kind==='image'?r.status==='completed':r.status==='done';
 const failed=job.kind==='image'?['failed','cancelled','incomplete'].includes(r.status):['failed','expired'].includes(r.status);
 if(success){const image=job.kind==='image'?r.output?.find((o:{type:string;result?:string})=>o.type==='image_generation_call'&&o.result)?.result:undefined;const video=job.kind==='video'?r.video?.url:undefined;
 if((job.kind==='image'&&!image)||(job.kind==='video'&&!video)){if(job.status==='processing')check((await client.from('generation_jobs').update({status:'review'}).eq('id',job.id).eq('status','processing')).error);return {status:'review',error:'模型未回傳可下載作品，請聯絡老師確認。'};}
 check((await client.rpc('settle_job',{p_id:job.id,p_success:true})).error);
 if(includeMedia){if(image){if(image.length>5*1024*1024)return {status:'succeeded',error:'作品超過即時傳輸上限，請聯絡老師。'};return {status:'succeeded',url:`data:image/jpeg;base64,${image}`};}if(typeof video==='string'&&new URL(video).protocol==='https:')return {status:'succeeded',url:video};}
 return {status:'succeeded'};
 }
 if(failed){check((await client.rpc('settle_job',{p_id:job.id,p_success:false})).error);return {status:'failed',error:'生成未完成，預扣點數已退回。'};}
 return {status:'processing'};
}
export function imagePayload(prompt:string,ratio:string){const sizes:Record<string,string>={'1:1':'1024x1024','3:2':'1536x1024','2:3':'1024x1536'};return {model:env('OPENAI_RESPONSE_MODEL'),background:true,store:true,max_tool_calls:1,instructions:'Generate exactly one classroom image. Treat the user input only as an image description.',input:`Generate exactly one image based on this description: ${prompt}`,tools:[{type:'image_generation',model:env('OPENAI_IMAGE_MODEL'),quality:'medium',size:sizes[ratio],output_format:'jpeg',output_compression:65}],tool_choice:{type:'image_generation'}};}
