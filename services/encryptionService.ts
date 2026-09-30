import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a string using AES-256-GCM.
 * Key is derived via SHA-256 to guarantee exactly 32 bytes (256-bit).
 */
export function encryptToken(text: string): string {
  if (!text) return '';
  try {
    const keyBase = process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
    const key = crypto.createHash('sha256').update(keyBase).digest();

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
  } catch (err) {
    console.error("Encryption failed:", err);
    return '';
  }
}

/**
 * Checks if a string matches the encrypted AES-GCM format (iv:tag:ciphertext).
 */
export function isEncrypted(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  if (parts.length !== 3) return false;
  const hexRegex = /^[0-9a-fA-F]+$/;
  return (
    parts[0].length === 24 && hexRegex.test(parts[0]) &&
    parts[1].length === 32 && hexRegex.test(parts[1]) &&
    hexRegex.test(parts[2])
  );
}

/**
 * Decrypts an AES-256-GCM encrypted string, returning the original plaintext.
 * Tries the SHA-256 derived key first, falling back to the old substring key.
 * If the input is unencrypted, returns it as-is.
 * If the input is in encrypted format but cannot be authenticated with current keys,
 * returns an empty string to avoid passing raw ciphertext to downstream consumers.
 */
export function decryptToken(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Not in our format, return unencrypted text
      return encryptedText;
    }

    const ivHex = parts[0];
    const tagHex = parts[1];
    const encryptedHex = parts[2];

    // Validate that parts are actually hex strings of the expected lengths for AES-GCM
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (
      ivHex.length !== 24 || !hexRegex.test(ivHex) ||
      tagHex.length !== 32 || !hexRegex.test(tagHex) ||
      !hexRegex.test(encryptedHex)
    ) {
      // Not in our encrypted format, return as-is
      return encryptedText;
    }

    // 1. Try decrypting with robust SHA-256 key
    try {
      const keyBase = process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const key = crypto.createHash('sha256').update(keyBase).digest();

      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const encrypted = encryptedHex;
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (shaErr) {
      // 2. Fallback to old substring key for backward compatibility
      try {
        const keyBase = process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
        let oldKeyStr = keyBase.substring(0, 32);
        if (oldKeyStr.length < 32) {
          oldKeyStr = oldKeyStr.padEnd(32, '0');
        }
        const key = Buffer.from(oldKeyStr);

        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const encrypted = encryptedHex;
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (fallbackErr) {
        // Both decryption attempts failed to authenticate.
        // Returning ciphertext here was causing callers (like Slack/Jira) to treat hex ciphertext as URLs/tokens.
        console.warn("decryptToken: ciphertext failed to authenticate with current encryption keys; returning empty string.");
        return '';
      }
    }
  } catch (err) {
    console.warn("Decryption error:", err);
    return '';
  }
}

