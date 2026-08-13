import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const size = 256;
const rowBytes = size * 4;
const xorBytes = rowBytes * size;
const maskRowBytes = Math.ceil(size / 32) * 4;
const dibBytes = 40 + xorBytes + maskRowBytes * size;
const output = Buffer.alloc(6 + 16 + dibBytes);

output.writeUInt16LE(0, 0);
output.writeUInt16LE(1, 2);
output.writeUInt16LE(1, 4);
output[6] = 0;
output[7] = 0;
output.writeUInt16LE(1, 10);
output.writeUInt16LE(32, 12);
output.writeUInt32LE(dibBytes, 14);
output.writeUInt32LE(22, 18);

const dib = 22;
output.writeUInt32LE(40, dib);
output.writeInt32LE(size, dib + 4);
output.writeInt32LE(size * 2, dib + 8);
output.writeUInt16LE(1, dib + 12);
output.writeUInt16LE(32, dib + 14);
output.writeUInt32LE(0, dib + 16);
output.writeUInt32LE(xorBytes, dib + 20);
output.writeInt32LE(3780, dib + 24);
output.writeInt32LE(3780, dib + 28);

const pixelOffset = dib + 40;
const roundedSquare = (x, y) => {
  const left = 24;
  const top = 24;
  const right = 231;
  const bottom = 231;
  const radius = 48;
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

const distanceToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const edges = [
  [128, 62, 64, 98], [64, 98, 64, 166], [64, 166, 128, 202],
  [128, 202, 192, 166], [192, 166, 192, 98], [192, 98, 128, 62],
  [64, 98, 128, 134], [128, 134, 192, 98], [128, 134, 128, 178]
];

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    if (roundedSquare(x, y)) {
      const mix = (x + y) / (size * 2);
      red = Math.round(158 - 47 * mix);
      green = Math.round(183 - 39 * mix);
      blue = Math.round(255 - 13 * mix);
      alpha = 255;
      if (edges.some(([ax, ay, bx, by]) => distanceToSegment(x, y, ax, ay, bx, by) <= 5)) {
        red = 8;
        green = 16;
        blue = 30;
      }
    }
    const row = size - 1 - y;
    const offset = pixelOffset + row * rowBytes + x * 4;
    output[offset] = blue;
    output[offset + 1] = green;
    output[offset + 2] = red;
    output[offset + 3] = alpha;
  }
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const iconPath = resolve(scriptDirectory, "../apps/desktop/src-tauri/icons/icon.ico");
mkdirSync(dirname(iconPath), { recursive: true });
writeFileSync(iconPath, output);
console.log(iconPath);
