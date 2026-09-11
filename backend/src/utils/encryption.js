import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const PREFIX = 'enc:v1:';

/**
 * Resolves all valid candidate 256-bit (32-byte) keys for AES-256-GCM.
 * Prioritizes process.env.FIELD_ENCRYPTION_KEY, with automatic fallback
 * to derived keys from JWT_SECRET to seamlessly decrypt records created
 * across key rotations or environment transitions without data loss.
 */
export function getCandidateKeys() {
  const keys = [];

  // 1. Primary key from FIELD_ENCRYPTION_KEY
  const envKey = process.env.FIELD_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      keys.push(Buffer.from(envKey, 'hex'));
    } else if (Buffer.byteLength(envKey, 'utf8') === 32) {
      keys.push(Buffer.from(envKey, 'utf8'));
    } else {
      keys.push(crypto.createHash('sha256').update(envKey).digest());
    }
  }

  // 2. Candidate Fallback from JWT_SECRET salt (used during initial provisioning)
  const jwtSecret = process.env.JWT_SECRET || 'production_jwt_super_secret_key_change_in_production_min_32_chars';
  keys.push(crypto.createHash('sha256').update(`medsafe-fle-salt:${jwtSecret}`).digest());

  // 3. Fallback default dev salt
  keys.push(crypto.createHash('sha256').update('medsafe-fle-salt:medsafe-health-data-fle-key-default-salt-2026').digest());

  return keys;
}

export function getEncryptionKey() {
  return getCandidateKeys()[0];
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Generates a fresh 16-byte random IV per operation (IND-CPA semantic security).
 * Produces a 16-byte authentication tag (IND-CCA2 integrity protection).
 *
 * Stored format: enc:v1:<ivHex>:<authTagHex>:<ciphertextHex>
 */
export function encryptField(plainText) {
  if (plainText === null || plainText === undefined || typeof plainText !== 'string') {
    return plainText;
  }

  // Do not double-encrypt
  if (plainText.startsWith(PREFIX)) {
    return plainText;
  }

  // Preserve empty strings without bloat
  if (plainText.trim() === '') {
    return plainText;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');

    return `${PREFIX}${ivHex}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[FieldEncryption] Encryption error:', err.message);
    throw new Error('Failed to encrypt sensitive health field at rest.');
  }
}

/**
 * Decrypts an AES-256-GCM ciphertext string.
 * Supports multi-key candidate rotation.
 * 
 * CRITICAL SECURITY GUARANTEE:
 * Never returns raw ciphertext `enc:v1:...` to user-facing or API contexts.
 * If all keys fail, returns an empty string to prevent HIPAA/PHI leaks.
 */
export function decryptField(cipherText) {
  if (cipherText === null || cipherText === undefined || typeof cipherText !== 'string') {
    return cipherText;
  }

  // If stored as plaintext, return as-is
  if (!cipherText.startsWith(PREFIX)) {
    return cipherText;
  }

  try {
    const parts = cipherText.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      console.warn('[FieldEncryption] Malformed ciphertext structure, returning empty.');
      return '';
    }

    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const candidateKeys = getCandidateKeys();

    for (const key of candidateKeys) {
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch {
        // Try next candidate key
      }
    }

    console.error('[FieldEncryption] Decryption failed across all candidate keys. Suppressing ciphertext output.');
    return '';
  } catch (err) {
    console.error('[FieldEncryption] Unexpected decryption error:', err.message);
    return '';
  }
}

/**
 * Checks if a value is encrypted with the MedSafe FLE scheme.
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}
