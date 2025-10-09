import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from './supabase';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  APP_URL,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '@env';
import type {User, Session} from '@supabase/supabase-js';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

export interface Profile {
  id: string;
  email?: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  provider_user_id?: string;
  provider_profile_url?: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

class AuthService {
  user: User | null = null;
  profile: Profile | null = null;
  session: Session | null = null;
  isLoading: boolean = false;
  isAuthenticated: boolean = false;
  error: string | null = null;

  constructor() {
    try {
      makeAutoObservable(this);
      makePersistable(this, {
        name: 'AuthService',
        properties: ['profile'], // Only persist profile, let Supabase handle session
        storage: AsyncStorage,
      });

      // Check if Supabase is properly configured
      if (this.isSupabaseConfigured()) {
        console.log(
          'AuthService: Supabase is configured, initializing auth listener',
        );
        // Listen for auth state changes
        this.initAuthListener();
        // Configure Google Sign-In
        this.configureGoogleSignIn();
        // Check for existing session
        this.checkExistingSession().then(() => {
          console.log('AuthService: Session restoration completed');
        });
      } else {
        console.warn(
          'Supabase not configured - PalsHub features will be disabled',
        );
        this.isAuthenticated = false;
      }

      console.log('AuthService: Constructor completed successfully');
    } catch (error) {
      console.error('AuthService: Error in constructor:', error);
      throw error;
    }
  }

  private isSupabaseConfigured(): boolean {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  private initAuthListener() {
    if (!supabase) {
      console.warn(
        'Supabase not configured - skipping auth listener initialization',
      );
      return;
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      runInAction(() => {
        this.session = session;
        this.user = session?.user ?? null;
        this.isAuthenticated = !!session?.user;
        this.error = null;
      });

      if (event === 'SIGNED_IN' && session?.user) {
        await this.loadUserProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        runInAction(() => {
          this.profile = null;
        });
      }
    });
  }

  private async checkExistingSession() {
    if (!supabase) {
      console.warn('Supabase not configured - skipping session check');
      return;
    }

    try {
      const {
        data: {session},
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error('Error getting session:', error);
        runInAction(() => {
          this.session = null;
          this.user = null;
          this.isAuthenticated = false;
          this.error = error.message;
        });
        return;
      }

      if (session) {
        runInAction(() => {
          this.session = session;
          this.user = session.user;
          this.isAuthenticated = true;
          this.error = null;
        });

        if (session.user) {
          await this.loadUserProfile(session.user.id);
        }
      } else {
        runInAction(() => {
          this.session = null;
          this.user = null;
          this.isAuthenticated = false;
          this.error = null;
        });
      }
    } catch (error) {
      console.error('Error checking existing session:', error);
      runInAction(() => {
        this.session = null;
        this.user = null;
        this.isAuthenticated = false;
        this.error = 'Session check failed';
      });
    }
  }

  private async loadUserProfile(userId: string) {
    if (!supabase) {
      console.warn('Supabase not configured - skipping profile load');
      return;
    }

    try {
      const {data: profile, error} = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned
        console.error('Error loading profile:', error);
        return;
      }

      runInAction(() => {
        this.profile = profile;
      });
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  private configureGoogleSignIn() {
    try {
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        offlineAccess: false,
      });
      console.log('Google Sign-In configured successfully');
    } catch (error) {
      console.error('Error configuring Google Sign-In:', error);
    }
  }

  async signInWithGoogle() {
    if (!this.isSupabaseConfigured()) {
      runInAction(() => {
        this.error = 'Authentication not configured';
      });
      return;
    }

    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      // Check if Google Play Services are available
      console.log('Checking Google Play Services...');
      await GoogleSignin.hasPlayServices();
      console.log('Google Play Services available');

      // Check if user is already signed in
      console.log('Checking current user...');
      try {
        const currentUser = GoogleSignin.getCurrentUser();
        if (currentUser) {
          console.log('User already signed in, signing out first...');
          await GoogleSignin.signOut();
        }
      } catch (error) {
        console.log('No current user signed in');
      }

      // Sign in with Google
      console.log('Starting Google Sign-In...');
      const userInfo = await GoogleSignin.signIn();
      console.log('Google Sign-In completed:', !!userInfo.data);

      if (userInfo.data?.idToken) {
        console.log(
          'Google sign-in successful, attempting Supabase authentication...',
        );
        console.log('ID Token length:', userInfo.data.idToken.length);

        // Use the ID token to sign in with Supabase (nonce disabled)
        const {data, error} = await supabase!.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        });

