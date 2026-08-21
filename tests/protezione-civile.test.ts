import { describe, it, expect } from 'vitest';
import { ProtezioneCivileService } from '../src/services/protezione-civile';

describe('ProtezioneCivileService & Rete Radar Nazionale', () => {
  it('dovrebbe avere un catalogo valido di stazioni radar DPC su tutto il territorio italiano', () => {
    const stations = ProtezioneCivileService.getRadarStations();
    expect(stations.length).toBeGreaterThanOrEqual(14);
    
    for (const station of stations) {
      expect(station.id).toBeDefined();
      expect(station.name).toBeDefined();
      expect(station.lat).toBeGreaterThan(35.0);
      expect(station.lat).toBeLessThan(48.0);
      expect(station.lng).toBeGreaterThan(6.0);
      expect(station.lng).toBeLessThan(19.0);
      expect(station.rangeKm).toBeGreaterThanOrEqual(100);
      expect(station.status).toBe('operational');
    }
  });

  it('dovrebbe calcolare correttamente la distanza Haversine tra due coordinate', () => {
    // Distanza approssimativa tra Milano (45.464, 9.189) e Roma (41.893, 12.483) ~ 475-485 km
    const dist = ProtezioneCivileService.haversineDistance(45.464, 9.189, 41.893, 12.483);
    expect(dist).toBeGreaterThan(470);
    expect(dist).toBeLessThan(490);
  });

  it('dovrebbe trovare la stazione radar DPC più vicina a una determinata coordinata', () => {
    // Coordinate vicino a Torino
    const torinoCoords = { lat: 45.07, lng: 7.68 };
    const res = ProtezioneCivileService.getNearestStation(torinoCoords);
    
    expect(res.station.id).toBe('DPC_BRIC_CROCE');
    expect(res.distanceKm).toBeLessThan(15);
  });

  it('dovrebbe restituire le opzioni corrette per il layer Leaflet WMS', () => {
    const vmiOptions = ProtezioneCivileService.getWmsOptions('radar:vmi');
    expect(vmiOptions.layers).toBe('radar:vmi');
    expect(vmiOptions.format).toBe('image/png');
    expect(vmiOptions.transparent).toBe(true);
    expect(vmiOptions.attribution).toContain('Protezione Civile');
  });
});
