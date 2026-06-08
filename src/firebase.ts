import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import localFirebaseConfig from '../firebase-applet-config.json';

// Use environment variables if available (Vercel/Production), otherwise fallback to local config (AI Studio)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || localFirebaseConfig.appId,
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || localFirebaseConfig.firestoreDatabaseId;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

export interface Product {
  id: string;
  name: string;
  price?: number;
  source?: string;
  normalizedName?: string;
  promokitProductId?: string | null;
  promokitPdvCode?: string | null;
  promokitName?: string | null;
  createdAt: Timestamp;
}

export interface Movement {
  id: string;
  productId: string;
  type: 'entrada' | 'saida';
  quantity: number;
  saleId?: string;
  source?: string;
  promokitOrderCode?: string;
  promokitItemId?: string | null;
  promokitProductId?: string | null;
  referenceDate?: Timestamp;
  createdAt: Timestamp;
}

export interface StockItem extends Product {
  currentStock: number;
}

export interface KitItem {
  productId: string;
  quantity: number;
}

export interface Kit {
  id: string;
  name: string;
  price?: number;
  source?: string;
  promokitProductId?: string | null;
  promokitPdvCode?: string | null;
  promokitName?: string | null;
  items: KitItem[];
  createdAt: Timestamp;
}

export interface Supplier {
  id: string;
  name: string;
  location: string;
  contact: string;
  createdAt: Timestamp;
}

export interface ShoppingProduct {
  id: string;
  name: string;
  supplierId: string;
  unit: string;
  createdAt: Timestamp;
}

export interface Bill {
  id: string;
  name: string;
  value: number;
  paymentCode: string; // Boleto or PIX
  dueDate: Timestamp;
  isPaid: boolean;
  isRecurring: boolean;
  category?: string; // Estilo de mercadoria
  createdAt: Timestamp;
}

export interface Sale {
  id: string;
  customerName: string;
  value: number;
  totalQuantity: number;
  itemsDescription: string;
  orderNumber?: string;
  source?: string;
  promokitOrderCode?: string;
  promokitStatus?: string;
  promokitPaid?: boolean;
  promokitCustomerId?: string | null;
  saleDate: Timestamp;
  createdAt: Timestamp;
}

export interface PromokitLead {
  id: string;
  name: string;
  phone?: string;
  lastOrderCode?: string;
  lastOrderAt?: string;
  lastOrderTotal?: number;
  orderCount?: number;
  address?: any;
  raw?: any;
  updatedAt?: string;
  createdAt?: string;
}

export interface OperationalEvent {
  id: string;
  type: string;
  title: string;
  status: 'success' | 'warning' | 'error' | 'info';
  message?: string;
  source?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Timestamp;
}

export interface CampaignDispatchQueueItem {
  id: string;
  campaignId: string;
  campaignName: string;
  remoteJid: string;
  phone?: string;
  customerName?: string;
  messageText: string;
  variantIndex?: number;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempts?: number;
  lastError?: string;
  scheduledFor?: Timestamp;
  sentAt?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
