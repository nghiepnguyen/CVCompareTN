import * as Sentry from '@sentry/node';

import { scrubBreadcrumb, scrubEvent, scrubTelemetry, SENTRY_DATA_COLLECTION } from '../src/lib/scrubTelemetry.js';

export function initSentryServer() {
  if (Sentry.getClient()) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Vercel sets NODE_ENV=production in Preview too; VERCEL_ENV tells them apart.
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    // No console-to-Logs forwarding (SEC-2): console text carries user data.
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeSendSpan: (span) => scrubTelemetry(span),
    tracesSampleRate: 0.05,
  });

}

export { Sentry };
