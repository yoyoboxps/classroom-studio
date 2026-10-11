import type { Config } from '@netlify/functions';
import { authenticate,check,failure,json } from './_shared/core';
export default async(req:Request)=>{try{
 const {client,user,isAdmin}=await authenticate(req);
 check((await client.rpc('ensure_wallet',{p_user:user.id,p_email:user.email,p_name:user.user_metadata.full_name||user.email?.split('@')[0]||'同學'})).error);
 check((await client.rpc('claim_memberships',{p_user:user.id,p_email:user.email,p_name:user.user_metadata.full_name||user.email?.split('@')[0]||'同學'})).error);
 check((await client.rpc('refresh_wallets',{p_user:user.id,p_all:isAdmin})).error);
 let membersQuery=client.from('class_members').select('*');if(!isAdmin)membersQuery=membersQuery.eq('user_id',user.id).is('removed_at',null);
 const {data:members,error:mError}=await membersQuery;check(mError);
 let classQuery=client.from('classes').select('*').is('deleted_at',null).order('created_at');if(!isAdmin)classQuery=classQuery.in('id',(members||[]).map(m=>m.class_id));
 let jobsQuery=client.from('generation_jobs').select('id,class_id,user_id,kind,cost,status,created_at').order('created_at',{ascending:false}).limit(200);if(!isAdmin)jobsQuery=jobsQuery.eq('user_id',user.id);
 const [classes,jobs,archived]=await Promise.all([classQuery,jobsQuery,isAdmin?client.from('classes').select('*').not('deleted_at','is',null).order('created_at'):Promise.resolve({data:[],error:null})]);check(classes.error);check(jobs.error);check(archived.error);
 let accountsQuery=client.from('wallet_accounts').select('*').order('created_at');if(!isAdmin)accountsQuery=accountsQuery.eq('id',user.id);
 let lotsQuery=client.from('wallet_lots').select('*').order('expires_at');if(!isAdmin)lotsQuery=lotsQuery.eq('user_id',user.id);
 const [accounts,lots]=await Promise.all([accountsQuery,lotsQuery]);check(accounts.error);check(lots.error);
 const balances=(accounts.data||[]).map(a=>{const own=(lots.data||[]).filter(l=>l.user_id===a.id&&!l.voided_at&&new Date(l.expires_at).getTime()>Date.now());return {...a,available:own.reduce((n,l)=>n+l.remaining-l.reserved,0),reserved:(lots.data||[]).filter(l=>l.user_id===a.id).reduce((n,l)=>n+l.reserved,0)};});
 let counts:Record<string,number>={};if(isAdmin){for(const m of (members||[]).filter(m=>!m.removed_at))counts[m.class_id]=(counts[m.class_id]||0)+1;}
 return json({wallet_accounts:balances,wallet_lots:lots.data||[],archived_classes:archived.data||[],viewer_id:user.id,role:isAdmin?'admin':'student',name:user.user_metadata.full_name||'同學',classes:(classes.data||[]).map(c=>({...c,students:isAdmin?counts[c.id]||0:0})),members:members||[],jobs:jobs.data||[]});
 }catch(e){return failure(e);}};
export const config:Config={path:'/api/dashboard',method:'GET'};
