// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: vi.fn(),
}));

vi.mock('axios');

vi.mock('unpdf', () => ({
  extractText: vi.fn(),
}));

import handler from '../extract-pdf.js';
import * as supabaseAdmin from '../../_server-lib/payment/supabaseAdmin.js';
import axios from 'axios';
import { extractText } from 'unpdf';

const mockGetUser = vi.mocked(supabaseAdmin.getUserFromBearerToken);
const mockAxiosPost = vi.mocked(axios.post);
const mockExtractText = vi.mocked(extractText);

// Minimal valid PDF base64 (starts with %PDF-)
const VALID_PDF_BASE64 = Buffer.from('%PDF-minimal content').toString('base64');

function makeReq(opts: {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}): VercelRequest {
  return {
    method: opts.method ?? 'POST',
    headers: opts.headers ?? {},
    body: opts.body ?? {},
  } as unknown as VercelRequest;
}

function makeRes(): { res: VercelResponse; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  const res = { status, json } as unknown as VercelResponse;
  return { res, status, json };
}

describe('extract-pdf handler — auth guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret-key';
    process.env.NODE_ENV = 'production';
  });

  describe('unauthenticated request (no Bearer token)', () => {
    it('returns 401 when no recaptchaToken provided', async () => {
      mockGetUser.mockResolvedValue(null);
      const req = makeReq({ body: { base64Data: VALID_PDF_BASE64 } });
      const { res, status, json } = makeRes();

      await handler(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication or reCAPTCHA token required' });
    });

    it('returns 403 when reCAPTCHA score is below threshold (0.5)', async () => {
      mockGetUser.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({ data: { success: true, score: 0.3 } });
      const req = makeReq({
        headers: { host: 'cvfit.pro' },
        body: { base64Data: VALID_PDF_BASE64, recaptchaToken: 'low-score-token' },
      });
      const { res, status, json } = makeRes();

      await handler(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'reCAPTCHA verification failed' });
    });

    it('returns 403 when reCAPTCHA verification returns success=false', async () => {
      mockGetUser.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({ data: { success: false, score: 0 } });
      const req = makeReq({
        headers: { host: 'cvfit.pro' },
        body: { base64Data: VALID_PDF_BASE64, recaptchaToken: 'invalid-token' },
      });
      const { res, status } = makeRes();

      await handler(req, res);

      expect(status).toHaveBeenCalledWith(403);
    });

    it('proceeds to PDF extraction when reCAPTCHA passes (score >= 0.5)', async () => {
      mockGetUser.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({ data: { success: true, score: 0.9 } });
      mockExtractText.mockResolvedValue({ text: 'job description text' } as never);
      const req = makeReq({
        headers: { host: 'cvfit.pro' },
        body: { base64Data: VALID_PDF_BASE64, recaptchaToken: 'good-token' },
      });
      const { res, status, json } = makeRes();

      await handler(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ text: 'job description text' });
    });
  });

  describe('authenticated request (valid Bearer token)', () => {
    it('skips reCAPTCHA and proceeds to extraction', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-abc', email: 'user@test.com' });
      mockExtractText.mockResolvedValue({ text: 'cv text content' } as never);
      const req = makeReq({
        headers: { authorization: 'Bearer valid-jwt' },
        body: { base64Data: VALID_PDF_BASE64 },
      });
      const { res, status, json } = makeRes();

      await handler(req, res);

      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ text: 'cv text content' });
    });

    it('does not call reCAPTCHA even when recaptchaToken is provided', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-abc' });
      mockExtractText.mockResolvedValue({ text: 'some text' } as never);
      const req = makeReq({
        headers: { authorization: 'Bearer valid-jwt' },
        body: { base64Data: VALID_PDF_BASE64, recaptchaToken: 'unnecessary-token' },
      });
      const { res } = makeRes();

      await handler(req, res);

      expect(mockAxiosPost).not.toHaveBeenCalled();
    });
  });

  describe('request validation (after auth)', () => {
    it('returns 400 when base64Data is missing', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-abc' });
      const req = makeReq({ headers: { authorization: 'Bearer valid-jwt' }, body: {} });
      const { res, status, json } = makeRes();

      await handler(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Missing base64Data' });
    });

    it('returns 400 for invalid PDF (not starting with %PDF-)', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-abc' });
      const notPdf = Buffer.from('not a pdf file').toString('base64');
      const req = makeReq({
        headers: { authorization: 'Bearer valid-jwt' },
        body: { base64Data: notPdf },
      });
      const { res, status, json } = makeRes();

      await handler(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'File is not a valid PDF' });
    });

    it('returns 405 for non-POST requests', async () => {
      const req = makeReq({ method: 'GET' });
      const { res, status } = makeRes();

      await handler(req, res);

      expect(status).toHaveBeenCalledWith(405);
    });
  });
});
