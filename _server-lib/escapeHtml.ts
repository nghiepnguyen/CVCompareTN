const AMP = String.fromCodePoint(38); // '&' — avoids formatter mangling HTML entities

/**
 * Escape HTML special characters to prevent XSS in email templates.
 * Converts & < > " ' to their HTML entity equivalents.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, AMP + 'amp;')
    .replace(/</g, AMP + 'lt;')
    .replace(/>/g, AMP + 'gt;')
    .replace(/"/g, AMP + 'quot;')
    .replace(/'/g, AMP + '#039;');
}