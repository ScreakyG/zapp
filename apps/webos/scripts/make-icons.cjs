// Generates the webOS launcher icons (a white "Z" on the Graphite background) without any image
// tool: a tiny PNG encoder over zlib. Run once; the PNGs are committed.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [11, 11, 13, 255];
const INK = [244, 244, 246, 255];
/** A bold "Z": top bar, bottom bar, and the diagonal between them. */
function z(u, v) {
  const inside = u > 0.24 && u < 0.76 && v > 0.24 && v < 0.76;
  if (!inside) return BG;
  if (v < 0.36 || v > 0.64) return INK;
  const diagonal = 0.76 - ((v - 0.36) / 0.28) * 0.52; // x of the stroke's right edge
  return u < diagonal && u > diagonal - 0.16 ? INK : BG;
}

const out = path.join(__dirname, '..', 'app');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png(80, z));
fs.writeFileSync(path.join(out, 'largeIcon.png'), png(130, z));
console.log('icons written');
