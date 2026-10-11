import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const code=ts.transpileModule(readFileSync('netlify/functions/_shared/provider.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,Buffer,require:()=>({HttpError,env:()=> 'grok-imagine-video-1.5'})});
const photo='data:image/jpeg;base64,'+Buffer.from([255,216,255,224]).toString('base64');
test('Imagine receives the source photo, instructions and each selected video option',()=>{
 for(const duration of [6,10,15])for(const resolution of ['480p','720p'])for(const audio of [true,false]){
  const p=exports.videoPayload('Animate the subject',photo,{duration,resolution,audio});
  assert.equal(p.model,'grok-imagine-video-1.5');assert.equal(p.image.url,photo);
  assert.equal(p.prompt,'Animate the subject');assert.equal(p.duration,duration);
  assert.equal(p.resolution,resolution);assert.equal(p.generate_audio,audio);
  assert.equal(p.aspect_ratio,undefined);
 }
});
test('invalid settings and missing source photo are rejected before provider submission',()=>{
 for(const options of [{duration:30},{duration:'6'},{resolution:'1080p'},{audio:'false'}])assert.throws(()=>exports.videoPayload('Motion',photo,options),e=>e.status===400);
 assert.throws(()=>exports.videoPayload('Motion','',{}),e=>e.status===400);
});

test('text-to-video omits image and sends the selected ratio',()=>{
 for(const ratio of ['1:1','2:3','3:2','9:16','16:9']){const p=exports.videoPayload('Create an ocean scene',undefined,{ratio,duration:10,resolution:'720p',audio:false});assert.equal(p.image,undefined);assert.equal(p.aspect_ratio,ratio);assert.equal(p.generate_audio,false);}
 assert.throws(()=>exports.videoPayload('Scene',undefined,{ratio:'invalid'}),e=>e.status===400);
});
