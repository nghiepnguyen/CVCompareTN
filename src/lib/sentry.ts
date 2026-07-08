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
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    enableLogs: true,
    tracesSampleRate: 0.1,
    tracePropagationTargets: ['localhost', /^https:\/\/cvfit\.pro\/api/],
    replaysOnErrorSampleRate: 0,
    denyUrls: [/extensions\//i, /^chrome:\/\//i],
    beforeSend(event, hint) {
      // Supabase refresh token errors are expected when sessions expire — not actionable
      const err = hint?.originalException;
      if (err instanceof Error && err.message?.includes('Refresh Token')) return null;

      // UI library warnings captured as console errors — not actionable
      if (typeof err === 'string' && err.includes('non-static position')) return null;
      if (event.message?.includes('non-static position')) return null;

      // Safari/WebKit's generic network-failure wording (DNS blips, carrier proxies,
      // ITP, ad blockers, blocked Google avatar fetches) — not an app bug, not
      // actionable. WebKit may append the URL, e.g. "Load failed (lh3.google...)",
      // and unhandled rejections may carry a non-Error reason, so match loosely.
      if (err instanceof Error && err.message?.includes('Load failed')) return null;
      if (typeof err === 'string' && err.includes('Load failed')) return null;
      const exceptionValues = event.exception?.values;
      if (exceptionValues?.some((v) => v.value?.includes('Load failed'))) return null;

      // In-app browsers (Facebook/Instagram) inject their own iOS WKWebView
      // bridge scripts that reference message handlers not present in that
      // context — external script, not our code, not actionable.
      if (
        exceptionValues?.some(
          (v) =>
            v.value?.includes('webkit.messageHandlers') ||
            v.stacktrace?.frames?.some(
              (f) => f.function === 'setupIosCallbackHandler'
            )
        )
      ) {
        return null;
      }

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