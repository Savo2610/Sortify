const cache = new Map<string, string>();

/**
 * Extract a vivid, readable accent colour from an album cover.
 * Falls back to null if the image can't be read (e.g. CORS).
 */
export function dominantColor(url: string): Promise<string | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let best = { score: -1, r: 120, g: 100, b: 255 };
        let sr = 0,
          sg = 0,
          sb = 0,
          n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const max = Math.max(r, g, b),
            min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const light = (max + min) / 510;
          sr += r;
          sg += g;
          sb += b;
          n++;
          // prefer saturated, mid-light pixels
          const score = sat * (1 - Math.abs(light - 0.55) * 1.6);
          if (score > best.score) best = { score, r, g, b };
        }
        let { r, g, b } = best;
        if (best.score < 0.15) {
          r = sr / n;
          g = sg / n;
          b = sb / n;
        }
        const color = toReadable(r, g, b);
        cache.set(url, color);
        resolve(color);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function toReadable(r: number, g: number, b: number): string {
  // convert to HSL and clamp lightness/saturation so it glows nicely on dark bg
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const sat = Math.min(85, Math.max(s * 100, 35));
  const light = Math.min(68, Math.max(l * 100, 55));
  return `hsl(${Math.round(h)} ${Math.round(sat)}% ${Math.round(light)}%)`;
}
