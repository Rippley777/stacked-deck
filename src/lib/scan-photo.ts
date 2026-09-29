import { MAX_SCAN_BYTES } from '../../shared/hardware-scan';

// Re-encode camera photos to reduce upload size and omit original EXIF metadata.
export async function prepareScanPhoto(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP photo. Export HEIC photos as JPEG first.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error('This photo could not be opened. Choose another image.');
    });
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this photo.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.88);
    if ((result.split(',')[1]?.length || 0) * 0.75 > MAX_SCAN_BYTES)
      throw new Error('This photo is too large to scan. Try a closer crop or a smaller photo.');
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
