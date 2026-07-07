import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';

// Auth gate for the web dashboard screens (index.web.tsx, entries.web.tsx,
// map.web.tsx, export.web.tsx). Each of those calls this directly rather than
// sharing a nested layout, matching the existing convention in this app where
// every screen owns its own top bar/chrome instead of relying on shared
// layout wrappers.
//
// Also initializes the admin store (profile/role + owner list) once a
// session exists, and resets it on sign-out, so every screen gets `isAdmin`/
// `profiles`/`ownerFilter` for free instead of duplicating the load.
export function useRequireWebSession() {
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const adminInitialized = useAdminStore((s) => s.initialized);
  const profiles = useAdminStore((s) => s.profiles);
  const ownerFilter = useAdminStore((s) => s.ownerFilter);
  const setOwnerFilter = useAdminStore((s) => s.setOwnerFilter);
  const initAdmin = useAdminStore((s) => s.init);
  const resetAdmin = useAdminStore((s) => s.reset);

  useEffect(() => {
    if (!initialized) return;
    if (!session) {
      resetAdmin();
      router.replace('/(auth)/login');
      return;
    }
    initAdmin();
  }, [initialized, session, initAdmin, resetAdmin]);

  const userId = session?.user?.id ?? null;
  // Non-admins always use the existing Phase-1 local-store path. Admins
  // always fetch directly via adminService (even for "Mine"), so switching
  // the owner filter never has to reconcile two different data sources —
  // see the plan's §A "data-source branching per screen".
  const dataMode: 'local' | 'admin' = isAdmin ? 'admin' : 'local';
  // undefined = every user's rows (adminService's fetchAllForms/fetchAllEntries
  // omit their .eq('user_id', ...) filter when given undefined).
  const ownerIdParam: string | undefined =
    ownerFilter === 'all' ? undefined : ownerFilter === 'mine' ? userId ?? undefined : ownerFilter;

  return {
    ready: initialized && !!session && adminInitialized,
    userId,
    isAdmin,
    profiles,
    ownerFilter,
    setOwnerFilter,
    dataMode,
    ownerIdParam,
  };
}
