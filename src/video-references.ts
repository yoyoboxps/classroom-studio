export type VideoReference={id:string;name:string;url:string};
export type VideoAssetsState={first:string;last:string;references:VideoReference[]};
export type VideoUploadTarget='first'|'last'|'references';
export type VideoMention={name:string;url:string;key:string;role:string};
export function videoMentions(assets:VideoAssetsState):VideoMention[]{
 const photos=[...(assets.first?[{key:'first',role:'起始幀',url:assets.first}]:[]),...assets.references.map(r=>({key:r.id,role:'參考照片',url:r.url})),...(assets.last?[{key:'last',role:'最後幀',url:assets.last}]:[])];
 return photos.map((photo,index)=>({...photo,name:`image${index+1}`}));
}
export function mentionAtCaret(text:string,caret:number){
 const match=/@([^@\s，。、！？（）()]{0,20})$/.exec(text.slice(0,caret));
 return match?{start:caret-match[0].length,end:caret,query:match[1]}:null;
}
export function replaceVideoMentions(prompt:string,names:string[],hasFirst:boolean,hasLast:boolean){
 if(/@已移除image\d+/.test(prompt))throw new Error('提示詞引用的照片已移除，請刪除該標記或重新選取照片。');
 return prompt.replace(/@(image[1-9]\d*|圖片[1-9]\d*|起始幀|最後幀)/g,(_token,name:string)=>{
  if(name.startsWith('image')){
   const position=Number(name.slice(5))-1;
   if(position<0||position>=names.length+Number(hasFirst)+Number(hasLast))throw new Error(`提示詞引用的 @${name} 不存在，請重新選取照片。`);
   if(hasLast&&position===names.length+Number(hasFirst))return '提供的最後幀圖片';
   if(hasFirst&&position===0&&!names.length)return '提供的起始幀圖片';
   return `<IMAGE_${position}>`;
  }
  if(name==='起始幀'){if(!hasFirst)throw new Error('提示詞引用的起始幀已移除，請重新選取照片。');return names.length?'<IMAGE_0>':'提供的起始幀圖片';}
  if(name==='最後幀'){if(!hasLast)throw new Error('提示詞引用的最後幀已移除，請重新選取照片。');return '提供的最後幀圖片';}
  const index=names.indexOf(name);if(index<0)throw new Error(`提示詞引用的 @${name} 已移除，請重新選取照片。`);
  return `<IMAGE_${index+(hasFirst?1:0)}>`;
 });
}
export function remapVideoMentions(prompt:string,before:VideoAssetsState,after:VideoAssetsState){
 const oldPhotos=videoMentions(before),newPhotos=videoMentions(after);
 return prompt.replace(/@image[1-9]\d*/g,token=>{
  const old=oldPhotos.find(p=>`@${p.name}`===token);if(!old)return token;
  const next=newPhotos.find(p=>p.key===old.key);
  return next?`@${next.name}`:`@已移除${old.name}`;
 });
}
