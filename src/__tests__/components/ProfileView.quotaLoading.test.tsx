// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UI_LABELS } from '../../translations';
const mocks = vi.hoisted(() => ({ quota: vi.fn() }));
vi.mock('../../services/analyticsQuotaService', () => ({ checkAnalyticsQuota: mocks.quota }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'u1', email: 'u@example.com', user_metadata: {} },
  userProfile: { displayName: 'User', role: 'user' }, effectivePlan: 'free',
}) }));
vi.mock('../../context/UIContext', () => ({ useUI: () => ({
  t: UI_LABELS.vi, reportLanguage: 'vi', setActiveTab: vi.fn(),
}) }));
vi.mock('../../context/recruiter', () => ({ useRecruiter: () => ({ campaigns: [] }) }));
import { ProfileView } from '../../components/views/ProfileView';
beforeEach(() => { vi.useFakeTimers(); mocks.quota.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('shows an inline skeleton until actual usage arrives', async () => {
  let resolve!: (value: unknown) => void;
  mocks.quota.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ProfileView />);
  expect(screen.getByRole('status', { name: UI_LABELS.vi.appLoadingContent })).not.toBeNull();
  expect(screen.queryByText('0 / 5')).toBeNull();
  await act(async () => resolve({ used: 2, limit: 3 }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText('2 / 3')).not.toBeNull();
});

it('stops a hung skeleton, retries, and ignores the original late result', async () => {
  let resolve!: (value: unknown) => void;
  mocks.quota.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ProfileView />);
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(screen.queryByRole('status')).toBeNull();
  mocks.quota.mockResolvedValue({ used: 2, limit: 3 });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.appRetry })));
  expect(screen.getByText('2 / 3')).not.toBeNull();
  await act(async () => resolve({ used: 0, limit: 5 }));
  expect(screen.queryByText('0 / 5')).toBeNull();
});
