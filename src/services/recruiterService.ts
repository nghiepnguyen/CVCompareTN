import { supabase } from '../lib/supabase';

// ---- Types ----

export type CampaignStatus = 'active' | 'closed' | 'archived';
export type CandidateStatus = 'pending' | 'analyzing' | 'done' | 'error';
export type HrStatus = 'new' | 'shortlisted' | 'interviewing' | 'rejected' | 'hired';

export interface RecruitmentCampaign {
  id: string;
  userId: string;
  title: string;
  jdTitle: string;
  jdContent: string;
  status: CampaignStatus;
  candidateCount: number;
  analyzedCount: number;
  shortlistedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateCV {
  id: string;
  campaignId: string;
  candidateName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  parsedText: string | null;
  analysisResult: Record<string, unknown> | null;
  matchScore: number | null;
  status: CandidateStatus;
  errorMessage: string | null;
  hrStatus: HrStatus;
  hrNote: string | null;
  analyzedAt: string | null;
  createdAt: string;
}

// ---- Raw row mappers ----

function mapCampaignRow(row: Record<string, unknown>): RecruitmentCampaign {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: (row.title as string) ?? '',
    jdTitle: (row.jd_title as string) ?? '',
    jdContent: (row.jd_content as string) ?? '',
    status: (row.status as CampaignStatus) ?? 'active',
    candidateCount: (row.candidate_count as number) ?? 0,
    analyzedCount: (row.analyzed_count as number) ?? 0,
    shortlistedCount: (row.shortlisted_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapCandidateRow(row: Record<string, unknown>): CandidateCV {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    candidateName: (row.candidate_name as string) ?? '',
    fileName: (row.file_name as string) ?? '',
    filePath: (row.file_path as string) ?? '',
    fileSize: (row.file_size as number) ?? 0,
    parsedText: (row.parsed_text as string) ?? null,
    analysisResult: (row.analysis_result as Record<string, unknown>) ?? null,
    matchScore: typeof row.match_score === 'number' ? row.match_score : null,
    status: (row.status as CandidateStatus) ?? 'pending',
    errorMessage: (row.error_message as string) ?? null,
    hrStatus: (row.hr_status as HrStatus) ?? 'new',
    hrNote: (row.hr_note as string) ?? null,
    analyzedAt: (row.analyzed_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// ---- CRUD: Campaigns ----

export async function getUserCampaigns(userId: string): Promise<RecruitmentCampaign[]> {
  const { data, error } = await supabase
    .from('recruitment_campaigns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapCampaignRow);
}

export async function getCampaign(campaignId: string): Promise<RecruitmentCampaign | null> {
  const { data, error } = await supabase
    .from('recruitment_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCampaignRow(data) : null;
}

export async function createCampaign(params: {
  title: string;
  jdTitle: string;
  jdContent: string;
}): Promise<RecruitmentCampaign> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data, error } = await supabase
    .from('recruitment_campaigns')
    .insert({
      user_id: userId,
      title: params.title,
      jd_title: params.jdTitle,
      jd_content: params.jdContent,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return mapCampaignRow(data);
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<void> {
  const { error } = await supabase
    .from('recruitment_campaigns')
    .update({ status })
    .eq('id', campaignId);

  if (error) throw error;
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const { error } = await supabase
    .from('recruitment_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) throw error;
}

// ---- Candidate CVs ----

export async function getCampaignCandidates(
  campaignId: string
): Promise<CandidateCV[]> {
  const { data, error } = await supabase
    .from('candidate_cvs')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('match_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapCandidateRow);
}

export async function getCandidate(candidateId: string): Promise<CandidateCV | null> {
  const { data, error } = await supabase
    .from('candidate_cvs')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCandidateRow(data) : null;
}

export async function createCandidate(params: {
  campaignId: string;
  candidateName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
}): Promise<CandidateCV> {
  const { data, error } = await supabase
    .from('candidate_cvs')
    .insert({
      campaign_id: params.campaignId,
      candidate_name: params.candidateName,
      file_name: params.fileName,
      file_path: params.filePath,
      file_size: params.fileSize,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return mapCandidateRow(data);
}

export async function updateCandidateStatus(
  candidateId: string,
  status: CandidateStatus,
  parsedText?: string | null
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (parsedText !== undefined) update.parsed_text = parsedText;

  const { error } = await supabase
    .from('candidate_cvs')
    .update(update)
    .eq('id', candidateId);

  if (error) throw error;
}

export async function updateCandidateHrStatus(
  candidateId: string,
  hrStatus: HrStatus,
  hrNote?: string
): Promise<void> {
  // Use RPC to enforce ownership check + auto sync counters
  const { error } = await supabase.rpc('update_candidate_hr_status', {
    p_candidate_id: candidateId,
    p_hr_status: hrStatus,
    p_hr_note: hrNote ?? null,
  });

  if (error) throw error;
}

export async function saveCandidateAnalysis(
  candidateId: string,
  analysisResult: Record<string, unknown>,
  matchScore: number,
  status: 'done' | 'error' = 'done'
): Promise<void> {
  // This must be called from the backend with service_role. On the frontend,
  // we call a server API endpoint that proxies the RPC.
  const response = await fetch('/api/recruiter/save-analysis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify({
      candidateId,
      analysisResult,
      matchScore,
      status,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? 'Không lưu được kết quả phân tích');
  }
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_cvs')
    .delete()
    .eq('id', candidateId);

  if (error) throw error;
  // Counter sync will happen via sync_campaign_counters
}

// ---- Storage Upload ----

const CV_FILES_BUCKET = 'cv-files';

export async function uploadCandidateFile(params: {
  userId: string;
  campaignId: string;
  file: File;
}): Promise<{ filePath: string; fileName: string }> {
  const { userId, campaignId, file } = params;
  const fileExt = file.name.split('.').pop() || 'bin';
  const uniqueName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${userId}/campaigns/${campaignId}/${uniqueName}`;

  const { error } = await supabase.storage
    .from(CV_FILES_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
    });

  if (error) throw error;

  return { filePath, fileName: file.name };
}

export async function getCandidateFileUrl(filePath: string): Promise<string> {
  const { data } = supabase.storage
    .from(CV_FILES_BUCKET)
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error('Không lấy được URL file');
  }

  return data.publicUrl;
}

export async function deleteCandidateFile(filePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(CV_FILES_BUCKET)
    .remove([filePath]);

  if (error) throw error;
}