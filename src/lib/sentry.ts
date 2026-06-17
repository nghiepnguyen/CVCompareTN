import * as Sentry from '@sentry/react';

const SCRUB_KEYS = ['cvData', 'cvText', 'jd', 'email', 'password', 'feedback', 'base64Data'];

function scrubData(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  for (const key of SCRUB_KEYS) {
    if (key in result) result[key] = '[Scrubbed]';
  }
  return result;
}

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0,
    denyUrls: [/extensions\//i, /^chrome:\/\//i],
    beforeSend(event, hint) {
      // Supabase refresh token errors are expected when sessions expire — not actionable
      const err = hint?.originalException;
      if (err instanceof Error && err.message?.includes('Refresh Token')) return null;

      // UI library warnings captured as console errors — not actionable
      if (typeof err === 'string' && err.includes('non-static position')) return null;
      if (event.message?.includes('non-static position')) return null;

      if (event.request?.data && typeof event.request.data === 'object') {
        event.request.data = scrubData(event.request.data as Record<string, unknown>);
      }
      const breadcrumbs = event.breadcrumbs as unknown as Array<{ data?: unknown }> | undefined;
      breadcrumbs?.forEach((b) => {
        if (b.data && typeof b.data === 'object') {
          b.data = scrubData(b.data as Record<string, unknown>);
        }
      });
      return event;
    },
  });
}
