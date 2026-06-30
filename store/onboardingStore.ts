import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeAsyncStorage } from './entriesStore';

type OnboardingState = {
  hasSeenOnboarding: boolean;
  currentStep: number;
  manuallyOpened: boolean;
  setHasSeenOnboarding: () => void;
  nextStep: () => void;
  openTour: () => void;
  resetOnboarding: () => void;
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      currentStep: 0,
      manuallyOpened: false,
      setHasSeenOnboarding: () => set({ hasSeenOnboarding: true, currentStep: 0, manuallyOpened: false }),
      nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
      // Manual trigger from the App Tour button — works regardless of sign-in state.
      openTour: () => set({ manuallyOpened: true, currentStep: 0 }),
      // Kept for legacy callers; same effect as openTour for the auto-start flow.
      resetOnboarding: () => set({ hasSeenOnboarding: false, currentStep: 0, manuallyOpened: false }),
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      // Only persist the flag — step and manuallyOpened always reset on next open
      partialize: (s) => ({ hasSeenOnboarding: s.hasSeenOnboarding }),
    },
  ),
);
