import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

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

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
    });

    const applyUrl = (url: string | null) => {
      if (!url) return;
      const parsed = new URL(url.replace('#', '?'));
      const access_token = parsed.searchParams.get('access_token');
      const refresh_token = parsed.searchParams.get('refresh_token');
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).catch((e) => {
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
