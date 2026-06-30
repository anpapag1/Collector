import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeAsyncStorage } from './entriesStore';

type OnboardingState = {
  hasSeenOnboarding: boolean;
  currentStep: number;
  setHasSeenOnboarding: () => void;
  nextStep: () => void;
  resetOnboarding: () => void;
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      currentStep: 0,
      setHasSeenOnboarding: () => set({ hasSeenOnboarding: true, currentStep: 0 }),
      nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
      resetOnboarding: () => set({ hasSeenOnboarding: false, currentStep: 0 }),
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      // Only persist the flag — step always resets to 0 on next open
      partialize: (s) => ({ hasSeenOnboarding: s.hasSeenOnboarding }),
    },
  ),
);
