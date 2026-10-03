import type { Config } from '@netlify/functions';
import { authenticate,check,failure,json } from './_shared/core';
export default async(req:Request)=>{try{
 const {client,user,isAdmin}=await authenticate(req);
 check((await client.rpc('claim_memberships',{p_user:user.id,p_email:user.email,p_name:user.user_metadata.full_name||user.email?.split('@')[0]||'同學'})).error);
 let membersQuery=client.from('class_members').select('*');if(!isAdmin)membersQuery=membersQuery.eq('user_id',user.id).is('removed_at',null);
 const {data:members,error:mError}=await membersQuery;check(mError);
 let classQuery=client.from('classes').select('*').is('deleted_at',null).order('created_at');if(!isAdmin)classQuery=classQuery.in('id',(members||[]).map(m=>m.class_id));
 let jobsQuery=client.from('generation_jobs').select('id,class_id,user_id,kind,cost,status,created_at').order('created_at',{ascending:false}).limit(200);if(!isAdmin)jobsQuery=jobsQuery.eq('user_id',user.id);
 const [classes,jobs,archived]=await Promise.all([classQuery,jobsQuery,isAdmin?client.from('classes').select('*').not('deleted_at','is',null).order('created_at'):Promise.resolve({data:[],error:null})]);check(classes.error);check(jobs.error);check(archived.error);
 let counts:Record<string,number>={};if(isAdmin){for(const m of (members||[]).filter(m=>!m.removed_at))counts[m.class_id]=(counts[m.class_id]||0)+1;}
 return json({archived_classes:archived.data||[],viewer_id:user.id,role:isAdmin?'admin':'student',name:user.user_metadata.full_name||'同學',classes:(classes.data||[]).map(c=>({...c,students:isAdmin?counts[c.id]||0:0})),members:members||[],jobs:jobs.data||[]});
 }catch(e){return failure(e);}};
export const config:Config={path:'/api/dashboard',method:'GET'};
