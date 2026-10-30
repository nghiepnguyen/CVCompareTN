import * as Sentry from '@sentry/node';

import { scrubTelemetry } from '../src/lib/scrubTelemetry.js';

export function initSentryServer() {
  if (Sentry.getClient()) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })],
    enableLogs: true,
    beforeSendLog: scrubTelemetry,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      return scrubTelemetry(event);
    },
  });

}

export { Sentry };
