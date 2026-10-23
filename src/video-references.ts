export type VideoAssetsState={first:string;last:string};
export type VideoUploadTarget='first'|'last';
export type VideoMention={name:string;url:string;key:string;role:string};
export function videoMentions(assets:VideoAssetsState):VideoMention[]{
 const photos=[...(assets.first?[{key:'first',role:'首幀',url:assets.first}]:[]),...(assets.last?[{key:'last',role:'結束幀',url:assets.last}]:[])];
 return photos.map((photo,index)=>({...photo,name:`image${index+1}`}));
}
export function mentionAtCaret(text:string,caret:number){
 const match=/@([^@\s，。、！？（）()]{0,20})$/.exec(text.slice(0,caret));
 return match?{start:caret-match[0].length,end:caret,query:match[1]}:null;
}
export function replaceVideoMentions(prompt:string,hasFirst:boolean,hasLast:boolean){
 if(/@已移除image\d+/.test(prompt))throw new Error('提示詞引用的照片已移除，請刪除該標記或重新選取照片。');
 return prompt.replace(/@(image[1-9]\d*|圖片[1-9]\d*|起始幀|最後幀)/g,(_token,name:string)=>{
  if(name==='起始幀'&&hasFirst)return '提供的首幀圖片';
  if(name==='最後幀'&&hasLast)return '提供的結束幀圖片';
  if(name==='image1'&&hasFirst)return '提供的首幀圖片';
  if(name==='image2'&&hasFirst&&hasLast)return '提供的結束幀圖片';
  throw new Error(`提示詞引用的 @${name} 不存在，請重新選取照片。`);
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
