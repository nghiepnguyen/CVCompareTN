// @vitest-environment jsdom
// M2-D3: a possibly-charged re-run happens only after the explicit dialog.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const analyzeCampaign = vi.fn();
vi.mock('../../context/recruiter', () => ({
  useRecruiter: () => ({
    campaigns: [{ id: 'k1', title: 'T', jdTitle: 'J', jdContent: 'jd', status: 'active', candidateCount: 1, analyzedCount: 0, shortlistedCount: 0 }],
    activeCampaign: { id: 'k1' },
    candidates: [{ id: 'c1', candidateName: 'Alice', fileName: 'a.pdf', status: 'error', analysisStartedAt: null, hrStatus: 'new' }],
    selectedCandidate: null, isAnalyzing: false, candidatesLoading: false,
    setActiveCampaign: vi.fn(), selectCandidate: vi.fn(), loadCandidates: vi.fn(), uploadCandidateCVs: vi.fn(),
    analyzeCampaign, updateHrStatus: vi.fn(), deleteCandidateCV: vi.fn(), exportToExcel: vi.fn(),
  }),
}));
vi.mock('../../components/recruiter/CandidateTable', () => ({ CandidateTable: () => null }));
vi.mock('../../components/recruiter/CandidatePanel', () => ({ CandidatePanel: () => null }));
vi.mock('../../context/UIContext', async () => {
  const { UI_LABELS } = await import('../../translations');
  return { useUI: () => ({ t: UI_LABELS.en, reportLanguage: 'en' }) };
});

import { CampaignDetailView } from '../../components/views/CampaignDetailView';

beforeEach(() => {
  analyzeCampaign.mockReset();
  analyzeCampaign.mockResolvedValueOnce([{ id: 'c1', name: 'Alice', reason: 'paid_result_lost' }]).mockResolvedValue([]);
});
afterEach(cleanup);

async function openDialog() {
  render(<CampaignDetailView campaignId="k1" onBack={() => {}} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyze 1 CVs' })); });
  return screen.getByRole('dialog');
}

describe('CampaignDetailView charge confirmation', () => {
  it('lists the candidates and the credit count; confirm re-runs only them, once', async () => {
    const dialog = await openDialog();
    expect(dialog.textContent).toContain('Alice');
    expect(dialog.textContent).toContain('1 more monthly analysis credit');
    expect(dialog.textContent).not.toContain('{count}');
    expect(analyzeCampaign).toHaveBeenCalledTimes(1);
    expect(analyzeCampaign).toHaveBeenLastCalledWith('k1');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Re-analyze (uses credits)' })); });
    expect(analyzeCampaign).toHaveBeenCalledTimes(2);
    expect(analyzeCampaign).toHaveBeenLastCalledWith('k1', ['c1']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Not now closes the dialog without another run', async () => {
    await openDialog();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Not now' }).find((b) => b.textContent === 'Not now')!); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(analyzeCampaign).toHaveBeenCalledTimes(1);
  });
});
