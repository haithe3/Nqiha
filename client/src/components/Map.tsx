import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

interface MapViewProps {
  className?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  selectedLocation?: { latitude: number; longitude: number } | null;
  onLocationSelect?: (latitude: number, longitude: number) => void;
}

export function MapView({ className, initialCenter = [36.7538, 3.0588], initialZoom = 12, selectedLocation, onLocationSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onSelectRef = useRef(onLocationSelect);
  onSelectRef.current = onLocationSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(initialCenter, initialZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    map.on("click", event => onSelectRef.current?.(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [initialCenter, initialZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedLocation) return;
    const position: L.LatLngExpression = [selectedLocation.latitude, selectedLocation.longitude];
    if (!markerRef.current) markerRef.current = L.marker(position).addTo(map);
    else markerRef.current.setLatLng(position);
    map.panTo(position);
  }, [selectedLocation]);

  return <div ref={containerRef} className={cn("map-picker-leaflet h-[210px] w-full", className)} aria-label="خريطة اختيار موقع الغسيل" />;
}
