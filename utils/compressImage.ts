/**
 * Compress / resize an image data URL before uploading.
 * - Max dimension: 1600px (width or height)
 * - Output: JPEG at quality 0.75
 * - If the input is already small (< 300 KB), skip compression
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;
const SKIP_IF_UNDER = 300_000; // 300 KB

export function compressImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Skip if already small
    if (dataUrl.length < SKIP_IF_UNDER) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;

        // Only resize if over max dimension
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }

        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

        // Only use compressed if it's actually smaller
        if (compressed.length < dataUrl.length) {
          console.log(`Image compressed: ${(dataUrl.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB (${width}×${height})`);
          resolve(compressed);
        } else {
          resolve(dataUrl);
        }
      } catch (e) {
        console.warn('Compression failed, using original:', e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      console.warn('Could not load image for compression, using original');
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}
