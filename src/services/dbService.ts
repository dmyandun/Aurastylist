import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  serverTimestamp,
  type DocumentData
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { ItemAnalysis, OutfitPlan } from './aiService';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  genderPreference: 'men' | 'women';
  lastSeen: any;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null): never {
  const user = auth.currentUser;
  const errorInfo: FirestoreErrorInfo = {
    error: error.message,
    operationType,
    path,
    authInfo: {
      userId: user?.uid || 'anonymous',
      email: user?.email || '',
      emailVerified: user?.emailVerified || false,
      isAnonymous: user?.isAnonymous || true,
      providerInfo: user?.providerData || []
    }
  };
  throw new Error(JSON.stringify(errorInfo));
}

export const dbService = {
  async syncUser(user: any, genderPreference: 'men' | 'women') {
    const userRef = doc(db, 'users', user.uid);
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      genderPreference,
      lastSeen: serverTimestamp()
    };
    try {
      await setDoc(userRef, userData, { merge: true });
    } catch (err) {
      handleFirestoreError(err, 'write', `users/${user.uid}`);
    }
  },

  async saveStylingHistory(userId: string, itemAnalysis: ItemAnalysis, plans: OutfitPlan[], gender: string, preferredOccasion: string, ageRange: string) {
    const historyRef = collection(db, 'users', userId, 'history');
    try {
      await addDoc(historyRef, {
        userId,
        itemName: itemAnalysis.name,
        itemAnalysis,
        outfitPlans: plans,
        gender,
        preferredOccasion,
        ageRange,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, 'create', `users/${userId}/history`);
    }
  },

  async saveFeedback(userId: string, outfitId: string, outfit: OutfitPlan, type: 'like' | 'dislike') {
    const feedbackRef = doc(db, 'users', userId, 'feedbacks', outfitId);
    try {
      await setDoc(feedbackRef, {
        outfitId,
        userId,
        type,
        occasion: outfit.occasion,
        pieces: outfit.pieces,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, 'write', `users/${userId}/feedbacks/${outfitId}`);
    }
  },

  async getHistory(userId: string) {
    const historyRef = collection(db, 'users', userId, 'history');
    const q = query(historyRef, orderBy('timestamp', 'desc'));
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      handleFirestoreError(err, 'list', `users/${userId}/history`);
    }
  }
};
