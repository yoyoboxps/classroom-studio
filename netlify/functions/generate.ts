import type { Config } from '@netlify/functions';
import { authenticate,body,check,env,failure,HttpError,json,requirePost,uuid } from './_shared/core';
import { imagePayload,providerRequest,validatePhoto } from './_shared/provider';
export default async(req:Request)=>{let reservedId:string|undefined;let client:ReturnType<typeof import('./_shared/core').db>|undefined;try{
 requirePost(req);const auth=await authenticate(req);client=auth.client;const b=await body(req,4.3*1024*1024);
 const classId=uuid(b.classId),id=uuid(b.requestId);
 if(!['image','video'].includes(b.kind)||typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>2000)throw new HttpError(400,'請填寫 1–2,000 字的創作描述。');
 if(b.kind==='image'&&!['1:1','3:2','2:3'].includes(b.ratio))throw new HttpError(400,'圖片比例不正確。');
 const photo=b.kind==='video'||b.image!==undefined?validatePhoto(b.image):undefined;
 const key=env(b.kind==='image'?'OPENAI_API_KEY':'XAI_API_KEY');const payload=b.kind==='image'?imagePayload(b.prompt.trim(),b.ratio,photo):{model:env('XAI_VIDEO_MODEL'),prompt:b.prompt.trim(),image:{url:b.image},duration:6,resolution:'720p'};
 const {data:job,error}=await client.rpc('reserve_job',{p_user:auth.user.id,p_class:classId,p_id:id,p_kind:b.kind});check(error);
 if(job.existing)return json({id,status:job.status});reservedId=id;
 const response=await providerRequest(b.kind==='image'?'https://api.openai.com/v1/responses':'https://api.x.ai/v1/videos/generations',key,{method:'POST',body:JSON.stringify(payload)});
 if(!response.ok){if(response.status>=400&&response.status<500&&response.status!==408){check((await client.rpc('settle_job',{p_id:id,p_success:false})).error);reservedId=undefined;throw new HttpError(502,'模型拒絕此請求，預扣點數已退回。請修改描述或聯絡老師。');}throw new HttpError(502,'模型連線狀態不確定，已保留點數，請聯絡老師確認。');}
 const result=await response.json();const providerId=b.kind==='image'?result.id:result.request_id;if(typeof providerId!=='string')throw new HttpError(502,'模型未回傳任務識別碼，請聯絡老師確認。');
 check((await client.from('generation_jobs').update({provider_id:providerId,checked_at:new Date().toISOString()}).eq('id',id)).error);reservedId=undefined;
 return json({id,status:'processing'},202);
 }catch(e){if(reservedId&&client){await client.from('generation_jobs').update({status:'review',checked_at:new Date().toISOString()}).eq('id',reservedId).eq('status','processing');return json({error:'生成提交狀態不確定，暫時保留預扣點數。請聯絡老師確認後再試。'},502);}return failure(e);}};
export const config:Config={path:'/api/generate',method:'POST'};
