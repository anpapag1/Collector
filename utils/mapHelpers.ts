export type MapPoint = {
  id: string;
  title: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
};

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function googleMapsPointsUrl(points: MapPoint[], fallbackLat: number, fallbackLng: number) {
  if (points.length < 2) return googleMapsUrl(fallbackLat, fallbackLng);

  const ordered = points.slice(0, 10);
  const origin = ordered[0].coordinate;
  const destination = ordered[ordered.length - 1].coordinate;
  const waypoints = ordered
    .slice(1, -1)
    .map((point) => `${point.coordinate.latitude.toFixed(6)},${point.coordinate.longitude.toFixed(6)}`)
    .join('|');

  const params = [
    'api=1',
    `origin=${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}`,
    `destination=${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`,
    waypoints ? `waypoints=${encodeURIComponent(waypoints)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  return `https://www.google.com/maps/dir/?${params}`;
}

export function mapRegion(points: MapPoint[], fallback: { latitude: number; longitude: number }) {
  if (points.length === 0) {
    return {
      ...fallback,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }

  const lats = points.map((point) => point.coordinate.latitude);
  const lngs = points.map((point) => point.coordinate.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * 1.45, 0.025);
  const lngDelta = Math.max((maxLng - minLng) * 1.45, 0.025);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export function entryLocation(entry: { fields?: { id: string; type: string }[]; data: Record<string, any> }) {
  const readLocation = (value: any): { lat: number; lng: number } | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  if (entry.fields) {
    for (const field of entry.fields) {
      if (field.type !== 'gps') continue;
      const location = readLocation(entry.data[field.id]);
      if (location) return location;
    }
    return null;
  }

  return readLocation(entry.data.location);
}
