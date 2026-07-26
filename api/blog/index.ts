import { proxyBlogRequest } from './_proxy.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  return proxyBlogRequest(req);
}
