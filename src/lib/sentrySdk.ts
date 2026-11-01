// Named re-exports keep the lazy chunk tree-shaken; a bare import('@sentry/react')
// namespace pulls in replay and feedback too (~110KB gz).
export { init, browserTracingIntegration, consoleLoggingIntegration, captureException, setUser } from '@sentry/react';
