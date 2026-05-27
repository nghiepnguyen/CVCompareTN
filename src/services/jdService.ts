import { supabase } from "../lib/supabase";

export interface SavedJD {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export async function saveJDToProfile(
  uid: string,
  title: string,
  content: string
): Promise<void> {
  const jdId = Math.random().toString(36).substring(7);
  const { error } = await supabase.from("saved_jds").insert([
    {
      user_id: uid,
      jd_id: jdId,
      title: title.substring(0, 100) || "JD đã lưu",
      content,
      timestamp: new Date().toISOString(),
    },
  ]);

  if (error) throw error;
}

export async function getSavedJDs(uid: string): Promise<SavedJD[]> {
  try {
    const { data, error } = await supabase
      .from("saved_jds")
      .select("*")
      .eq("user_id", uid)
      .order("timestamp", { ascending: false });

    if (error) throw error;
    return data.map((d) => ({
      id: d.jd_id || d.id,
      title: d.title,
      content: d.content,
      timestamp: new Date(d.timestamp).getTime(),
    }));
  } catch (error) {
    console.error("Error fetching saved JDs:", error);
  }
  return [];
}

export async function deleteSavedJD(
  uid: string,
  jdId: string
): Promise<void> {
  const { error } = await supabase
    .from("saved_jds")
    .delete()
    .eq("user_id", uid)
    .eq("jd_id", jdId);

  if (error) throw error;
}