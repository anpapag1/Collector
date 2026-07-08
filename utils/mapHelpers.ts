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
  const naiveMinLng = Math.min(...lngs);
  const naiveMaxLng = Math.max(...lngs);
  const naiveLngSpan = naiveMaxLng - naiveMinLng;

  let centerLng: number;
  let lngSpan: number;
  if (naiveLngSpan > 180) {
    // Points likely span the antimeridian (±180°) — the naive min/max picks
    // up points from opposite sides of the date line, producing a huge wrong
    // span. Shift any negative longitude into 0-360 space so the points form
    // a contiguous range, then compute span/center in that space and wrap
    // the resulting center back into -180..180.
    const shifted = lngs.map((lng) => (lng < 0 ? lng + 360 : lng));
    const shiftedMin = Math.min(...shifted);
    const shiftedMax = Math.max(...shifted);
    lngSpan = shiftedMax - shiftedMin;
    let center = (shiftedMin + shiftedMax) / 2;
    if (center > 180) center -= 360;
    centerLng = center;
  } else {
    lngSpan = naiveLngSpan;
    centerLng = (naiveMinLng + naiveMaxLng) / 2;
  }

  const latDelta = Math.max((maxLat - minLat) * 1.45, 0.025);
  const lngDelta = Math.max(lngSpan * 1.45, 0.025);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: centerLng,
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
