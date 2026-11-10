// Rasterises the 12 face cards (jack/queen/king) from their very heavy SVG sources
// (0.4–1.1 MB each) into small WebP files for the game.
//   sources: assets/card-faces/*.svg   (not served)
//   output:  public/cards/*.webp       (committed)
// Run: node scripts/gen-face-webp.mjs
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SRC = "assets/card-faces";
const OUT = "public/cards";
// Cards are shown at most ~100 CSS px wide; 400 px keeps them crisp on 3x phone screens.
const WIDTH = 400;

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".svg")).sort()) {
  const out = join(OUT, file.replace(/\.svg$/, ".webp"));
  await sharp(join(SRC, file), { density: 300 })
    .resize({ width: WIDTH })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 80, effort: 6 })
    .toFile(out);
  const size = statSync(out).size;
  total += size;
  console.log(`${file.padEnd(24)} -> ${(size / 1024).toFixed(1)} KB`);
}
console.log(`total: ${(total / 1024).toFixed(0)} KB`);
