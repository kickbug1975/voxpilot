import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

if (!process.env.APP_ENCRYPTION_KEY) {
  throw new Error("CRITICAL: APP_ENCRYPTION_KEY is not defined in environment variables.");
}
const ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;
const IV_LENGTH = 16; // AES IV length is 16 bytes

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  try {
    const textParts = text.split(':');
    const ivHex = textParts.shift();
    if (!ivHex) throw new Error('Invalid encrypted format.');
    
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('Failed to decrypt text:', err);
    return ''; // Return empty string or throw error depending on design
  }
}
