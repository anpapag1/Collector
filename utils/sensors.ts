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

export async function captureLocation(): Promise<GpsLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied');
  }
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('GPS capture timed out')), 20000);
  });
  const result = await Promise.race([
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    }),
    timeout,
  ]);
  const address = await lookupAddress(result.coords.latitude, result.coords.longitude);
  return {
    lat: result.coords.latitude,
    lng: result.coords.longitude,
    accuracy: result.coords.accuracy,
    address,
  };
}
