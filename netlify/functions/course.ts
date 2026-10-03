import type { Config } from '@netlify/functions';
import { body,check,db,failure,HttpError,json,requirePost } from './_shared/core';
export default async(req:Request)=>{try{
 requirePost(req);const b=await body(req,1024);
 if(typeof b.code!=='string'||!/^[A-Z0-9]{6,8}$/i.test(b.code.trim()))throw new HttpError(400,'請輸入 6 至 8 碼的課程代號。');
 const {data,error}=await db().rpc('resolve_course',{p_code:b.code.trim().toUpperCase()});check(error);
 return json(data);
}catch(e){return failure(e);}};
export const config:Config={path:'/api/course',method:'POST'};
