import * as Sentry from '@sentry/node';

const SCRUB_KEYS = ['cvData', 'jd', 'base64Data', 'email', 'password'];

export function initSentryServer() {
  if (Sentry.getClient()) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })],
    enableLogs: true,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      if (event.request?.data && typeof event.request.data === 'object') {
        const body = event.request.data as Record<string, unknown>;
        for (const key of SCRUB_KEYS) {
          if (key in body) body[key] = '[Scrubbed]';
        }
      }
      return event;
    },
  });

}

export { Sentry };
