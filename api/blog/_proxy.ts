const UPSTREAM_ORIGIN = 'https://blog.cvfit.pro';
const PUBLIC_PREFIX = 'https://cvfit.pro/blog';

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
];

export async function proxyBlogRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const targetPath = url.pathname.replace(/^\/blog/, '') || '/';
  const targetUrl = `${UPSTREAM_ORIGIN}${targetPath}${url.search}`;

  const proxySecret = process.env.BLOG_PROXY_SECRET;

  const upstreamRes = await fetch(targetUrl, {
    method: req.method,
    headers: {
      'user-agent': req.headers.get('user-agent') || '',
      cookie: req.headers.get('cookie') || '',
      accept: req.headers.get('accept') || '',
      ...(proxySecret ? { 'x-blog-proxy-secret': proxySecret } : {}),
    },
    redirect: 'manual',
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
  });

  const headers = new Headers(upstreamRes.headers);
  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name);
  }

  const location = headers.get('location');
  if (location) {
    const fixed = location
      .replace(UPSTREAM_ORIGIN, PUBLIC_PREFIX)
      .replace(UPSTREAM_ORIGIN.replace('https://', 'http://'), PUBLIC_PREFIX);
    headers.set('location', fixed);
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}
