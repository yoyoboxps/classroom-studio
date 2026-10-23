export type VideoReference={id:string;name:string;url:string};
export type VideoAssetsState={first:string;last:string;references:VideoReference[]};
export type VideoUploadTarget='first'|'last'|'references';
export type VideoMention={name:string;url:string};
export function videoMentions(assets:VideoAssetsState):VideoMention[]{
 return [...(assets.first?[{name:'起始幀',url:assets.first}]:[]),...assets.references.map(r=>({name:r.name,url:r.url})),...(assets.last?[{name:'最後幀',url:assets.last}]:[])];
}
export function mentionAtCaret(text:string,caret:number){
 const match=/@([^@\s，。、！？（）()]{0,20})$/.exec(text.slice(0,caret));
 return match?{start:caret-match[0].length,end:caret,query:match[1]}:null;
}
export function replaceVideoMentions(prompt:string,names:string[],hasFirst:boolean,hasLast:boolean){
 return prompt.replace(/@(圖片[1-9]\d*|起始幀|最後幀)/g,(_token,name:string)=>{
  if(name==='起始幀'){if(!hasFirst)throw new Error('提示詞引用的起始幀已移除，請重新選取照片。');return names.length?'<IMAGE_0>':'提供的起始幀圖片';}
  if(name==='最後幀'){if(!hasLast)throw new Error('提示詞引用的最後幀已移除，請重新選取照片。');return '提供的最後幀圖片';}
  const index=names.indexOf(name);if(index<0)throw new Error(`提示詞引用的 @${name} 已移除，請重新選取照片。`);
  return `<IMAGE_${index+(hasFirst?1:0)}>`;
 });
}
