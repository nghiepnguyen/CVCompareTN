import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter for all /api routes.
 * Applies a generous window suitable for normal browser usage
 * while preventing brute-force attacks.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per window per IP
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests. Please try again after 15 minutes.',
  },
});

/**
 * Strict rate limiter for expensive/high-risk operations:
 * - PDF extraction (CPU/memory intensive)
 * - Email sending (Resend API quota)
 * - Payment operations
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests for this operation. Please try again after 15 minutes.',
  },
});

/**
 * Rate limiter for static file serving (SPA assets + fallback).
 * Generous limit to accommodate multiple asset requests per page load
 * while preventing filesystem DoS attacks.
 */
export const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window per IP — enough for normal SPA browsing
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please try again after 15 minutes.',
  },
});

/**
 * Very strict rate limiter for endpoints that invoke external APIs
 * with cost/quota implications (e.g., Resend emails).
 */
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // max 5 emails per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      'Too many email requests. Please try again later.',
  },
});