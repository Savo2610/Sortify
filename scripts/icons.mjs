// Erzeugt die PNG-Icons aus derselben Geometrie wie public/icon.svg,
// ohne zusätzliche Abhängigkeit: node scripts/icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [8, 10, 8];
const GREEN = [47, 224, 117];
const BARS = [
  { x: 14, y: 17, w: 36, h: 7, a: 1 },
  { x: 14, y: 28.5, w: 26, h: 7, a: 0.75 },
  { x: 14, y: 40, w: 16, h: 7, a: 0.5 },
];

function inRounded(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function crc32(buf) {
  let c, crc = -1;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// scale < 1 lässt Rand für maskierbare Icons; corner = Eckenradius des Grunds.
function render(size, { scale = 1, corner = 12 } = {}) {
  const SS = 3;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = ((x + (sx + 0.5) / SS) / size) * 64;
        const v = ((y + (sy + 0.5) / SS) / size) * 64;
        if (!inRounded(u, v, 0, 0, 64, 64, corner)) continue;
        const iu = (u - 32) / scale + 32, iv = (v - 32) / scale + 32;
        let col = BG;
        for (const bar of BARS) {
          if (inRounded(iu, iv, bar.x, bar.y, bar.w, bar.h, 2)) {
            col = GREEN.map((c, i) => c * bar.a + BG[i] * (1 - bar.a));
          }
        }
        r += col[0]; g += col[1]; b += col[2]; a += 255;
      }
      const n = SS * SS, o = y * (size * 4 + 1) + 1 + x * 4, cov = a / 255 || 1;
      raw[o] = r / cov; raw[o + 1] = g / cov; raw[o + 2] = b / cov; raw[o + 3] = a / n;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync("public/icon-192.png", render(192));
writeFileSync("public/icon-512.png", render(512));
writeFileSync("public/icon-180.png", render(180, { corner: 0 }));
writeFileSync("public/icon-maskable-512.png", render(512, { scale: 0.72, corner: 0 }));
