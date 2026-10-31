// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const campaignList = vi.fn();
const createCampaign = vi.fn();

vi.mock('../../context/recruiter', () => ({
  useRecruiter: () => ({
    campaigns: campaignList(),
    campaignLoading: false,
    loadCampaigns: vi.fn(),
    createCampaign,
    updateCampaignStatus: vi.fn(),
    deleteCampaign: vi.fn(),
  }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ effectivePlan: 'recruiter', user: { id: 'u1' } }),
}));
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ t: new Proxy({}, { get: (_target, key) => String(key) }), setActiveTab: vi.fn() }),
}));
vi.mock('../../context/analysis/SavedJdContext', () => ({
  useSavedJds: () => ({ savedJDs: [] }),
}));
vi.mock('../../services/paymentService', () => ({ createRecruiterCheckout: vi.fn() }));

import { RecruiterView } from '../../components/views/RecruiterView';

function makeCampaign(index: number) {
  return {
    id: `campaign-${index}`,
    userId: 'u1',
    title: `Campaign ${index}`,
    jdTitle: 'JD',
    jdContent: 'content',
    status: 'active' as const,
    candidateCount: 0,
    analyzedCount: 0,
    shortlistedCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  campaignList.mockReset();
  createCampaign.mockReset();
});

afterEach(cleanup);

describe('RecruiterView campaign cap', () => {
  it('keeps campaign creation enabled below MAX_CAMPAIGNS', () => {
    campaignList.mockReturnValue(Array.from({ length: 9 }, (_, i) => makeCampaign(i + 1)));
    render(<RecruiterView />);
    const button = screen.getByRole('button', { name: /recruiterCreateBtn/ });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/recruiterCampaignLimitReached/)).toBeNull();
  });

  it('disables creation and explains the limit at MAX_CAMPAIGNS', () => {
    campaignList.mockReturnValue(Array.from({ length: 10 }, (_, i) => makeCampaign(i + 1)));
    render(<RecruiterView />);
    const button = screen.getByRole('button', { name: /recruiterCreateBtn/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/recruiterCampaignLimitReached/)).toBeTruthy();
  });
});
