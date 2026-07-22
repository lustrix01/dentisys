/**
 * Helper utility to calculate TOTP codes directly in browser for development convenience.
 * Complies with RFC 6238 and RFC 4648 standards matching PHP backend/app/mfa.php.
 */

export function base32Decode(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) {
      throw new Error(`Invalid Base32 character: ${clean[i]}`);
    }
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
      value = value & ((1 << bits) - 1);
    }
  }

  return new Uint8Array(bytes);
}

export function generateBase32Secret(length = 32): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = new Uint8Array(length);
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
  if (cryptoObj && cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += alphabet[randomBytes[i] % alphabet.length];
  }
  return secret;
}

export async function computeTotpCode(base32Secret: string, step: number, digits = 6): Promise<string> {
  const keyBytes = base32Decode(base32Secret);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setUint32(0, 0, false);
  counterView.setUint32(4, step, false);

  const keyBuffer = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const subtle = cryptoObj.subtle;

  const key = await subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await subtle.sign('HMAC', key, counterBuffer);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const mod = 10 ** digits;
  return (binary % mod).toString().padStart(digits, '0');
}

export async function generateTotpCode(base32Secret: string): Promise<string> {
  const step = Math.floor(Date.now() / 1000 / 30);
  return computeTotpCode(base32Secret, step);
}

export async function verifyTotpCode(
  base32Secret: string,
  userCode: string,
  period = 30,
  windowWidth = 2,
  digits = 6
): Promise<boolean> {
  const currentStep = Math.floor(Date.now() / 1000 / period);
  const cleanCode = userCode.replace(/\D/g, '');

  if (cleanCode.length !== digits) {
    return false;
  }

  for (let offset = -windowWidth; offset <= windowWidth; offset++) {
    const candidate = await computeTotpCode(base32Secret, currentStep + offset, digits);
    if (candidate === cleanCode) {
      return true;
    }
  }
  return false;
}

