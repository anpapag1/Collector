import { create } from 'zustand';
import { router } from 'expo-router';
import type { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { usePickerStore } from './pickerStore';
import { showDialog } from './dialogStore';

// Deferred on purpose (see store/entriesStore.ts for the full explanation):
// migrateLegacyEntries.ts and syncEngine.ts both import this module back, so
// a static import here would re-enter this module mid-load. These are only
// needed once an actual auth-state change fires, well after boot.
function getMigrateLegacyEntries() {
  return require('../services/migrateLegacyEntries') as typeof import('../services/migrateLegacyEntries');
}
function requestSync() {
  require('../services/syncEngine').requestSync();
}

type AuthState = {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  init: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

let initStarted = false;

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  initialized: false,
  loading: false,
  error: null,

  init: () => {
    if (initStarted) return;
    initStarted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        set({
          session: data.session ?? null,
          user: data.session?.user ?? null,
          initialized: true,
        });
      })
      .catch((e) => {
        console.warn('[auth] getSession failed', e);
        set({ initialized: true });
      });

    supabase.auth.onAuthStateChange((event, session) => {
      set({ session, user: session?.user ?? null });
      if (event === 'SIGNED_IN' && session) {
        const migrate = getMigrateLegacyEntries();
        const unclaimedEntries = migrate.getUnclaimedEntries();
        const unclaimedForms = usePickerStore.getState().customForms.filter((f) => !f.userId);
        const userId = session.user.id;

        if (unclaimedEntries.length === 0 && unclaimedForms.length === 0) {
          requestSync();
          return;
        }

        const parts: string[] = [];
        if (unclaimedEntries.length > 0) {
          parts.push(`${unclaimedEntries.length} ${unclaimedEntries.length === 1 ? 'entry' : 'entries'}`);
        }
        if (unclaimedForms.length > 0) {
          parts.push(`${unclaimedForms.length} ${unclaimedForms.length === 1 ? 'form' : 'forms'}`);
        }

        showDialog({
          title: 'Data on this device',
          message: `You have ${parts.join(' and ')} collected before signing in. Upload them to your account, or discard them and just use what's already in your account?`,
          actions: [
            {
              label: 'Discard local',
              style: 'destructive',
              onPress: () => {
                migrate.discardUnclaimedEntries();
                usePickerStore.getState().discardUnclaimedCustomForms();
              },
            },
            {
              label: 'Upload & sync',
              onPress: () => {
                migrate.claimLegacyEntriesForUser(userId);
                usePickerStore.getState().claimCustomFormsForUser(userId);
              },
            },
          ],
        });
      }
    });

    const applyUrl = (url: string | null) => {
      if (!url) return;
      const parsed = new URL(url.replace('#', '?'));
      const access_token = parsed.searchParams.get('access_token');
      const refresh_token = parsed.searchParams.get('refresh_token');
      const isRecovery = url.includes('reset-password-callback');
      if (access_token && refresh_token) {
        supabase.auth
          .setSession({ access_token, refresh_token })
          .then(() => {
            // A password-reset email link signs the user into a temporary
            // session — route them straight to "set a new password" instead
            // of dropping them wherever they happened to be in the app.
            if (isRecovery) router.replace('/(auth)/update-password');
          })
          .catch((e) => {
            console.warn('[auth] setSession from deep link failed', e);
          });
      }
    };

    Linking.getInitialURL().then(applyUrl);
    Linking.addEventListener('url', ({ url }) => applyUrl(url));
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    const message = error?.message ?? null;
    set({ loading: false, error: message });
    return { error: message };
  },

  signUp: async (email, password) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: Linking.createURL('auth-callback') },
    });
    // Supabase returns no error for an already-registered email (to avoid
    // leaking which emails exist) but the identities array comes back empty.
    const message = error
      ? error.message
      : data.user && data.user.identities?.length === 0
      ? 'An account with this email already exists'
      : null;
    set({ loading: false, error: message });
    return { error: message };
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null });
    try {
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) {
        const message = error?.message ?? 'Could not start Google sign-in';
        set({ loading: false, error: message });
        return { error: message };
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        set({ loading: false });
        return { error: result.type === 'cancel' ? null : 'Google sign-in did not complete' };
      }

      const url = new URL(result.url.replace('#', '?'));
      const access_token = url.searchParams.get('access_token');
      const refresh_token = url.searchParams.get('refresh_token');
      if (!access_token || !refresh_token) {
        set({ loading: false, error: 'Google sign-in response was missing tokens' });
        return { error: 'Google sign-in response was missing tokens' };
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      const message = sessionError?.message ?? null;
      set({ loading: false, error: message });
      return { error: message };
    } catch (e: any) {
      const message = e?.message ?? 'Google sign-in failed';
      set({ loading: false, error: message });
      return { error: message };
    }
  },

  resetPassword: async (email) => {
    set({ loading: true, error: null });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password-callback'),
    });
    const message = error?.message ?? null;
    set({ loading: false, error: message });
    return { error: message };
  },

  updatePassword: async (newPassword) => {
    set({ loading: true, error: null });
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    const message = error?.message ?? null;
    set({ loading: false, error: message });
    return { error: message };
  },

  signOut: async () => {
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[auth] signOut failed', error);
      set({ error: error.message });
    }
    set({ loading: false });
  },

  clearError: () => set({ error: null }),
}));

// Convenience export used outside React (e.g. _layout init effect).
export const initAuth = () => useAuthStore.getState().init();
