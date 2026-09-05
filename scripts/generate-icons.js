import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, getPixelRgba) {
  // getPixelRgba(x, y) returns [r, g, b, a]
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  }

  // CRC32 table
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return c ^ -1;
  }

  // IHDR chunk: width(4), height(4), bit depth(1), color type(1: 6=RGBA), comp(1:0), filter(1:0), interlace(1:0)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8 bits per channel
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // default filter
  ihdr[12] = 0; // no interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Icon generator with sleek OddsLens aesthetic:
// Dark circular lens background (#0F0F1A) with glowing cyan-purple gradient ring
// Inside: an ascending odds trend curve and glowing lens crosshair
function getOddsLensPixel(x, y, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  const maxR = width * 0.48;

  // Antialiasing factor
  if (r > maxR) {
    return [0, 0, 0, 0];
  }

  const normR = r / maxR;
  const normX = (x - cx) / maxR;
  const normY = (y - cy) / maxR;

  // Base circular glass dark gradient
  let bgR = 15;
  let bgG = 12;
  let bgB = 28;

  // Gradient tint (Cyan at top-left, Purple at bottom-right)
  const angle = Math.atan2(dy, dx);
  const glow = 0.5 + 0.5 * Math.cos(angle - 0.8);
  bgR += Math.floor(glow * 40);
  bgG += Math.floor(glow * 20);
  bgB += Math.floor(glow * 60);

  // Outer glowing ring (from normR 0.80 to 0.98)
  let ringAlpha = 0;
  if (normR >= 0.78 && normR <= 0.98) {
    const ringDist = Math.abs(normR - 0.88) / 0.10;
    ringAlpha = Math.max(0, 1 - ringDist);
  }

  // Odds curve (upward trending odds chart: a curved line from bottom-left to top-right)
  // y = -0.6 * x + 0.1 * x^2
  const curveY = -0.55 * normX + 0.15 * (normX * normX) - 0.05;
  const distToCurve = Math.abs(normY - curveY);
  let curveIntensity = 0;
  if (normX >= -0.65 && normX <= 0.65 && distToCurve < 0.18) {
    curveIntensity = Math.max(0, 1 - distToCurve / 0.18);
  }

  // Crosshair / focal lens lines (subtle cyan ticks)
  let tick = 0;
  if (Math.abs(normX) < 0.04 && Math.abs(normY) > 0.45 && Math.abs(normY) < 0.75) tick = 0.8;
  if (Math.abs(normY) < 0.04 && Math.abs(normX) > 0.45 && Math.abs(normX) < 0.75) tick = 0.8;

  // Composite colors
  let red = bgR;
  let green = bgG;
  let blue = bgB;
  let alpha = 255;

  // Antialias outer border
  if (r > maxR - 1.2) {
    alpha = Math.floor(255 * (maxR - r) / 1.2);
  }

  // Blend ring: Neon Cyan (#00E5FF) to Somnia Purple (#8A2BE2)
  if (ringAlpha > 0) {
    const ringR = Math.floor(0 + glow * 180);
    const ringG = Math.floor(229 - glow * 120);
    const ringB = 255;
    red = Math.floor(red * (1 - ringAlpha) + ringR * ringAlpha);
    green = Math.floor(green * (1 - ringAlpha) + ringG * ringAlpha);
    blue = Math.floor(blue * (1 - ringAlpha) + ringB * ringAlpha);
  }

  // Blend odds curve: Vivid Electric Green / Cyan pulse
  if (curveIntensity > 0) {
    const cR = 0;
    const cG = 255;
    const cB = 180;
    red = Math.floor(red * (1 - curveIntensity) + cR * curveIntensity);
    green = Math.floor(green * (1 - curveIntensity) + cG * curveIntensity);
    blue = Math.floor(blue * (1 - curveIntensity) + cB * curveIntensity);
  }

  // Blend ticks
  if (tick > 0) {
    red = Math.floor(red * (1 - tick) + 0 * tick);
    green = Math.floor(green * (1 - tick) + 240 * tick);
    blue = Math.floor(blue * (1 - tick) + 255 * tick);
  }

  return [Math.min(255, red), Math.min(255, green), Math.min(255, blue), Math.min(255, alpha)];
}

const iconsDir = path.resolve('d:/Projects/oddslens/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuf = createPng(size, size, getOddsLensPixel);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuf);
  console.log(`Generated ${filePath} (${size}x${size}, ${pngBuf.length} bytes)`);
});

// Also write an SVG version
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <radialGradient id="lensBg" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#1A1538" />
      <stop offset="70%" stop-color="#0E0B1F" />
      <stop offset="100%" stop-color="#070510" />
    </radialGradient>
    <linearGradient id="glowRing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00F0FF" />
      <stop offset="50%" stop-color="#7928CA" />
      <stop offset="100%" stop-color="#FF0080" />
    </linearGradient>
    <linearGradient id="trendCurve" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7928CA" />
      <stop offset="60%" stop-color="#00E5FF" />
      <stop offset="100%" stop-color="#00FF87" />
    </linearGradient>
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Base Circle -->
  <circle cx="64" cy="64" r="60" fill="url(#lensBg)" stroke="url(#glowRing)" stroke-width="3" />
  
  <!-- Inner Glass Ring -->
  <circle cx="64" cy="64" r="48" fill="none" stroke="rgba(0, 229, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 3" />

  <!-- Lens Crosshairs -->
  <line x1="64" y1="18" x2="64" y2="30" stroke="#00E5FF" stroke-width="2" stroke-linecap="round" />
  <line x1="64" y1="98" x2="64" y2="110" stroke="#00E5FF" stroke-width="2" stroke-linecap="round" />
  <line x1="18" y1="64" x2="30" y2="64" stroke="#00E5FF" stroke-width="2" stroke-linecap="round" />
  <line x1="98" y1="64" x2="110" y2="64" stroke="#00E5FF" stroke-width="2" stroke-linecap="round" />

  <!-- Upward Odds Trend Chart -->
  <path d="M 28 84 Q 46 80 58 64 T 100 36" fill="none" stroke="url(#trendCurve)" stroke-width="4" stroke-linecap="round" filter="url(#neonGlow)" />
  
  <!-- Odds Target Point / Spark -->
  <circle cx="100" cy="36" r="4.5" fill="#00FF87" filter="url(#neonGlow)" />
  <circle cx="100" cy="36" r="2" fill="#FFFFFF" />

  <!-- Odds Percentage Emblem Symbol -->
  <text x="64" y="96" text-anchor="middle" fill="#00E5FF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="13" letter-spacing="1.5">ODDSLENS</text>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);
console.log('Generated icon.svg');
