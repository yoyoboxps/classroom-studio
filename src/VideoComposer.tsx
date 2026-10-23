import {useRef,useState} from 'react';
import {Plus,X} from 'lucide-react';
import {mentionAtCaret,videoMentions,type VideoAssetsState,type VideoUploadTarget} from './video-references';
const accept='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export function VideoAssets({assets,disabled,onUpload,onRemove,onFirstLoad}:{assets:VideoAssetsState;disabled:boolean;onUpload:(files:File[],target:VideoUploadTarget)=>void;onRemove:(target:VideoUploadTarget,id?:string)=>void;onFirstLoad:(ratio:string)=>void}){
 const first=useRef<HTMLInputElement>(null),last=useRef<HTMLInputElement>(null),references=useRef<HTMLInputElement>(null);
 const input=(target:VideoUploadTarget,ref:typeof first,multiple=false)=><input className="composer-file" aria-label={target==='first'?'上傳起始幀':target==='last'?'上傳最後幀':'上傳影片參考照片'} ref={ref} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={e=>{onUpload(Array.from(e.currentTarget.files||[]),target);e.currentTarget.value='';}}/>;
 const mentions=videoMentions(assets);
 const card=(url:string,name:string,target:VideoUploadTarget,id?:string)=><div className="video-asset" key={id||target}><img src={url} alt={name} onLoad={target==='first'?e=>onFirstLoad(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`):undefined}/><button type="button" className="video-asset-remove" disabled={disabled} aria-label={`移除${name}`} onClick={()=>onRemove(target,id)}><X size={14}/></button><span>@{mentions.find(m=>m.key===(id||target))?.name}<small>{mentions.find(m=>m.key===(id||target))?.role}</small></span></div>;
 return <div className="video-assets">
  {input('first',first)}{input('last',last)}{input('references',references,true)}
  <div className="video-frame-list" aria-label="影片畫面素材">
   {assets.first?card(assets.first,'起始幀','first'):<button type="button" className="video-asset-add" disabled={disabled} onClick={()=>first.current?.click()}><Plus size={19}/>新增起始幀</button>}
   {assets.references.map(r=>card(r.url,r.name,'references',r.id))}
   {assets.first&&(assets.last?card(assets.last,'最後幀','last'):<button type="button" className="video-asset-add" disabled={disabled} onClick={()=>last.current?.click()}><Plus size={19}/>新增最後幀</button>)}
   <button type="button" className="video-asset-add" disabled={disabled||assets.references.length>=5} onClick={()=>references.current?.click()}><Plus size={19}/>參考照片<span>{assets.references.length} / 5</span></button>
  </div>
 </div>;
}
export function VideoPrompt({assets,value,onChange,disabled}:{assets:VideoAssetsState;value:string;onChange:(value:string)=>void;disabled:boolean}){
 const input=useRef<HTMLTextAreaElement>(null);
 const [mention,setMention]=useState<ReturnType<typeof mentionAtCaret>>(null),[active,setActive]=useState(0);
 const all=videoMentions(assets),options=all.filter(m=>m.name.includes(mention?.query||''));
 function inspect(text:string,caret:number){setMention(mentionAtCaret(text,caret));setActive(0);}
 function select(name:string){const start=mention?.start??input.current?.selectionStart??value.length,end=mention?.end??start;const inserted=`@${name} `;const next=value.slice(0,start)+inserted+value.slice(end);if(next.length>2000)return;onChange(next);setMention(null);requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(start+inserted.length,start+inserted.length);});}
 function open(){const start=input.current?.selectionStart??value.length,end=input.current?.selectionEnd??start;const next=value.slice(0,start)+'@'+value.slice(end);if(next.length>2000)return;onChange(next);setMention({start,end:start+1,query:''});setActive(0);requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(start+1,start+1);});}
 return <div className="video-prompt-area">
  <textarea className="composer-prompt" id="prompt" ref={input} aria-label="動作描述" aria-controls={mention?'video-mention-list':undefined} aria-expanded={!!mention} aria-autocomplete="list" aria-activedescendant={mention&&options.length?`video-mention-${Math.min(active,options.length-1)}`:undefined} value={value} maxLength={2000} disabled={disabled} placeholder="描述影片內容，輸入 @ 引用照片…" onChange={e=>{onChange(e.target.value);inspect(e.target.value,e.target.selectionStart);}} onClick={e=>inspect(value,e.currentTarget.selectionStart)} onKeyDown={e=>{if(e.nativeEvent.isComposing||!mention)return;if(e.key==='Escape'){setMention(null);e.preventDefault();}else if(options.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setActive(n=>(n+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);}else if(e.key==='Enter'&&options.length){e.preventDefault();select(options[Math.min(active,options.length-1)].name);}}}/>
  {mention&&<div className="video-mention-menu" id="video-mention-list" role="listbox" aria-label="選擇引用照片">{options.map((m,i)=><button type="button" role="option" id={`video-mention-${i}`} aria-selected={i===Math.min(active,options.length-1)} key={m.name} onMouseDown={e=>e.preventDefault()} onClick={()=>select(m.name)}><img src={m.url} alt=""/><span>@{m.name}<small>{m.role}</small></span></button>)}{!options.length&&<p>{all.length?'沒有符合的照片':'請先上傳起始幀或參考照片。'}</p>}</div>}
  <button type="button" className="mention-open" disabled={disabled} onClick={open}>@ 引用照片</button>
 </div>;
}
