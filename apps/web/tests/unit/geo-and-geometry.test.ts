import { describe, expect, it } from "vitest";
import { closeRing, geoJsonToRing, ringToEwkt, toLatLng } from "@/lib/geo";
import { normalise, parsePoints } from "@/lib/camera-geometry";

describe("geofence helpers", () => {
  const ring: [number, number][] = [
    [127.0729, 37.5502],
    [127.0733, 37.5502],
    [127.0733, 37.55045],
  ];

  it("closes the ring once", () => {
    expect(closeRing(ring)).toHaveLength(4);
    expect(closeRing(closeRing(ring))).toHaveLength(4);
  });

  it("writes EWKT in lng lat order", () => {
    expect(ringToEwkt(ring)).toBe(
      "SRID=4326;POLYGON((127.0729000 37.5502000, 127.0733000 37.5502000, 127.0733000 37.5504500, 127.0729000 37.5502000))",
    );
  });

  it("round-trips ST_AsGeoJSON output to an open ring", () => {
    const geo = { type: "Polygon", coordinates: [closeRing(ring)] };
    expect(geoJsonToRing(geo)).toEqual(ring);
    expect(geoJsonToRing(null)).toBeNull();
    expect(geoJsonToRing({ type: "Point", coordinates: [1, 2] })).toBeNull();
  });

  it("converts to Leaflet [lat, lng]", () => {
    expect(toLatLng(ring)[0]).toEqual([37.5502, 127.0729]);
  });
});

describe("camera geometry helpers", () => {
  it("normalises and clamps clicks", () => {
    expect(normalise(50, 25, 200, 100)).toEqual([0.25, 0.25]);
    expect(normalise(-5, 300, 200, 100)).toEqual([0, 1]);
  });

  it("drops invalid stored points", () => {
    expect(parsePoints([[0.1, 0.2], [2, 0], "x", [0.5]] as never)).toEqual([[0.1, 0.2]]);
    expect(parsePoints(null)).toEqual([]);
  });
});
