"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polygon, TileLayer, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { toLatLng, type Ring } from "@/lib/geo";

const SEJONG_UNIV: [number, number] = [37.5503, 127.0731];

function ClickToAdd({ onAdd }: { onAdd: (lng: number, lat: number) => void }) {
  useMapEvents({ click: (e) => onAdd(e.latlng.lng, e.latlng.lat) });
  return null;
}

/** Click on the map to add polygon corners. Ring is GeoJSON order ([lng, lat]). */
export default function GeofenceMap({ ring, onChange }: { ring: Ring; onChange: (ring: Ring) => void }) {
  const center: [number, number] = ring.length ? [ring[0][1], ring[0][0]] : SEJONG_UNIV;
  const latlngs = toLatLng(ring);
  return (
    <div className="space-y-2">
      <div className="h-80 overflow-hidden rounded-lg border">
        <MapContainer center={center} zoom={19} maxZoom={21} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={19}
            maxZoom={21}
          />
          <ClickToAdd onAdd={(lng, lat) => onChange([...ring, [Number(lng.toFixed(7)), Number(lat.toFixed(7))]])} />
          {latlngs.length >= 3 && <Polygon positions={latlngs} pathOptions={{ color: "#2563eb" }} />}
          {latlngs.map((p, i) => (
            <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#1d4ed8" }} />
          ))}
        </MapContainer>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{ring.length} corners — click the map to add one.</span>
        <Button type="button" size="xs" variant="outline" onClick={() => onChange(ring.slice(0, -1))} disabled={!ring.length}>
          Undo
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={() => onChange([])} disabled={!ring.length}>
          Clear
        </Button>
      </div>
    </div>
  );
}
