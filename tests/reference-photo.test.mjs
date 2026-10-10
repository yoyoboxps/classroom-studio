import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const code=ts.transpileModule(readFileSync(new URL('../netlify/functions/_shared/provider.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,Buffer,require:()=>({HttpError,env:name=>({OPENAI_RESPONSE_MODEL:'gpt-5',OPENAI_IMAGE_MODEL:'gpt-image-2'})[name]})});
const {imagePayload,validatePhoto}=exports;
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,224]).toString('base64');
test('reference photo reaches the image provider alongside the user instructions',()=>{
 const payload=imagePayload('Keep the subject and change the background','3:2',validatePhoto(jpeg));
 assert.equal(payload.input[0].content[1].image_url,jpeg);
 assert.match(payload.input[0].content[0].text,/Keep the subject/);
 assert.equal(payload.tools[0].action,'edit');
 assert.equal(payload.tools[0].size,'1536x1024');
 assert.equal(payload.background,true);
});
test('text-only image generation remains available',()=>{
 const payload=imagePayload('A forest','1:1');
 assert.equal(typeof payload.input,'string');
 assert.equal(payload.tools[0].action,'generate');
});
test('all supported photo formats are accepted',()=>{
 const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
 const webp='data:image/webp;base64,'+Buffer.from('RIFF0000WEBP').toString('base64');
 for(const image of [jpeg,png,webp]) assert.equal(validatePhoto(image),image);
});
test('URLs, unsupported formats and spoofed photo content are rejected',()=>{
 for(const image of ['https://example.com/a.jpg','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=',null,''])assert.throws(()=>validatePhoto(image),e=>e.status===400);
});
test('decoded photo cannot exceed 3 MB, even if encoded length fits the body limit',()=>{
 const raw=Buffer.alloc(3*1024*1024+1);raw[0]=255;raw[1]=216;
 assert.throws(()=>validatePhoto('data:image/jpeg;base64,'+raw.toString('base64')),/3 MB/);
});
