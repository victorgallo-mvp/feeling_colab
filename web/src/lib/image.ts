/** Lê o arquivo, recorta ao quadrado pelo centro e reduz para 512px. Sai como JPEG pra upload leve. */
export async function squareCrop(file: File, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('Não consegui abrir a imagem')); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(size, side);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, err) => canvas.toBlob((b) => (b ? ok(b) : err(new Error('Falha ao processar'))), 'image/jpeg', 0.9));
  } finally { URL.revokeObjectURL(url); }
}
