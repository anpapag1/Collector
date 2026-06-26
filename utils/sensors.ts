import * as Location from 'expo-location';
import { GpsLocation } from '../types';

// Reverse geocoding is a best-effort enhancement, not part of the location
// capture itself — a slow/unavailable geocoder must never fail the capture.
async function lookupAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Reverse geocode timed out')), 8000);
    });
    const [place] = await Promise.race([
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      timeout,
    ]);
    if (!place) return null;
    const streetLine = [place.streetNumber, place.street].filter(Boolean).join(' ');
    return streetLine || place.name || null;
  } catch {
    return null;
  }
}

// Accuracy (in metres) above which a captured fix is considered "poor" — the
// capture still succeeds, but the UI surfaces a non-blocking warning so the
// user knows the coordinate may be unreliable. Exported for GpsField.
export const POOR_ACCURACY_THRESHOLD_M = 20;

const CAPTURE_TIMEOUT_MS = 20000;
const GOOD_ENOUGH_ACCURACY_M = 8;
const SETTLE_WINDOW_MS = 6000;

export async function captureLocation(): Promise<GpsLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied');
  }
  const result = await captureBestFix();
  const address = await lookupAddress(result.coords.latitude, result.coords.longitude);
  return {
    lat: result.coords.latitude,
    lng: result.coords.longitude,
    accuracy: result.coords.accuracy,
    address,
  };
}

// A single getCurrentPositionAsync() call often returns a poor "cold fix" —
// the very first reading right after the GPS radio wakes up, sometimes 50m+
// off. Watching for a short window and keeping the most accurate sample seen
// gives the receiver a chance to settle, while still resolving immediately
// once a genuinely good fix (<= GOOD_ENOUGH_ACCURACY_M) arrives so a strong
// signal doesn't wait out the whole window.
function captureBestFix(): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    let best: Location.LocationObject | null = null;
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let subscription: Location.LocationSubscription | null = null;

    const overallTimer = setTimeout(finish, CAPTURE_TIMEOUT_MS);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (settleTimer) clearTimeout(settleTimer);
      subscription?.remove();
      if (best) resolve(best);
      else reject(new Error('GPS capture timed out'));
    }

    function failEarly(err: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (settleTimer) clearTimeout(settleTimer);
      reject(err);
    }

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (loc) => {
        if (settled) return;
        if (!best || (loc.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)) {
          best = loc;
        }
        if ((loc.coords.accuracy ?? Infinity) <= GOOD_ENOUGH_ACCURACY_M) {
          finish();
          return;
        }
        // First sample received — start a short settle window so we keep
        // listening briefly for a better fix instead of taking whatever
        // arrived first.
        if (!settleTimer) {
          settleTimer = setTimeout(finish, SETTLE_WINDOW_MS);
        }
      }
    )
      .then((sub) => {
        if (settled) sub.remove();
        else subscription = sub;
      })
      .catch(failEarly);
  });
}
