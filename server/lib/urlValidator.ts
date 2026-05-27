/**
 * SSRF-safe URL validation.
 *
 * Blocks requests to:
 * - Private/internal IPv4 ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
 * - Localhost hostnames (localhost, *.local, *.internal, metadata endpoints)
 * - IPv6 loopback (::1) and link-local addresses (fe80::)
 * - Non-HTTP(S) schemes
 * - URLs containing path traversal sequences
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "169.254.169.254", // AWS/cloud metadata
  "metadata.google.internal", // GCP metadata
]);

const BLOCKED_HOSTNAME_PATTERNS = [
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
];

/** IPv4 ranges in CIDR notation that point to private/internal networks */
const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16
];

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return null;
  return (
    ((octets[0] << 24) >>> 0) +
    (octets[1] << 16) +
    (octets[2] << 8) +
    octets[3]
  );
}

function isPrivateIPv4(hostname: string): boolean {
  const ip = ipv4ToNumber(hostname);
  if (ip === null) return false;
  return PRIVATE_IPV4_RANGES.some(
    ([start, end]) => ip >= start && ip <= end
  );
}

function isPrivateIPv6(hostname: string): boolean {
  // Strip brackets for IPv6 addresses
  const addr = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (addr === "::1") return true; // loopback
  if (addr === "::" || addr === "::ffff:0:0") return true; // unspecified
  if (addr.startsWith("fe80:")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local (ULA)
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  return BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(lower));
}

function hasPathTraversal(pathname: string): boolean {
  // Detect ".." sequences that could traverse to unintended endpoints
  return /\.\.(?:\/|\\|%2f|%5c)/i.test(pathname) || /\/\.\.$/.test(pathname);
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a user-supplied URL is safe to make HTTP requests to.
 * Returns { valid: true } if the URL is safe, or { valid: false, error: "..." } if blocked.
 */
export function validateScrapeUrl(rawUrl: string): ValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow HTTP and HTTPS schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "Only http and https URLs are allowed",
    };
  }

  const hostname = parsed.hostname;

  // Block localhost and known internal hostnames
  if (isBlockedHostname(hostname)) {
    return {
      valid: false,
      error: "Requests to internal hostnames are not allowed",
    };
  }

  // Block private IPv4 ranges
  if (isPrivateIPv4(hostname)) {
    return {
      valid: false,
      error: "Requests to private IP addresses are not allowed",
    };
  }

  // Block private IPv6 addresses
  if (isPrivateIPv6(hostname)) {
    return {
      valid: false,
      error: "Requests to private IPv6 addresses are not allowed",
    };
  }

  // Block path traversal
  if (hasPathTraversal(parsed.pathname)) {
    return {
      valid: false,
      error: "Path traversal sequences are not allowed",
    };
  }

  return { valid: true };
}