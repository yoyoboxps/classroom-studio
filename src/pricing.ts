export const IMAGE_CREDITS=5;
export const VIDEO_CREDITS:Record<string,Record<number,number>>={'480p':{6:25,10:40,15:60},'720p':{6:40,10:70,15:100}};
export function generationCost(kind:string,duration:unknown=6,resolution:unknown='480p'){
 if(kind==='image')return IMAGE_CREDITS;
 if(kind!=='video'||typeof duration!=='number'||typeof resolution!=='string'||!VIDEO_CREDITS[resolution]?.[duration])throw new Error('影片設定不正確，請重新選擇。');
 return VIDEO_CREDITS[resolution][duration];
}
