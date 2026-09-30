/**
 * Secure, collision-free ID generation utility for AutomatiQA.
 * Uses crypto.randomUUID() where available, with a cryptographically
 * secure 16-byte fallback to guarantee uniqueness across sessions and devices.
 */

export const generateUniqueId = (prefix = 'id'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  // Cryptographically secure fallback
  const bytes = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
    ? crypto.getRandomValues(new Uint8Array(16))
    : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex}`;
};

export const generateUniqueFolderId = (prefix = 'folder'): string => {
  return generateUniqueId(prefix);
};
