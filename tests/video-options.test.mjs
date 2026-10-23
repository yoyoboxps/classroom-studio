import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={},mentionExports={};
let videoModel='grok-imagine-video-1.5';
vm.runInNewContext(ts.transpileModule(readFileSync('src/video-references.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mentionExports});
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const code=ts.transpileModule(readFileSync('netlify/functions/_shared/provider.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,Buffer,require:name=>name.includes('video-references')?mentionExports:({HttpError,env:()=>videoModel})});
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


test('first and last frames use only image and last_frame, with official-style aliases',()=>{
 const p=exports.videoPayload('從 @image1 轉換至 @image2',photo,{lastFrame:photo,duration:10,resolution:'720p',audio:false});
 assert.equal(p.image.url,photo);assert.equal(p.last_frame.url,photo);assert.equal(p.reference_images,undefined);
 assert.equal(p.prompt,'從 提供的首幀圖片 轉換至 提供的結束幀圖片');
 assert.equal(p.duration,10);assert.equal(p.resolution,'720p');assert.equal(p.generate_audio,false);assert.equal(p.aspect_ratio,undefined);
});
test('extra photos, missing first frame and missing aliases fail before provider submission',()=>{
 for(const references of [[],null,{},[{name:'圖片1',image:photo}],Array(5).fill({image:photo})])assert.throws(()=>exports.videoPayload('motion',photo,{references}),e=>e.status===400);
 assert.throws(()=>exports.videoPayload('motion',undefined,{lastFrame:photo}),e=>e.status===400);
 assert.throws(()=>exports.videoPayload('@image2',photo,{}),/不存在/);
 assert.throws(()=>exports.videoPayload('@image3',photo,{lastFrame:photo}),/不存在/);
 assert.throws(()=>exports.videoPayload('@image1',undefined,{}),/不存在/);
 assert.throws(()=>exports.videoPayload('@已移除image2',photo,{}),/已移除/);
 assert.throws(()=>exports.videoPayload('motion',photo,{lastFrame:'https://example.com/x.jpg'}));
 videoModel='grok-imagine-video';try{assert.throws(()=>exports.videoPayload('motion',photo,{lastFrame:photo}),e=>e.status===503);}finally{videoModel='grok-imagine-video-1.5';}
});
test('frame photos remain subject to combined request limits',()=>{
 const raw=Buffer.alloc(1600*1024);raw[0]=255;raw[1]=216;const big='data:image/jpeg;base64,'+raw.toString('base64');
 assert.throws(()=>exports.videoPayload('motion',big,{lastFrame:big}),e=>e.status===413);
});
test('only two frame mentions are offered and removed frames never point at another photo',()=>{
 const before={first:'first.jpg',last:'last.jpg'},after={first:'first.jpg',last:''};
 assert.deepEqual(Array.from(mentionExports.videoMentions(before),m=>m.name),['image1','image2']);
 assert.equal(mentionExports.remapVideoMentions('@image1 @image2',before,after),'@image1 @已移除image2');
 assert.equal(mentionExports.mentionAtCaret('use @image',10).query,'image');
});
