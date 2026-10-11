import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('src/pagination.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('student pages hold 20 students with no duplicates or omissions',()=>{
 const students=Array.from({length:45},(_,i)=>i);
 const pages=[1,2,3].map(n=>exports.paginate(students,n));
 assert.deepEqual(pages.map(p=>p.items.length),[20,20,5]);
 assert.deepEqual(pages.flatMap(p=>p.items),students);
 assert.equal(pages[0].pages,3);
});
test('empty search results and a shorter refreshed roster clamp the current page',()=>{
 assert.equal(exports.paginate([],9).page,1);
 assert.equal(exports.paginate([],9).pages,1);
 assert.equal(exports.paginate(Array(20).fill(0),2).page,1);
 assert.equal(exports.paginate(Array(21).fill(0),2).items.length,1);
 assert.equal(exports.paginate(Array(40).fill(0),2).pages,2);
 assert.equal(exports.paginate(Array(41).fill(0),3).pages,3);
});
