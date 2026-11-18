/** [lng, lat] pairs, GeoJSON order. */
export type Ring = [number, number][];

/** Close the ring (first point repeated at the end), as WKT/GeoJSON require. */
export function closeRing(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const [first] = ring;
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/** EWKT accepted by PostgREST for a geography(polygon, 4326) column. */
export function ringToEwkt(ring: Ring): string {
  const pts = closeRing(ring)
    .map(([lng, lat]) => `${lng.toFixed(7)} ${lat.toFixed(7)}`)
    .join(", ");
  return `SRID=4326;POLYGON((${pts}))`;
}

/** From ST_AsGeoJSON output to an open ring for editing. */
export function geoJsonToRing(geo: unknown): Ring | null {
  if (!geo || typeof geo !== "object" || !("type" in geo) || geo.type !== "Polygon") return null;
  const coords = (geo as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return null;
  const ring = (coords[0] as unknown[]).filter(
    (p): p is [number, number] => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number",
  );
  const open = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  return open.length >= 3 ? open : null;
}

/** Leaflet uses [lat, lng]; GeoJSON uses [lng, lat]. */
export const toLatLng = (ring: Ring): [number, number][] => ring.map(([lng, lat]) => [lat, lng]);
