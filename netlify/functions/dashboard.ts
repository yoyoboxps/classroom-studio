import type { Config } from '@netlify/functions';
import { authenticate,check,failure,json } from './_shared/core';
export default async(req:Request)=>{try{
 const {client,user,isAdmin}=await authenticate(req);
 check((await client.rpc('claim_memberships',{p_user:user.id,p_email:user.email,p_name:user.user_metadata.full_name||user.email?.split('@')[0]||'同學'})).error);
 let membersQuery=client.from('class_members').select('*');if(!isAdmin)membersQuery=membersQuery.eq('user_id',user.id);
 const {data:members,error:mError}=await membersQuery;check(mError);
 let classQuery=client.from('classes').select('*').order('created_at');if(!isAdmin)classQuery=classQuery.in('id',(members||[]).map(m=>m.class_id));
 let jobsQuery=client.from('generation_jobs').select('id,class_id,user_id,kind,cost,status,created_at').order('created_at',{ascending:false}).limit(200);if(!isAdmin)jobsQuery=jobsQuery.eq('user_id',user.id);
 const [classes,jobs,available]=await Promise.all([classQuery,jobsQuery,client.from('classes').select('id,name').eq('self_enrollment',true).eq('active',true).gt('expires_at',new Date().toISOString()).order('created_at').limit(50)]);check(classes.error);check(jobs.error);check(available.error);
 let counts:Record<string,number>={};if(isAdmin){for(const m of members||[])counts[m.class_id]=(counts[m.class_id]||0)+1;}
 return json({available_classes:available.data||[],viewer_id:user.id,role:isAdmin?'admin':'student',name:user.user_metadata.full_name||'同學',classes:(classes.data||[]).map(c=>({...c,students:isAdmin?counts[c.id]||0:0})),members:members||[],jobs:jobs.data||[]});
 }catch(e){return failure(e);}};
export const config:Config={path:'/api/dashboard',method:'GET'};
