/**
 * Pure TypeScript QR Code generator (Zero external dependencies).
 * Generates an SVG string encoding arbitrary strings (such as otpauth URIs).
 */

// GF(256) math for Reed-Solomon error correction
const GF_EXP: number[] = new Array(512);
const GF_LOG: number[] = new Array(256);

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsPolyGen(ecCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const nextPoly: number[] = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], GF_EXP[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCompute(data: number[], ecCount: number): number[] {
  const gen = rsPolyGen(ecCount);
  const res = new Array(ecCount).fill(0);

  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ res[0];
    res.shift();
    res.push(0);
    if (coef !== 0) {
      for (let j = 0; j < ecCount; j++) {
        res[j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res;
}

// QR Code Specifications (Versions 1-10, Error Correction Level L)
interface QRVersionSpec {
  version: number;
  totalCap: number; // in bytes
  dataCap: number; // in bytes
  ecCount: number;
  alignments: number[];
}

const QR_SPECS_L: QRVersionSpec[] = [
  { version: 1, totalCap: 26, dataCap: 19, ecCount: 7, alignments: [] },
  { version: 2, totalCap: 44, dataCap: 34, ecCount: 10, alignments: [6, 18] },
  { version: 3, totalCap: 70, dataCap: 55, ecCount: 15, alignments: [6, 22] },
  { version: 4, totalCap: 100, dataCap: 80, ecCount: 20, alignments: [6, 26] },
  { version: 5, totalCap: 134, dataCap: 108, ecCount: 26, alignments: [6, 30] },
  { version: 6, totalCap: 172, dataCap: 136, ecCount: 36, alignments: [6, 34] },
  { version: 7, totalCap: 196, dataCap: 156, ecCount: 40, alignments: [6, 22, 38] },
  { version: 8, totalCap: 242, dataCap: 194, ecCount: 48, alignments: [6, 24, 42] },
  { version: 9, totalCap: 292, dataCap: 232, ecCount: 56, alignments: [6, 26, 46] },
  { version: 10, totalCap: 346, dataCap: 274, ecCount: 72, alignments: [6, 28, 50] },
];

function selectVersion(dataLength: number): QRVersionSpec {
  for (const spec of QR_SPECS_L) {
    // Byte mode header: 4 bits, character count: 8 bits for V1-V9 -> 12 bits header (~2 bytes)
    if (dataLength + 3 <= spec.dataCap) {
      return spec;
    }
  }
  return QR_SPECS_L[QR_SPECS_L.length - 1];
}

class BitBuffer {
  private buffer: number[] = [];
  private length: number = 0;

  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  getBytes(): number[] {
    return this.buffer;
  }

  getLength(): number {
    return this.length;
  }
}

export function generateQrCodeSvg(text: string, size: number = 200): string {
  // Encode text to UTF-8 bytes
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(text);
  const dataLen = utf8Bytes.length;

  const spec = selectVersion(dataLen);
  const version = spec.version;
  const gridSize = version * 4 + 17;

  // 1. Bit Stream Construction
  const bb = new BitBuffer();
  // Byte mode indicator: 0100
  bb.put(0x4, 4);
  // Character count: 8 bits for versions 1..9, 16 bits for version >= 10
  bb.put(dataLen, version < 10 ? 8 : 16);
  for (let i = 0; i < dataLen; i++) {
    bb.put(utf8Bytes[i], 8);
  }

  // Terminator
  const totalDataBits = spec.dataCap * 8;
  const bitDiff = totalDataBits - bb.getLength();
  if (bitDiff > 0) {
    bb.put(0, Math.min(4, bitDiff));
  }

  // Align to byte boundary
  while (bb.getLength() % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes
  const dataBytes = bb.getBytes();
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < spec.dataCap) {
    dataBytes.push(padBytes[padIdx]);
    padIdx = (padIdx + 1) % 2;
  }

  // 2. Reed-Solomon EC Computation
  const ecBytes = rsCompute(dataBytes, spec.ecCount);
  const finalBytes = [...dataBytes, ...ecBytes];

  // 3. Matrix Construction
  const modules: (boolean | null)[][] = Array.from({ length: gridSize }, () =>
    new Array(gridSize).fill(null)
  );

  const isReserved = (r: number, c: number): boolean => modules[r][c] !== null;

  // Helper to draw Finder Pattern (7x7)
  const drawFinderPattern = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        if (
          dr >= 0 &&
          dr <= 6 &&
          dc >= 0 &&
          dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
        ) {
          modules[nr][nc] = true;
        } else {
          modules[nr][nc] = false;
        }
      }
    }
  };

  // Draw 3 Finder Patterns
  drawFinderPattern(0, 0);
  drawFinderPattern(0, gridSize - 7);
  drawFinderPattern(gridSize - 7, 0);

  // Alignment Patterns
  const alignPos = spec.alignments;
  for (let i = 0; i < alignPos.length; i++) {
    for (let j = 0; j < alignPos.length; j++) {
      const r = alignPos[i];
      const c = alignPos[j];
      if (isReserved(r, c)) continue;

      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBlack =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          modules[r + dr][c + dc] = isBlack;
        }
      }
    }
  }

  // Timing Patterns
  for (let i = 8; i < gridSize - 8; i++) {
    if (modules[6][i] === null) modules[6][i] = i % 2 === 0;
    if (modules[i][6] === null) modules[i][6] = i % 2 === 0;
  }

  // Dark module
  modules[4 * version + 9][8] = true;

  // Reserve Format Info Area
  for (let i = 0; i < 9; i++) {
    if (modules[8][i] === null) modules[8][i] = false;
    if (modules[i][8] === null) modules[i][8] = false;
    if (modules[8][gridSize - 1 - i] === null) modules[8][gridSize - 1 - i] = false;
    if (modules[gridSize - 1 - i][8] === null) modules[gridSize - 1 - i][8] = false;
  }

  // 4. Place Data Bits
  let bitIndex = 0;
  const getBit = (idx: number): boolean => {
    const byteIdx = Math.floor(idx / 8);
    const bitPos = 7 - (idx % 8);
    return byteIdx < finalBytes.length ? ((finalBytes[byteIdx] >> bitPos) & 1) === 1 : false;
  };

  let up = true;
  for (let right = gridSize - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column

    for (let vertical = 0; vertical < gridSize; vertical++) {
      const r = up ? gridSize - 1 - vertical : vertical;
      for (let col = 0; col < 2; col++) {
        const c = right - col;
        if (!isReserved(r, c)) {
          let dark = getBit(bitIndex++);
          // Mask 0: (row + col) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r][c] = dark;
        }
      }
    }
    up = !up;
  }

  // 5. Format Information (BCH 15,5 with Mask 0, EC L -> 01)
  // EC L = 01, Mask 0 = 000 -> 01000 = 8
  // BCH(15, 5) of 8 XOR 0x5412 = 0x7695
  const formatBits = 0x7695;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;

    // Top-left finder format bits
    if (i < 6) modules[8][i] = bit;
    else if (i === 6) modules[8][7] = bit;
    else if (i === 7) modules[8][8] = bit;
    else if (i === 8) modules[7][8] = bit;
    else modules[14 - i][8] = bit;

    // Split format bits (bottom-left and top-right finders)
    if (i < 7) modules[gridSize - 1 - i][8] = bit;
    else modules[8][gridSize - 15 + i] = bit;
  }

  // 6. Build SVG
  const quietZone = 4;
  const viewBoxSize = gridSize + quietZone * 2;
  const rects: string[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (modules[r][c] === true) {
        rects.push(
          `<rect x="${c + quietZone}" y="${r + quietZone}" width="1" height="1" fill="#000000" shape-rendering="crispEdges" />`
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges" class="w-full h-auto bg-white rounded-lg p-2 shadow-inner border border-slate-200 dark:border-slate-700"><rect x="0" y="0" width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff" shape-rendering="crispEdges" />${rects.join('')}</svg>`;
}

