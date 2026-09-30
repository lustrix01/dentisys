import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

// Bicol University College of Dental Medicine area; used only to center an empty map.
const DEFAULT_CENTER: PickedLocation = { latitude: 13.1436, longitude: 123.7438 };

interface LocationPickerProps {
  value: PickedLocation | null;
  radiusMeters: number;
  onChange: (location: PickedLocation) => void;
}

/**
 * ATT-002 session location picker on an embedded OpenStreetMap map. Clicking
 * the map sets the session location; the circle shows the geofence radius.
 * Only map tiles are requested from the tile provider; no Student data is sent.
 */
export const LocationPicker: React.FC<LocationPickerProps> = ({ value, radiusMeters, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = value ?? DEFAULT_CENTER;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([start.latitude, start.longitude], 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      onChangeRef.current({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // The map is created once; later value changes move the marker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      circleRef.current?.remove();
      markerRef.current = null;
      circleRef.current = null;
      return;
    }
    const position: L.LatLngExpression = [value.latitude, value.longitude];
    if (!markerRef.current) {
      markerRef.current = L.circleMarker(position, { radius: 7, color: '#047857', weight: 2, fillColor: '#10b981', fillOpacity: 1 }).addTo(map);
      circleRef.current = L.circle(position, { radius: radiusMeters, color: '#10b981', weight: 1, fillOpacity: 0.12 }).addTo(map);
    } else {
      markerRef.current.setLatLng(position);
      circleRef.current?.setLatLng(position);
    }
    circleRef.current?.setRadius(radiusMeters);
    map.panTo(position);
  }, [value, radiusMeters]);

  return (
    <div className="space-y-1">
      <div ref={containerRef} role="application" aria-label="Session location map" style={{ height: 256 }} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" />
      <p className="text-[11px] text-slate-500">
        Click the map to set the session location.{value ? ` Selected: ${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}.` : ''}
      </p>
    </div>
  );
};
