/**
 * Healthcare Data Sanitization & Ciphertext Leak Prevention Guard
 * Protects against rendering encrypted PHI/ciphertext strings directly into DOM.
 */
export function sanitizeHealthText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  const trimmed = value.trim();

  // If a string matches AES-256-GCM storage pattern enc:v\d:
  if (/^enc:v\d:/i.test(trimmed) || trimmed.includes('enc:v1:')) {
    console.error(
      '[SECURITY ALERT] Potential PHI Ciphertext Leak Detected in UI rendering! Suppressing output.',
      { preview: trimmed.slice(0, 16) + '...' }
    );
    return fallback;
  }

  return trimmed;
}

export default sanitizeHealthText;
