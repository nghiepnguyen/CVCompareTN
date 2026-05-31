import type {
  RecruitmentCampaign,
  CandidateCV,
  CampaignStatus,
  HrStatus,
} from '../../services/recruiterService';

export type {
  RecruitmentCampaign,
  CandidateCV,
  CampaignStatus,
  HrStatus,
};

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
  analyzeCampaign: (campaignId: string) => Promise<void>;
  updateHrStatus: (candidateId: string, status: HrStatus, note?: string) => Promise<void>;
  deleteCandidateCV: (candidateId: string, filePath: string) => Promise<void>;
  exportToExcel: (campaignId: string) => void;
}
