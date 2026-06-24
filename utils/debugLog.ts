import { isDevModeEnabled } from '../store/devModeStore';

// Gated, informational logging — only prints while Developer mode is on
// (Settings → Developer). Errors/warnings should keep using console.warn
// directly (and stay always-on); this is only for the "what's happening"
// trace logs, so they don't spam every user's console in production.
export function debugLog(...args: unknown[]) {
  if (isDevModeEnabled()) {
    console.log(...args);
  }
}
