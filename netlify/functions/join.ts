import type { Config } from '@netlify/functions';
import { authenticate,body,check,failure,HttpError,json,requirePost,uuid } from './_shared/core';
export default async(req:Request)=>{try{requirePost(req);const {client,user}=await authenticate(req);const b=await body(req);const id=uuid(b.code);
 const {data,error}=await client.from('class_members').select('id').eq('class_id',id).eq('email',user.email!.toLowerCase()).maybeSingle();check(error);if(!data)throw new HttpError(403,'此帳號不在老師的班級名單內，請聯絡老師。');check((await client.rpc('claim_memberships',{p_user:user.id,p_email:user.email,p_name:user.user_metadata.full_name||'同學'})).error);return json({ok:true});}catch(e){return failure(e);}};
export const config:Config={path:'/api/join',method:'POST'};
