import { db, auth } from "../firebase";
import { doc, setDoc, getDoc, collection, onSnapshot, updateDoc } from "firebase/firestore";
import axios from 'axios';
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";

export const DEFAULT_AVATAR_URL = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  defaultAvatarURL: string;
  role: 'admin' | 'user';
  hasPermission: boolean;
  createdAt: number;
  usageCount: number;
  isNew?: boolean;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docRef = doc(db, "users", uid);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as UserProfile;
      let needsUpdate = false;
      if (!data.defaultAvatarURL) {
        data.defaultAvatarURL = DEFAULT_AVATAR_URL;
        needsUpdate = true;
      }
      if (!data.photoURL) {
        data.photoURL = DEFAULT_AVATAR_URL;
        needsUpdate = true;
      }
      
      if (data.email.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase() && (data.role !== 'admin' || !data.hasPermission)) {
        data.role = 'admin' as const;
        data.hasPermission = true;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await setDoc(docRef, data, { merge: true });
      }
      return data;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  return null;
}

export async function createUserProfile(user: any, recaptchaToken?: string): Promise<UserProfile> {
  const isAdmin = user.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || DEFAULT_AVATAR_URL,
    defaultAvatarURL: DEFAULT_AVATAR_URL,
    role: isAdmin ? 'admin' : 'user',
    hasPermission: true,
    createdAt: Date.now(),
    usageCount: 0,
    isNew: !isAdmin,
  };
  try {
    await setDoc(doc(db, "users", user.uid), profile);

    if (recaptchaToken) {
      axios.post('/api/send-welcome-email', {
        token: recaptchaToken,
        userEmail: profile.email,
        userName: profile.displayName
      }).catch(emailError => {
        console.error("Lỗi khi gửi email chào mừng (background):", emailError);
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
  }
  return profile;
}

export async function markUserAsRead(uid: string): Promise<void> {
  const docRef = doc(db, "users", uid);
  try {
    await setDoc(docRef, { isNew: false }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserPermission(uid: string, hasPermission: boolean): Promise<void> {
  const docRef = doc(db, "users", uid);
  try {
    await setDoc(docRef, { hasPermission }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserRole(uid: string, role: 'admin' | 'user'): Promise<void> {
  const docRef = doc(db, "users", uid);
  try {
    await setDoc(docRef, { role }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function deleteUser(uid: string): Promise<void> {
  const { deleteDoc, doc, collection, getDocs } = await import("firebase/firestore");
  try {
    const historyRef = collection(db, "users", uid, "history");
    const historySnap = await getDocs(historyRef);
    const historyDeletions = historySnap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(historyDeletions);
    
    const jdsRef = collection(db, "users", uid, "savedJDs");
    const jdsSnap = await getDocs(jdsRef);
    const jdsDeletions = jdsSnap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(jdsDeletions);
    
    await deleteDoc(doc(db, "users", uid));
    localStorage.removeItem(`cv_history_${uid}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const { getDocs } = await import("firebase/firestore");
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    return usersSnap.docs
      .map(doc => doc.data() as UserProfile)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "users");
  }
  return [];
}

export function subscribeToAllUsers(callback: (users: UserProfile[]) => void) {
  return onSnapshot(collection(db, "users"), (snapshot) => {
    const users = snapshot.docs
      .map(doc => {
        const data = doc.data() as UserProfile;
        return {
          ...data,
          photoURL: data.photoURL || data.defaultAvatarURL || DEFAULT_AVATAR_URL,
          defaultAvatarURL: data.defaultAvatarURL || DEFAULT_AVATAR_URL
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(users);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, "users");
  });
}
