import type { Config } from '@netlify/functions';
import { authenticate,body,check,failure,HttpError,integer,json,requirePost,uuid } from './_shared/core';
export default async(req:Request)=>{try{requirePost(req);const {client,isAdmin}=await authenticate(req);if(!isAdmin)throw new HttpError(403,'只有老師可以進行此操作。');const b=await body(req);
 switch(b.action){
 case 'create':{if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80)throw new HttpError(400,'請填寫班級名稱。');if(typeof b.expires_at!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.expires_at)||new Date(`${b.expires_at}T23:59:59+08:00`).getTime()<Date.now())throw new HttpError(400,'請設定有效的到期日期。');const {error}=await client.from('classes').insert({name:b.name.trim(),description:String(b.description||'').slice(0,160),total:integer(b.total),default_quota:integer(b.default_quota),image_cost:integer(b.image_cost,1,10000),video_cost:integer(b.video_cost,1,10000),expires_at:`${b.expires_at}T23:59:59+08:00`});check(error);break;}
 case 'invite':{if(!Array.isArray(b.emails)||b.emails.length>200||b.emails.some((v:unknown)=>typeof v!=='string'||!/^\S+@\S+\.\S+$/.test(v)||v.length>254))throw new HttpError(400,'每次最多匯入 200 個有效 Email。');check((await client.rpc('invite_students',{p_class:uuid(b.classId),p_emails:b.emails})).error);break;}
 case 'quota':check((await client.rpc('set_quota',{p_class:uuid(b.classId),p_member:uuid(b.memberId),p_quota:integer(b.quota,0)})).error);break;
 case 'toggle':if(typeof b.active!=='boolean')throw new HttpError(400,'狀態不正確。');check((await client.from('classes').update({active:b.active}).eq('id',uuid(b.classId))).error);break;
 case 'resolve':{const {data:job,error}=await client.from('generation_jobs').select('status').eq('id',uuid(b.jobId)).single();check(error);if(job?.status!=='review'||!['success','refund'].includes(b.resolution))throw new HttpError(400,'此任務無法手動結算。');check((await client.rpc('settle_job',{p_id:b.jobId,p_success:b.resolution==='success'})).error);break;}
 default:throw new HttpError(400,'不支援的管理操作。');}
 return json({ok:true});}catch(e){return failure(e);}};
export const config:Config={path:'/api/admin',method:'POST'};
