import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useEffect, useRef } from "react";
import type { Spot, TrackPoint } from "../core/types";

export interface MapViewProps {
  points: readonly TrackPoint[];
  spots: readonly Spot[];
  /** 追従したい現在地(記録中画面用) */
  follow?: { lat: number; lng: number } | null;
  /** 指定スポットへ地図を寄せる(旅詳細のタイムライン連動用) */
  focusSpotId?: string | null;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function spotIcon(index: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html:
      `<div style="width:26px;height:26px;border-radius:50%;background:#c2571b;color:#fff;` +
      `display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;` +
      `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${index}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function MapViewImpl({ points, spots, follow, focusSpotId }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trackRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    const map = L.map(containerRef.current!, { zoomControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    map.setView([35.681, 139.767], 13); // 初期表示: 東京駅付近(データが乗り次第fitする)
    trackRef.current = L.polyline([], { color: "#c2571b", weight: 4, opacity: 0.85 }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 軌跡の更新
  useEffect(() => {
    const map = mapRef.current;
    const track = trackRef.current;
    if (!map || !track) return;
    const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    track.setLatLngs(latlngs);
    if (!fittedRef.current && latlngs.length > 1) {
      map.fitBounds(track.getBounds(), { padding: [32, 32] });
      fittedRef.current = true;
    }
  }, [points]);

  // スポットピンの更新
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    spots.forEach((s, i) => {
      L.marker([s.lat, s.lng], { icon: spotIcon(i + 1), title: s.name }).addTo(group);
    });
  }, [spots]);

  // 現在地追従(記録中)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow) return;
    map.setView([follow.lat, follow.lng], Math.max(map.getZoom(), 15));
  }, [follow]);

  // タイムライン連動フォーカス
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusSpotId) return;
    const spot = spots.find((s) => s.id === focusSpotId);
    if (spot) map.setView([spot.lat, spot.lng], 16, { animate: true });
  }, [focusSpotId, spots]);

  return <div ref={containerRef} className="map-frame" role="img" aria-label="旅の軌跡地図" />;
}

export const MapView = memo(MapViewImpl);
