import type {
  RecruitmentCampaign,
  CandidateCV,
  CampaignStatus,
  HrStatus,
  NeedsConfirmReason,
} from '../../services/recruiterService';

export type {
  RecruitmentCampaign,
  CandidateCV,
  CampaignStatus,
  HrStatus,
};

/** A candidate whose earlier attempt may have been charged (M2-D3). */
export interface ChargeConfirmItem {
  id: string;
  name: string;
  reason: NeedsConfirmReason;
}

export interface RecruiterContextValue {
  campaigns: RecruitmentCampaign[];
  activeCampaign: RecruitmentCampaign | null;
  candidates: CandidateCV[];
  selectedCandidate: CandidateCV | null;
  isAnalyzing: boolean;
  campaignLoading: boolean;
  candidatesLoading: boolean;

  loadCampaigns: () => Promise<void>;
  setActiveCampaign: (campaign: RecruitmentCampaign | null) => void;
  selectCandidate: (candidate: CandidateCV | null) => void;
  loadCandidates: (campaignId: string) => Promise<void>;

  createCampaign: (title: string, jdTitle: string, jdContent: string) => Promise<void>;
  updateCampaignStatus: (campaignId: string, status: CampaignStatus) => Promise<void>;
  deleteCampaign: (campaignId: string) => Promise<void>;

  uploadCandidateCVs: (campaignId: string, files: File[]) => Promise<void>;
  /** Resolves with the candidates that need an explicit, chargeable re-run. */
  analyzeCampaign: (campaignId: string, confirmChargeIds?: string[]) => Promise<ChargeConfirmItem[]>;
  updateHrStatus: (candidateId: string, status: HrStatus, note?: string) => Promise<void>;
  deleteCandidateCV: (candidateId: string, filePath: string) => Promise<void>;
  exportToExcel: (campaignId: string) => void;
}
