import type { Config } from '@netlify/functions';
import { authenticate,body,check,failure,json,requirePost,uuid } from './_shared/core';
export default async(req:Request)=>{try{
 requirePost(req);const {client,user}=await authenticate(req);const b=await body(req);
 const {data,error}=await client.rpc('join_class',{p_class:uuid(b.code),p_user:user.id});check(error);
 return json({ok:true,memberId:data});
}catch(e){return failure(e);}};
export const config:Config={path:'/api/join',method:'POST'};
