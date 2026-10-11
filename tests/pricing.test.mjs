import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('src/pricing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('frontend and server share the exact classroom pricing table',()=>{
 assert.equal(exports.generationCost('image'),5);
 for(const [r,d,c] of [['480p',6,25],['480p',10,40],['480p',15,60],['720p',6,40],['720p',10,70],['720p',15,100]])assert.equal(exports.generationCost('video',d,r),c);
 for(const [d,r] of [[30,'720p'],['6','480p'],[6,'1080p']])assert.throws(()=>exports.generationCost('video',d,r));
});
