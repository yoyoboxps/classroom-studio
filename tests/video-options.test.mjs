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

test('first and last frames and references are sent separately with correct mention offsets',()=>{
 const p=exports.videoPayload('讓 @圖片3 的人物從 @起始幀 走向 @最後幀',photo,{lastFrame:photo,references:[{name:'圖片3',image:photo}],duration:10,resolution:'720p',audio:false});
 assert.equal(p.image.url,photo);assert.equal(p.last_frame.url,photo);assert.equal(p.reference_images[0].url,photo);
 assert.match(p.prompt,/<IMAGE_1>/);assert.match(p.prompt,/<IMAGE_0>/);assert.match(p.prompt,/提供的最後幀圖片/);
 assert.equal(p.duration,10);assert.equal(p.resolution,'720p');assert.equal(p.generate_audio,false);assert.equal(p.aspect_ratio,undefined);
});
test('references without a first frame start at IMAGE_0 and preserve stable names after removal',()=>{
 const p=exports.videoPayload('讓 @圖片3 出現在 @圖片7 的場景',undefined,{references:[{name:'圖片3',image:photo},{name:'圖片7',image:photo}],ratio:'16:9'});
 assert.equal(p.prompt,'讓 <IMAGE_0> 出現在 <IMAGE_1> 的場景');assert.equal(p.image,undefined);assert.equal(p.aspect_ratio,'16:9');
 assert.throws(()=>exports.videoPayload('@圖片1',undefined,{references:[{name:'圖片3',image:photo}]}),/已移除/);
 assert.throws(()=>exports.videoPayload('@起始幀',undefined,{}),/起始幀已移除/);
 assert.throws(()=>exports.videoPayload('@最後幀',photo,{}),/最後幀已移除/);
});
test('bad reference payloads and unavailable models fail before provider submission',()=>{
 for(const references of [null,{},[null],[{name:'人物',image:photo}],[{name:'圖片1',image:'https://example.com/x.jpg'}],Array(6).fill({name:'圖片1',image:photo}),[{name:'圖片1',image:photo},{name:'圖片1',image:photo}]])assert.throws(()=>exports.videoPayload('motion',photo,{references}));
 assert.throws(()=>exports.videoPayload('motion',photo,{lastFrame:'https://example.com/x.jpg'}));
 videoModel='grok-imagine-video';try{assert.throws(()=>exports.videoPayload('motion',photo,{lastFrame:photo}),e=>e.status===503);}finally{videoModel='grok-imagine-video-1.5';}
});
test('combined video photo size fits the existing request limit',()=>{
 const raw=Buffer.alloc(1100*1024);raw[0]=255;raw[1]=216;const big='data:image/jpeg;base64,'+raw.toString('base64');
 assert.throws(()=>exports.videoPayload('motion',big,{lastFrame:big,references:[{name:'圖片1',image:big}]}),e=>e.status===413);
});
test('mention discovery supports Chinese text, caret in middle and completed selections',()=>{
 assert.equal(mentionExports.mentionAtCaret('讓@圖片',4).query,'圖片');
 assert.equal(mentionExports.mentionAtCaret('讓@圖片3 走路',5).start,1);
 assert.equal(mentionExports.mentionAtCaret('讓@圖片3 走路',8),null);
 assert.equal(mentionExports.mentionAtCaret('hello',5),null);
 assert.equal(mentionExports.replaceVideoMentions('@圖片1 和 @圖片10',['圖片1','圖片10'],false,false),'<IMAGE_0> 和 <IMAGE_1>');
});

test('official-style aliases map first, references and last to their real inputs',()=>{
 const p=exports.videoPayload('@image1 / @image2 / @image3',photo,{lastFrame:photo,references:[{name:'圖片9',image:photo}]});
 assert.equal(p.prompt,'<IMAGE_0> / <IMAGE_1> / 提供的最後幀圖片');
 assert.equal(exports.videoPayload('@image1',photo,{}).prompt,'提供的起始幀圖片');
 assert.equal(exports.videoPayload('@image1',undefined,{references:[{name:'圖片9',image:photo}]}).prompt,'<IMAGE_0>');
 assert.throws(()=>exports.videoPayload('@image2',photo,{}),/不存在/);
 assert.throws(()=>exports.videoPayload('@已移除image1',photo,{}),/已移除/);
});
test('photo aliases follow their original assets when uploads or removals change numbering',()=>{
 const before={first:'first.jpg',last:'last.jpg',references:[{id:'a',name:'圖片1',url:'a.jpg'},{id:'b',name:'圖片2',url:'b.jpg'}]};
 const after={...before,references:[before.references[1]]};
 assert.equal(mentionExports.remapVideoMentions('@image1 @image2 @image3 @image4',before,after),'@image1 @已移除image2 @image2 @image3');
 const added={...before,references:[...before.references,{id:'c',name:'圖片3',url:'c.jpg'}]};
 assert.equal(mentionExports.remapVideoMentions('@image4',before,added),'@image5');
 assert.deepEqual(Array.from(mentionExports.videoMentions(after),m=>m.name),['image1','image2','image3']);
});
