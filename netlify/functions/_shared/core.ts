import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export function env(name:string){const v=Netlify.env.get(name);if(!v)throw new HttpError(503,'課程服務尚未完成設定，請聯絡老師。');return v;}
export function db(){return createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}
export async function authenticate(req:Request):Promise<{client:SupabaseClient;user:User;isAdmin:boolean}>{
 const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))throw new HttpError(401,'請先登入。');
 const client=db(); const {data,error}=await client.auth.getUser(auth.slice(7));
 if(error||!data.user?.email||!data.user.email_confirmed_at)throw new HttpError(401,'請使用已驗證的 Google 帳號登入。');
 const {data:profile,error:profileError}=await client.from('profiles').select('role').eq('id',data.user.id).single();
 if(profileError)throw new HttpError(503,'帳號資料尚未初始化。');
 return {client,user:data.user,isAdmin:profile?.role==='admin'};
}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function failure(error:unknown){return json({error:error instanceof HttpError?error.message:'操作未完成，請稍後再試。'},error instanceof HttpError?error.status:500);}
export function check(error:{message:string}|null){if(error)throw new HttpError(400,error.message);}
export function uuid(v:unknown){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))throw new HttpError(400,'識別碼格式不正確。');return v;}
export function integer(v:unknown,min=1,max=1000000){if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)throw new HttpError(400,'點數需為範圍內的整數。');return v;}
export async function body(req:Request,max=65536){const text=await req.text();if(text.length>max)throw new HttpError(413,'資料太大，請縮小檔案。');try{return JSON.parse(text);}catch{throw new HttpError(400,'資料格式不正確。');}}
export function requirePost(req:Request){if(req.method!=='POST')throw new HttpError(405,'不支援此操作。');}
