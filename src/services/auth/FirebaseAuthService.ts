import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  IAuthService,
  AuthState,
  AuthUser,
  createDefaultAuthState,
  createAuthenticatedState,
  createErrorState,
} from './IAuthService';
import { getMockAuthService } from './MockAuthService';
import { isFirebaseConfigured } from '../../../firebase.config';

const STORAGE_KEY = '@pocketpal_auth_user';

export class FirebaseAuthService implements IAuthService {
  private _authState: AuthState = createDefaultAuthState();
  private unsubscribeAuth: (() => void) | null = null;
  private offlineMode: boolean = false;
  private fallbackMockService: ReturnType<typeof getMockAuthService> | null = null;

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    if (!isFirebaseConfigured()) {
      console.warn('[FirebaseAuth] Firebase not configured, using offline mode');
      this.enableOfflineMode();
      return;
    }

    try {
      this._authState = { ...this._authState, status: 'loading' };

      this.unsubscribeAuth = auth().onAuthStateChanged((firebaseUser) => {
        this.handleAuthStateChange(firebaseUser);
      });

      const currentUser = auth().currentUser;
      if (currentUser) {
        this.handleAuthStateChange(currentUser);
      } else {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const user = JSON.parse(stored) as AuthUser;
          this._authState = createAuthenticatedState(user);
        } else {
          this._authState = { ...createDefaultAuthState(), status: 'unauthenticated' };
        }
      }
    } catch (error) {
      console.error('[FirebaseAuth] Init failed:', error);
      this.enableOfflineMode();
    }
  }

  private handleAuthStateChange(firebaseUser: any): void {
    if (firebaseUser) {
      const user: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        emailVerified: firebaseUser.emailVerified,
      };
      this._authState = createAuthenticatedState(user);
      this.persistUser(user);
      this.syncUserToFirestore(user).catch((e) =>
        console.warn('[FirebaseAuth] Firestore sync failed:', e)
      );
    } else {
      this._authState = { ...createDefaultAuthState(), status: 'unauthenticated' };
      this.persistUser(null);
    }
  }

  private async persistUser(user: AuthUser | null): Promise<void> {
    try {
      if (user) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('[FirebaseAuth] Persist failed:', error);
    }
  }

  private async syncUserToFirestore(user: AuthUser): Promise<void> {
    try {
      const userRef = firestore().collection('users').doc(user.uid);
      const doc = await userRef.get();

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
        lastLoginAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      };

      if (!doc.exists) {
        await userRef.set({
          ...userData,
          createdAt: firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await userRef.update(userData);
      }
    } catch (error) {
      console.warn('[FirebaseAuth] Firestore sync error:', error);
    }
  }

  get authState(): AuthState {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.authState;
    }
    return this._authState;
  }

  async signInWithEmail(email: string, password: string): Promise<boolean> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.signInWithEmail(email, password);
    }

    this._authState = { ...this._authState, status: 'loading', error: null };

    try {
      await auth().signInWithEmailAndPassword(email, password);
      return true;
    } catch (error: any) {
      let message = 'Sign in failed';
      if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email';
      } else if (error.code === 'auth/wrong-password') {
        message = 'Invalid password';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Invalid email address';
      } else if (error.code === 'auth/user-disabled') {
        message = 'Account has been disabled';
      } else if (error.message) {
        message = error.message;
      }
      this._authState = createErrorState(message);
      return false;
    }
  }

  async signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<boolean> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.signUpWithEmail(email, password, displayName);
    }

    this._authState = { ...this._authState, status: 'loading', error: null };

    try {
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);

      if (displayName && userCredential.user) {
        await userCredential.user.updateProfile({ displayName });
        const updatedUser = auth().currentUser;
        if (updatedUser) {
          this.handleAuthStateChange(updatedUser);
        }
      }

      return true;
    } catch (error: any) {
      let message = 'Sign up failed';
      if (error.code === 'auth/email-already-in-use') {
        message = 'Email already registered';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        message = 'Password is too weak';
      } else if (error.message) {
        message = error.message;
      }
      this._authState = createErrorState(message);
      return false;
    }
  }

  async signInWithGoogle(): Promise<boolean> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.signInWithGoogle();
    }

    this._authState = { ...this._authState, status: 'loading', error: null };

    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();

      if (userInfo.data?.idToken) {
        const googleCredential = auth.GoogleAuthProvider.credential(userInfo.data.idToken);
        await auth().signInWithCredential(googleCredential);
        return true;
      }

      throw new Error('No ID token from Google Sign-In');
    } catch (error: any) {
      console.error('[FirebaseAuth] Google sign-in error:', error);
      this._authState = createErrorState(error.message || 'Google sign-in failed');
      return false;
    }
  }

  async signInWithApple(): Promise<boolean> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.signInWithApple();
    }

    this._authState = { ...this._authState, status: 'loading', error: null };

    try {
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });

      const { identityToken, nonce } = appleAuthRequestResponse;

      if (identityToken) {
        const appleCredential = auth.AppleAuthProvider.credential(identityToken, nonce);
        const userCredential = await auth().signInWithCredential(appleCredential);

        if (
          appleAuthRequestResponse.fullName &&
          userCredential.user &&
          !userCredential.user.displayName
        ) {
          const { givenName, familyName } = appleAuthRequestResponse.fullName;
          const displayName = [givenName, familyName].filter(Boolean).join(' ').trim();
          if (displayName) {
            await userCredential.user.updateProfile({ displayName });
          }
        }

        return true;
      }

      throw new Error('No identity token from Apple Sign-In');
    } catch (error: any) {
      console.error('[FirebaseAuth] Apple sign-in error:', error);
      if (error.code === '1001') {
        this._authState = { ...this._authState, status: 'unauthenticated', error: null };
        return false;
      }
      this._authState = createErrorState(error.message || 'Apple sign-in failed');
      return false;
    }
  }

  async signInAnonymously(): Promise<boolean> {
    if (this.offlineMode && this.fallbackMockService) {
      return false;
    }

    this._authState = { ...this._authState, status: 'loading', error: null };

    try {
      await auth().signInAnonymously();
      return true;
    } catch (error: any) {
      console.error('[FirebaseAuth] Anonymous sign-in error:', error);
      this._authState = createErrorState(error.message || 'Anonymous sign-in failed');
      return false;
    }
  }

  async signOut(): Promise<void> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.signOut();
    }

    try {
      await auth().signOut();
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // ignore
      }
    } catch (error) {
      console.error('[FirebaseAuth] Sign out error:', error);
    }
  }

  enableOfflineMode(): void {
    this.offlineMode = true;
    if (!this.fallbackMockService) {
      this.fallbackMockService = getMockAuthService();
    }
    console.log('[FirebaseAuth] Offline mode enabled');
  }

  async disableOfflineMode(): Promise<void> {
    this.offlineMode = false;
    this.fallbackMockService = null;
    console.log('[FirebaseAuth] Offline mode disabled');
  }

  async resetPassword(email: string): Promise<boolean> {
    if (this.offlineMode && this.fallbackMockService?.resetPassword) {
      return this.fallbackMockService.resetPassword(email);
    }

    try {
      await auth().sendPasswordResetEmail(email);
      return true;
    } catch (error: any) {
      console.error('[FirebaseAuth] Reset password error:', error);
      return false;
    }
  }

  async updateProfile(updates: Partial<AuthUser>): Promise<boolean> {
    if (this.offlineMode && this.fallbackMockService?.updateProfile) {
      return this.fallbackMockService.updateProfile(updates);
    }

    try {
      const user = auth().currentUser;
      if (!user) {
        return false;
      }

      const profileUpdates: any = {};
      if (updates.displayName !== undefined) {
        profileUpdates.displayName = updates.displayName;
      }
      if (updates.photoURL !== undefined) {
        profileUpdates.photoURL = updates.photoURL;
      }

      if (Object.keys(profileUpdates).length > 0) {
        await user.updateProfile(profileUpdates);
      }

      const updatedUser = auth().currentUser;
      if (updatedUser) {
        this.handleAuthStateChange(updatedUser);
      }

      return true;
    } catch (error) {
      console.error('[FirebaseAuth] Update profile error:', error);
      return false;
    }
  }

  isAnonymous(): boolean {
    if (this.offlineMode) {
      return false;
    }
    return auth().currentUser?.isAnonymous || false;
  }

  async linkWithEmail(email: string, password: string): Promise<boolean> {
    if (this.offlineMode) {
      return false;
    }

    try {
      const user = auth().currentUser;
      if (!user) {
        return false;
      }

      const credential = auth.EmailAuthProvider.credential(email, password);
      await user.linkWithCredential(credential);
      return true;
    } catch (error) {
      console.error('[FirebaseAuth] Link with email error:', error);
      return false;
    }
  }

  destroy(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
  }
}

let firebaseAuthInstance: FirebaseAuthService | null = null;

export function getFirebaseAuthService(): FirebaseAuthService {
  if (!firebaseAuthInstance) {
    firebaseAuthInstance = new FirebaseAuthService();
  }
  return firebaseAuthInstance;
}