        if (error) {
          runInAction(() => {
            this.error = error.message;
          });
          console.error('Supabase Google sign-in error:', error);
        } else {
          console.log('Google sign-in successful:', data);
        }
      } else {
        runInAction(() => {
          this.error = 'No ID token received from Google';
        });
        console.error('No ID token present in Google sign-in response');
      }
    } catch (error: any) {
      let errorMessage = 'Failed to sign in with Google';

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        errorMessage = 'Sign-in was cancelled';
      } else if (error.code === statusCodes.IN_PROGRESS) {
        errorMessage = 'Sign-in is already in progress';
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        errorMessage = 'Google Play Services not available';
      }

      runInAction(() => {
        this.error = errorMessage;
      });
      console.error('Google sign-in error:', error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async signInWithEmail(email: string, password: string) {
    if (!this.isSupabaseConfigured()) {
      runInAction(() => {
        this.error = 'Authentication not configured';
      });
      return;
    }

    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      const {error} = await supabase!.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        runInAction(() => {
          this.error = error.message;
        });
        console.error('Email sign-in error:', error);
      }
    } catch (error) {
      runInAction(() => {
        this.error = 'Failed to sign in with email';
      });
      console.error('Email sign-in error:', error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async signUpWithEmail(email: string, password: string, fullName?: string) {
    if (!this.isSupabaseConfigured()) {
      runInAction(() => {
        this.error = 'Authentication not configured';
      });
      return;
    }

    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      const {error} = await supabase!.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        runInAction(() => {
          this.error = error.message;
        });
        console.error('Email sign-up error:', error);
      }
    } catch (error) {
      runInAction(() => {
        this.error = 'Failed to sign up with email';
      });
      console.error('Email sign-up error:', error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async signOut() {
    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      // Sign out from Supabase if configured
      if (supabase) {
        const {error} = await supabase.auth.signOut();
        if (error) {
          console.error('Supabase sign-out error:', error);
        }
      }

      // Also sign out from Google if user was signed in with Google
      try {
        await GoogleSignin.signOut();
      } catch (googleError) {
        console.warn('Error signing out from Google:', googleError);
        // Don't fail the entire sign-out process if Google sign-out fails
      }
    } catch (error) {
      runInAction(() => {
        this.error = 'Failed to sign out';
      });
      console.error('Sign-out error:', error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async resetPassword(email: string) {
    if (!this.isSupabaseConfigured()) {
      runInAction(() => {
        this.error = 'Authentication not configured';
      });
      return;
    }

    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      const {error} = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}/auth/reset-password`,
      });

      if (error) {
        runInAction(() => {
          this.error = error.message;
        });
        console.error('Password reset error:', error);
      }
    } catch (error) {
      runInAction(() => {
        this.error = 'Failed to send password reset email';
      });
      console.error('Password reset error:', error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async updateProfile(updates: Partial<Profile>) {
    if (!this.user) {
      runInAction(() => {
        this.error = 'User not authenticated';
      });
      return;
    }

    if (!this.isSupabaseConfigured()) {
      runInAction(() => {
        this.error = 'Authentication not configured';
      });
      return;
    }

    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      const {error} = await supabase!.from('profiles').upsert({
        id: this.user.id,
        ...updates,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        runInAction(() => {
          this.error = error.message;
        });
        console.error('Profile update error:', error);
      } else {
        // Reload profile
        await this.loadUserProfile(this.user.id);
      }
    } catch (error) {
      runInAction(() => {
        this.error = 'Failed to update profile';
      });
      console.error('Profile update error:', error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  clearError() {
    runInAction(() => {
      this.error = null;
    });
  }

  get authState(): AuthState {
    return {
      user: this.user,
      profile: this.profile,
      session: this.session,
      isLoading: this.isLoading,
      isAuthenticated: this.isAuthenticated,
      error: this.error,
    };
  }
}

export const authService = new AuthService();
