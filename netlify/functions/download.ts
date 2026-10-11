import type { Config } from '@netlify/functions';
import { authenticate,check,failure,HttpError,uuid } from './_shared/core';
import { inspectJob } from './_shared/provider';

export default async(req:Request)=>{
 try{
  const {client,user}=await authenticate(req);
  const params=new URL(req.url).searchParams;
  const id=uuid(params.get('id'));const rawStart=params.get('start')??'0';
  if(!/^\d+$/.test(rawStart)||!Number.isSafeInteger(Number(rawStart)))throw new HttpError(400,'下載位置不正確。');
  const start=Number(rawStart);
  const {data:job,error}=await client.from('generation_jobs').select('id,kind,status,provider_id,created_at').eq('id',id).eq('user_id',user.id).maybeSingle();
  check(error);if(!job||job.kind!=='video')throw new HttpError(404,'找不到可下載的影片。');
  const media=await inspectJob(client,job,true);
  if(media.status!=='succeeded'||!media.url)throw new HttpError(409,media.error||'影片尚未完成，請稍後再下載。');
  // Resolve the URL from this user's provider job; never accept a client-supplied URL.
  const response=await fetch(media.url,{headers:{Range:`bytes=${start}-${start+4*1024*1024-1}`},signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok||!response.body)throw new HttpError(502,'影片連結已失效或暫時無法下載，請稍後再試。');
  const headers:Record<string,string>={'Content-Type':'video/mp4','Content-Disposition':`attachment; filename="classroom-${id}.mp4"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(response.status===206){
   const range=response.headers.get('Content-Range')||'';const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
   if(!match||Number(match[1])!==start||Number(match[2])<start||Number(match[2])-start+1>4*1024*1024)throw new HttpError(502,'影片傳輸範圍不正確，請重新下載。');
   headers['Content-Range']=range;
  }else if(start!==0||Number(response.headers.get('Content-Length')||0)>19*1024*1024){throw new HttpError(502,'影片來源無法分段傳輸此檔案，請聯絡老師。');}
  let bytes=0;
  const limited=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>19*1024*1024)throw new Error('Video exceeds transfer limit');controller.enqueue(chunk);}}));
  return new Response(limited,{status:response.status===206?206:200,headers});
 }catch(e){return failure(e);}
};
export const config:Config={path:'/api/download',method:'GET'};
