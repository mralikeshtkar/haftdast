// Generates the PWA icons (PNG) without any image library: lapis rounded square,
// a gold-rimmed parchment card, and a brick-red heart. Run: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const FELT = [20, 43, 92]; // lapis background
const CREAM = [243, 231, 201]; // parchment card
const RED = [181, 69, 45]; // brick heart
const GOLD = [212, 166, 56];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Signed distance helpers (in normalised coordinates, -1..1). */
const roundedRect = (x, y, w, h, r) => {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const heart = (x, y) => {
  // classic implicit heart, scaled; negative inside
  const v = x * x + y * y - 1;
  return v * v * v - x * x * y * y * y;
};

function render(size, { maskable = false, bgRadius = 0.22 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const pad = maskable ? 0.8 : 1; // maskable icons keep content inside the safe zone
  const aa = 1.5 / size;
  const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 - 1;
      const y = ((j + 0.5) / size) * 2 - 1;
      let color = null;
      let alpha = 0;

      // Background
      const bg = maskable ? -1 : roundedRect(x, y, 1, 1, bgRadius);
      if (bg < aa) {
        alpha = Math.min(1, (aa - bg) / (2 * aa));
        color = FELT;
      }

      // Card (slightly rotated)
      const ang = -0.18;
      const cx = x * Math.cos(ang) - y * Math.sin(ang);
      const cy = x * Math.sin(ang) + y * Math.cos(ang);
      const card = roundedRect(cx / pad, cy / pad, 0.42, 0.58, 0.07);
      if (card < aa && color) {
        const t = Math.min(1, (aa - card) / (2 * aa));
        color = mix(color, CREAM, t);
      }

      // Gold rim on the card
      if (Math.abs(card + 0.035) < 0.012 && color) color = mix(color, GOLD, 0.9);

      // Heart in the centre of the card
      const hx = (cx / pad) * 3.4;
      const hy = -(cy / pad) * 3.4 + 0.1;
      if (heart(hx, hy) < 0 && color) color = RED;

      const o = (j * size + i) * 4;
      if (color) {
        px[o] = color[0];
        px[o + 1] = color[1];
        px[o + 2] = color[2];
        px[o + 3] = Math.round(alpha * 255);
      }
    }
  }
  return encodePng(size, size, px);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", render(192));
writeFileSync("public/icons/icon-512.png", render(512));
writeFileSync("public/icons/apple-touch-icon.png", render(180, { bgRadius: 0.0001 }));
writeFileSync("public/icons/maskable-512.png", render(512, { maskable: true }));
console.log("icons written to public/icons");
