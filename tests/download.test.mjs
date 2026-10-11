import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const id='11111111-1111-1111-1111-111111111111';
const code=ts.transpileModule(readFileSync('netlify/functions/download.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup({authorized=true,job={id,kind:'video'},range='bytes 0-3/4',status=206}={}){
 const exports={},filters=[],calls=[];
 const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){return {data:job,error:null};}};
 const core={HttpError,authenticate:async()=>{if(!authorized)throw new HttpError(401,'登入');return {client:{from:()=>query},user:{id:'owner'}};},check:e=>{if(e)throw e;},uuid:v=>{if(v!==id)throw new HttpError(400,'id');return v;},failure:e=>Response.json({error:e.message},{status:e.status||500})};
 vm.runInNewContext(code,{exports,Response,URL,AbortSignal,TransformStream,require:p=>p.includes('core')?core:{inspectJob:async()=>({status:'succeeded',url:'https://media.example/video.mp4'})},fetch:async(url,options)=>{calls.push({url,options});return new Response(new Uint8Array([1,2,3,4]),{status,headers:{'Content-Range':range}});}});
 return {handler:exports.default,filters,calls};
}
test('authenticated owner gets attachment bytes from provider, not a client URL',async()=>{
 const s=setup();const r=await s.handler(new Request(`https://site/api/download?id=${id}&url=https://untrusted.invalid`));
 assert.equal(r.status,206);assert.match(r.headers.get('Content-Disposition'),/^attachment;/);assert.equal(r.headers.get('Content-Range'),'bytes 0-3/4');
 assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3,4]);assert.deepEqual(s.filters,[['id',id],['user_id','owner']]);
 assert.equal(s.calls[0].url,'https://media.example/video.mp4');assert.equal(s.calls[0].options.headers.Range,'bytes=0-4194303');assert.equal(s.calls[0].options.redirect,'error');
});
test('unauthenticated and non-owned jobs cannot fetch media',async()=>{
 for(const options of [{authorized:false},{job:null}]){const s=setup(options);const r=await s.handler(new Request(`https://site/api/download?id=${id}`));assert.ok([401,404].includes(r.status));assert.equal(s.calls.length,0);}
});
test('invalid offsets and provider ranges are rejected',async()=>{
 let s=setup();assert.equal((await s.handler(new Request(`https://site/api/download?id=${id}&start=-1`))).status,400);assert.equal(s.calls.length,0);
 s=setup({range:'bytes 100-103/104'});assert.equal((await s.handler(new Request(`https://site/api/download?id=${id}`))).status,502);
});
test('subsequent chunks request their offset',async()=>{
 const s=setup({range:'bytes 4194304-4194307/4194308'});const r=await s.handler(new Request(`https://site/api/download?id=${id}&start=4194304`));assert.equal(r.status,206);assert.equal(s.calls[0].options.headers.Range,'bytes=4194304-8388607');await r.arrayBuffer();
});
