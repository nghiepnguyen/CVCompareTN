import * as Sentry from '@sentry/react';

export function setSentryUser(userId: string | null) {
  if (!userId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: userId });
}
