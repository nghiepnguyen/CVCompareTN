// Local Sentry envelope collector for privacy tests: binds 127.0.0.1 only, never forwards.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';

export type EnvelopeItem = { type: string; payload: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Envelope = { raw: string; header: any; items: EnvelopeItem[] }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function startCollector() {
  const envelopes: Envelope[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' });
      res.end('{}');
      if (req.method !== 'POST' || !req.url?.includes('/envelope')) return;
      let buf = Buffer.concat(chunks);
      if (req.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
      const raw = buf.toString('utf8');
      const lines = raw.split('\n').filter(Boolean);
      const items: EnvelopeItem[] = [];
      for (let i = 1; i + 1 < lines.length; i += 2) items.push({ type: JSON.parse(lines[i]).type, payload: JSON.parse(lines[i + 1]) });
      envelopes.push({ raw, header: JSON.parse(lines[0]), items });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    dsn: `http://public@127.0.0.1:${port}/1`,
    envelopes,
    /** Every byte that left the SDK, envelope headers included. */
    raw: () => envelopes.map((e) => e.raw).join('\n'),
    items: (type: string) => envelopes.flatMap((e) => e.items.filter((i) => i.type === type).map((i) => i.payload)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Synthetic markers. The JWT is assembled at runtime so secret scanners do not flag a literal.
export const MARK = {
  email: 'leak.person@example.com',
  phone: '0912 345 678',
  jwt: ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJzZWMyLXRlc3QifQ', 'c2VjMi1zaWduYXR1cmU'].join('.'),
  cv: 'Nguyen Van Sec2, Senior Engineer at Secret Corp 2019-2024',
  jd: 'JD-private-requirements',
  ip: '203.0.113.7',
  // 40-hex SHA with a phone-shaped digit run: must survive redaction untouched.
  sha: '4cf93644dd28b07a01234567890b16f0989840ca',
};

/** Fragments that must never appear anywhere in an outbound envelope. */
export const FORBIDDEN = [
  MARK.email, encodeURIComponent(MARK.email), 'leak.person', MARK.phone, '0912345678',
  'eyJzdWIiOiJzZWMyLXRlc3QifQ', 'c2VjMi1zaWduYXR1cmU', 'Secret Corp', 'Nguyen Van', MARK.jd, MARK.ip,
];

export const leaksIn = (raw: string) => FORBIDDEN.filter((f) => raw.includes(f));
