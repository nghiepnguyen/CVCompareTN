import * as Sentry from '@sentry/react';

import { scrubTelemetry } from './scrubTelemetry';

/**
 * Vite's Fast Refresh re-evaluates a module on edit. When a context module is
 * re-evaluated while its provider stays mounted, a consumer can read the new
 * context object while the provider still holds the old one and throws
 * "useX must be used within XProvider". The stack always passes through
 * `/@react-refresh` (the dev-only refresh runtime), and production ships a
 * static bundle with no HMR, so anything carrying that frame is not actionable.
 */
export function isFastRefreshArtifact(event: Sentry.Event, isDev = import.meta.env.DEV): boolean {
  if (!isDev) return false;
  const frames = event.exception?.values?.flatMap((value) => value.stacktrace?.frames ?? []) ?? [];
  return frames.some((frame) => (frame.filename ?? frame.abs_path ?? '').includes('/@react-refresh'));
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
    beforeSendLog: scrubTelemetry,
    tracesSampleRate: 0.1,
    tracePropagationTargets: ['localhost', /^https:\/\/cvfit\.pro\/api/],
    replaysOnErrorSampleRate: 0,
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /beacon\.min\.js/i],
    beforeSend(event, hint) {
      // Dev-only HMR artifact, never a product bug — see isFastRefreshArtifact
      if (isFastRefreshArtifact(event)) return null;

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

      // In-app browsers (Facebook/Messenger/Instagram, Zalo, Telegram, ...)
      // inject their own bridge scripts referencing globals/handlers that
      // don't exist in every context — external script, not our code.
      const IN_APP_BRIDGE_PATTERN =
        /webkit\.messageHandlers|zaloJSV2|ZaloJSBridge|TelegramWebviewProxy|TelegramGameProxy|MessengerExtensions/;
      if (
        exceptionValues?.some(
          (v) =>
            IN_APP_BRIDGE_PATTERN.test(v.value ?? '') ||
            v.stacktrace?.frames?.some(
              (f) => f.function === 'setupIosCallbackHandler'
            )
        )
      ) {
        return null;
      }

      // "Object Not Found Matching Id:X, MethodName:update, ParamCount:4" —
      // browser extension (Grammarly, Edge translate, password managers)
      // postMessage bridge losing its port reference. Not our code.
      if (
        exceptionValues?.some((v) => v.value?.includes('Object Not Found Matching Id'))
      ) {
        return null;
      }

      return scrubTelemetry(event);
    },
  });
}
