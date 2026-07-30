import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useEffect, useRef } from "react";
import type { PlanPin } from "../core/plan";
import { planPinsBounds } from "../core/plan";

export interface PlanMapProps {
  pins: readonly PlanPin[];
  /** 地図をタップして位置を拾うモード */
  picking?: boolean;
  /** picking 中に地図がタップされた */
  onPick?: (lat: number, lng: number) => void;
  /** ピンがタップされた */
  onSelectPin?: (id: string) => void;
  /** このピンへ地図を寄せる */
  focusPinId?: string | null;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function pinIcon(number: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html:
      `<div style="width:26px;height:26px;border-radius:50%;background:#c2571b;color:#fff;` +
      `display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;` +
      `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${number}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function PlanMapImpl({ pins, picking = false, onPick, onSelectPin, focusPinId }: PlanMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pinCountRef = useRef(0);
  // 地図のイベントは張り替えずに済むよう、最新のハンドラを ref 経由で呼ぶ
  const handlersRef = useRef({ picking, onPick, onSelectPin });
  handlersRef.current = { picking, onPick, onSelectPin };

  useEffect(() => {
    const map = L.map(containerRef.current!, { zoomControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    map.setView([35.681, 139.767], 12); // 初期表示: 東京駅付近(ピンが乗り次第fitする)
    markersRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { picking: on, onPick: pick } = handlersRef.current;
      if (on) pick?.(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ピンの更新。増減したときだけ全体が入るように寄せ直す
  useEffect(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    pins.forEach((pin) => {
      L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.number), title: pin.name })
        .on("click", () => handlersRef.current.onSelectPin?.(pin.id))
        .addTo(group);
    });

    if (pins.length !== pinCountRef.current) {
      pinCountRef.current = pins.length;
      const bounds = planPinsBounds(pins);
      if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [pins]);

  // 一覧やピンから選ばれた場所へ寄せる
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPinId) return;
    const pin = pins.find((p) => p.id === focusPinId);
    if (pin) map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [focusPinId, pins]);

  return (
    <div
      ref={containerRef}
      className={picking ? "map-frame map-frame--picking" : "map-frame"}
      role="img"
      aria-label={picking ? "行きたい場所の地図(タップした位置を登録します)" : "行きたい場所の地図"}
    />
  );
}

export const PlanMap = memo(PlanMapImpl);
