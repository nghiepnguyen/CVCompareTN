import { proxyBlogRequest } from './blog/_proxy.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  return proxyBlogRequest(req);
}
