import { db, auth } from "../firebase";
import { doc, collection, increment, updateDoc } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";
import { AnalysisResult } from "./aiService";

export interface SavedJD {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export async function rateAnalysis(userId: string, analysisId: string, rating: number, feedback: string): Promise<void> {
  if (!auth.currentUser) throw new Error("Bạn cần đăng nhập để đánh giá.");
  
  const docRef = doc(db, "users", userId, "history", analysisId);
  try {
    await updateDoc(docRef, {
      rating,
      feedback,
      ratedAt: Date.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/history/${analysisId}`);
  }
}

export async function saveToHistory(results: AnalysisResult | AnalysisResult[]): Promise<void> {
  const resultsArray = Array.isArray(results) ? results : [results];
  if (resultsArray.length === 0 || !resultsArray[0].userId) return;
  
  const userId = resultsArray[0].userId;
  
  try {
    const { getDocs, query, orderBy, collection, writeBatch, doc } = await import("firebase/firestore");
    const batch = writeBatch(db);
    
    resultsArray.forEach(result => {
      const docRef = doc(db, "users", userId, "history", result.id);
      batch.set(docRef, result);
    });
    
    await batch.commit();
    
    const historyRef = collection(db, "users", userId, "history");
    const q = query(historyRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    
    if (snapshot.size > 20) {
      const docsToDelete = snapshot.docs.slice(20);
      const deleteBatch = writeBatch(db);
      docsToDelete.forEach(d => deleteBatch.delete(d.ref));
      await deleteBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/history`);
  }
}

export async function incrementUsageCount(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), {
      usageCount: increment(1)
    });
  } catch (error) {
    console.error("Error incrementing usage count:", error);
  }
}

export async function getUserHistory(uid: string): Promise<AnalysisResult[]> {
  const { getDocs, query, orderBy, limit } = await import("firebase/firestore");
  try {
    const historyRef = collection(db, "users", uid, "history");
    const q = query(historyRef, orderBy("timestamp", "desc"), limit(20));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as AnalysisResult);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/history`);
  }
  return [];
}

export async function deleteFromHistory(uid: string, resultId: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  try {
    await deleteDoc(doc(db, "users", uid, "history", resultId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/history/${resultId}`);
  }
}

export async function clearUserHistory(uid: string): Promise<void> {
  const { getDocs, writeBatch } = await import("firebase/firestore");
  try {
    const historyRef = collection(db, "users", uid, "history");
    const snapshot = await getDocs(historyRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/history`);
  }
}

export async function saveJDToProfile(uid: string, title: string, content: string): Promise<void> {
  const { setDoc, doc } = await import("firebase/firestore");
  const jdId = Math.random().toString(36).substring(7);
  const savedJD: SavedJD = {
    id: jdId,
    title: title.substring(0, 100) || 'JD đã lưu',
    content,
    timestamp: Date.now()
  };
  
  try {
    await setDoc(doc(db, "users", uid, "savedJDs", jdId), savedJD);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/savedJDs/${jdId}`);
  }
}

export async function getSavedJDs(uid: string): Promise<SavedJD[]> {
  const { getDocs, query, orderBy } = await import("firebase/firestore");
  try {
    const jdsRef = collection(db, "users", uid, "savedJDs");
    const q = query(jdsRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as SavedJD);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/savedJDs`);
  }
  return [];
}

export async function deleteSavedJD(uid: string, jdId: string): Promise<void> {
  const { deleteDoc, doc } = await import("firebase/firestore");
  try {
    await deleteDoc(doc(db, "users", uid, "savedJDs", jdId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/savedJDs/${jdId}`);
  }
}
