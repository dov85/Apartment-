import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Property } from '../types.ts';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Fix default icon paths for leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

interface MapViewProps {
  properties: Property[];
  mapProvider?: 'OpenStreetMap' | 'OSM Humanitarian';
  previewCoords?: { lat: number; lon: number } | null;
}

const MapView: React.FC<MapViewProps> = ({ properties, mapProvider = 'OpenStreetMap', previewCoords = null }) => {
  // Center on Tel Aviv-Yafo / Bat Yam area
  const center: [number, number] = [32.05, 34.78];

  // Restrict map bounds to Tel Aviv-Yafo + Bat Yam area
  const maxBounds: [[number, number], [number, number]] = [
    [31.95, 34.70],  // SW corner (south of Bat Yam)
    [32.15, 34.88],  // NE corner (north of Tel Aviv)
  ];

  const tileUrl = mapProvider === 'OpenStreetMap'
    ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    : 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';

  const Preview: React.FC<{ coords: { lat: number; lon: number } | null }> = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
      if (coords) map.setView([coords.lat, coords.lon], 14);
    }, [coords]);
    if (!coords) return null;
    return <CircleMarker center={[coords.lat, coords.lon]} radius={10} pathOptions={{ color: 'red' }} />;
  };

  return (
    <div className="mb-6 rounded-2xl overflow-hidden border border-slate-100">
      <MapContainer center={center} zoom={12} minZoom={11} maxBounds={maxBounds} maxBoundsViscosity={1.0} style={{ height: 380, width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={tileUrl}
        />

        {properties.map(prop => (
          prop.lat && prop.lon ? (
            <Marker key={prop.id} position={[prop.lat, prop.lon]}>
              <Popup>
                <div className="text-right">
                  <strong>{prop.title}</strong>
                  <div>{(prop.street || '') + (prop.city ? (', ' + prop.city) : '')}</div>
                </div>
              </Popup>
            </Marker>
          ) : null
        ))}

        <Preview coords={previewCoords || null} />
      </MapContainer>
    </div>
  );
};

export default MapView;
