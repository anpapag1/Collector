import * as Location from 'expo-location';
import { GpsLocation } from '../types';

export async function captureLocation(): Promise<GpsLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied');
  }
  const result = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    lat: result.coords.latitude,
    lng: result.coords.longitude,
    accuracy: result.coords.accuracy ?? 0,
  };
}
