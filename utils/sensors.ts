import * as Location from 'expo-location';
import { GpsLocation } from '../types';

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
  return {
    lat: result.coords.latitude,
    lng: result.coords.longitude,
    accuracy: result.coords.accuracy,
  };
}
