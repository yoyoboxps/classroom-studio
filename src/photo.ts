const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'];

async function isHeif(file: File): Promise<boolean> {
  if (/\.(heic|heif)$/i.test(file.name) || /^image\/(heic|heif)(-sequence)?$/i.test(file.type)) return true;
  const header = new TextDecoder().decode(await file.slice(0, 64).arrayBuffer());
  return header.slice(4, 8) === 'ftyp' && HEIF_BRANDS.some(brand => header.slice(8).includes(brand));
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('照片無法讀取，請重新選擇照片。'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function jpeg(image: HTMLImageElement): Promise<Blob> {
  const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('照片處理失敗，請重新選擇照片。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.75, 0.6]) {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('照片處理失敗，請重新選擇照片。')), 'image/jpeg', quality);
      });
      if (blob.size <= MAX_OUTPUT_BYTES) return blob;
    }
    throw new Error('照片太大，請選擇另一張照片。');
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function preparePhoto(file: File): Promise<string> {
  if (!file.size) throw new Error('照片是空的，請重新選擇照片。');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('照片需小於 20 MB，請選擇另一張照片。');
  const heif = await isHeif(file);
  if (!heif && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('請選擇 HEIC、JPG、PNG 或 WebP 照片。');
  }
  let output: Blob = file;
  if (heif) {
    let image: HTMLImageElement;
    try {
      image = await loadImage(file);
    } catch {
      try {
        const { heicTo } = await import('heic-to/csp');
        const converted = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
        image = await loadImage(converted);
      } catch {
        throw new Error('這張 HEIC 照片無法處理，請重新選擇或換一張照片。');
      }
    }
    output = await jpeg(image);
  } else if (file.size > MAX_OUTPUT_BYTES) {
    output = await jpeg(await loadImage(file));
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('照片讀取失敗，請重新選擇。'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(output);
  });
}

export async function prepareVideoPhoto(source:string,ratio:string):Promise<string> {
  const [width,height]=ratio.split(':').map(Number);
  const image=await loadImage(await (await fetch(source)).blob());
  const target=width/height;
  const cropWidth=Math.min(image.naturalWidth,image.naturalHeight*target);
  const cropHeight=cropWidth/target;
  const scale=Math.min(1,2048/Math.max(cropWidth,cropHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(cropWidth*scale));
  canvas.height=Math.max(1,Math.round(cropHeight*scale));
  try {
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('照片裁切失敗，請重新選擇照片。');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,(image.naturalWidth-cropWidth)/2,(image.naturalHeight-cropHeight)/2,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
    for(const quality of [0.9,0.75,0.6]){
      const output=canvas.toDataURL('image/jpeg',quality);
      if(output.length<=4*MAX_OUTPUT_BYTES/3+32)return output;
    }
    throw new Error('照片太大，請選擇另一張照片。');
  } finally {canvas.width=canvas.height=1;}
}
