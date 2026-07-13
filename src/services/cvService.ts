import { supabase } from "../lib/supabase";
import type { ProcessedFile } from "../hooks/useFileProcessor";

/** Strip diacritics and replace chars Supabase Storage keys reject, so non-ASCII/space filenames don't 400. */
function sanitizeStorageFileName(name: string): string {
  const normalized = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return normalized.replace(/[^A-Za-z0-9._-]/g, "_").slice(-150);
}

export interface SavedCV {
  id: string;
  cvId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  timestamp: number;
}

/** Lazy reference to a CV stored in Supabase Storage — not yet downloaded. */
export interface StoredCVRef {
  readonly _storedRef: true;
  readonly name: string;
  readonly size: number;
  readonly cvId: string;
  readonly filePath: string;
  readonly fileType: string;
  /** Eager download+processing promise started as soon as CV is selected from store. */
  eagerProcessing?: Promise<ProcessedFile>;
}

export function makeStoredCVRef(cv: SavedCV): StoredCVRef {
  return { _storedRef: true, name: cv.fileName, size: cv.fileSize, cvId: cv.cvId, filePath: cv.filePath, fileType: cv.fileType };
}

export function isStoredCVRef(f: File | StoredCVRef): f is StoredCVRef {
  return (f as StoredCVRef)._storedRef === true;
}

export async function resolveToFile(ref: StoredCVRef): Promise<File> {
  return downloadCVFromStorage(ref.filePath, ref.name, ref.fileType);
}

/**
 * Upload a CV file to Supabase Storage and save metadata to saved_cvs table.
 * Returns the public URL of the uploaded file.
 */
export async function saveCVToStorage(
  uid: string,
  file: File
): Promise<{ cvId: string; publicUrl: string; filePath: string }> {
  const cvId = Math.random().toString(36).substring(7);
  const storagePath = `${uid}/${cvId}/${sanitizeStorageFileName(file.name)}`;

  // Upload file to Storage
  const { error: uploadError } = await supabase.storage
    .from("cv-files")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("cv-files")
    .getPublicUrl(storagePath);

  const publicUrl = urlData?.publicUrl ?? "";

  // Insert metadata
  const { error: insertError } = await supabase.from("saved_cvs").insert([
    {
      user_id: uid,
      cv_id: cvId,
      file_name: file.name,
      file_path: storagePath,
      file_type: file.type,
      file_size: file.size,
      timestamp: new Date().toISOString(),
    },
  ]);

  if (insertError) {
    // Clean up uploaded file on metadata insert failure
    await supabase.storage.from("cv-files").remove([storagePath]);
    throw insertError;
  }

  return { cvId, publicUrl, filePath: storagePath };
}

export async function getSavedCVs(uid: string): Promise<SavedCV[]> {
  try {
    const { data, error } = await supabase
      .from("saved_cvs")
      .select("cv_id, file_name, file_path, file_type, file_size, timestamp")
      .eq("user_id", uid)
      .order("timestamp", { ascending: false });

    if (error) throw error;
    return data.map((d) => ({
      id: d.cv_id,
      cvId: d.cv_id,
      fileName: d.file_name,
      filePath: d.file_path,
      fileType: d.file_type,
      fileSize: d.file_size,
      timestamp: new Date(d.timestamp).getTime(),
    }));
  } catch (error) {
    console.error("Error fetching saved CVs:", error);
  }
  return [];
}

export async function deleteSavedCV(
  uid: string,
  cvId: string,
  filePath: string
): Promise<void> {
  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from("cv-files")
    .remove([filePath]);

  if (storageError) {
    console.error("Error deleting CV from storage:", storageError);
  }

  // Delete metadata
  const { error: dbError } = await supabase
    .from("saved_cvs")
    .delete()
    .eq("user_id", uid)
    .eq("cv_id", cvId);

  if (dbError) throw dbError;
}

/**
 * Download a saved CV file from Supabase Storage by its path.
 * Returns a File object that can be added to the files state.
 */
export async function downloadCVFromStorage(
  filePath: string,
  fileName: string,
  fileType: string
): Promise<File> {
  const { data, error } = await supabase.storage
    .from("cv-files")
    .download(filePath);

  if (error) throw error;

  return new File([data], fileName, {
    type: fileType || "application/octet-stream",
  });
}

export function getCVPublicUrl(filePath: string): string {
  const { data } = supabase.storage.from("cv-files").getPublicUrl(filePath);
  return data?.publicUrl ?? "";
}

/**
 * Upload a raw CV file to the temp analyze bucket, bypassing the JSON-body
 * inline-base64 path (and Vercel's 4.5MB body limit). Caller is responsible
 * for telling the server to clean this up after processing.
 */
export async function uploadTempAnalysisFile(uid: string, file: File): Promise<string> {
  const storagePath = `${uid}/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`;

  const { error } = await supabase.storage
    .from("cv-analyze-tmp")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;
  return storagePath;
}

/**
 * Remove temp analyze files once every consumer (analyze/rewrite/parse-cv)
 * that needed them has finished — best-effort, a failure just leaves an
 * orphaned object for manual/future cleanup, not a user-facing error.
 */
export async function cleanupTempAnalysisFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from("cv-analyze-tmp").remove(paths);
  if (error) console.error("Error cleaning up temp analyze files:", error);
}