import { describe, it, expect, beforeEach } from 'vitest';
import { StormHistoryService } from '../src/services/storm-history-service';
import { ForecastVerificationService } from '../src/services/forecast-verification-service';
import { DataExportService } from '../src/services/data-export-service';
import { StormCell, HailGenesisForecast } from '../src/types/meteorology';

describe('StormHistoryService — Ring Buffer & Trail Tracking', () => {
  beforeEach(() => {
    StormHistoryService.clear();
  });

  const mockCellA: StormCell = {
    id: 'cell-1',
    name: 'Supercella Garda',
    centroid: { lat: 45.5, lng: 10.5 },
    maxDbz: 62,
    polygon: [{ lat: 45.4, lng: 10.4 }, { lat: 45.6, lng: 10.6 }],
    velocity: { speedKmh: 45, directionDeg: 75, vx: 43.4, vy: 11.6 },
    sounding: {
      cape: 2500,
      cin: -15,
      liftedIndex: -6,
      freezingLevel: 3600,
      minus20Level: 6800,
      deepShear06km: 24,
      srh03km: 280,
      dewPointDepression: 2.5,
      echoTop: 12000,
      vil: 55
    },
    meshDiameterCm: 4.8,
    pohPercentage: 100,
    poshPercentage: 92,
    severity: 'destructive',
    trend: 'intensifying',
    nowcastCones: []
  };

  it('registra gli snapshot e permette il recupero temporale', () => {
    const t0 = 1000000;
    StormHistoryService.recordSnapshot([mockCellA], t0);
    
    const cellMoved = { ...mockCellA, centroid: { lat: 45.6, lng: 10.7 } };
    StormHistoryService.recordSnapshot([cellMoved], t0 + 60000);

    expect(StormHistoryService.getCount()).toBe(2);
    
    const snap = StormHistoryService.getSnapshotAtTime(t0 + 10000);
    expect(snap).not.toBeNull();
    expect(snap?.timestamp).toBe(t0);

    const range = StormHistoryService.getTimeRange();
    expect(range?.oldest).toBe(t0);
    expect(range?.newest).toBe(t0 + 60000);
  });

  it('ricostruisce i trail spaziali continui per le celle tracciate', () => {
    const t0 = 2000000;
    StormHistoryService.recordSnapshot([{ ...mockCellA, centroid: { lat: 45.1, lng: 10.1 } }], t0);
    StormHistoryService.recordSnapshot([{ ...mockCellA, centroid: { lat: 45.2, lng: 10.3 } }], t0 + 30000);
    StormHistoryService.recordSnapshot([{ ...mockCellA, centroid: { lat: 45.3, lng: 10.5 } }], t0 + 60000);

    const trail = StormHistoryService.getTrail('cell-1');
    expect(trail.length).toBe(3);
    expect(trail[0]).toEqual({ lat: 45.1, lng: 10.1 });
    expect(trail[2]).toEqual({ lat: 45.3, lng: 10.5 });

    const allTrails = StormHistoryService.getAllTrails();
    expect(allTrails.has('cell-1')).toBe(true);
    expect(allTrails.get('cell-1')?.coords.length).toBe(3);
  });
});

describe('ForecastVerificationService — Standard WMO & Metriche Scientifiche', () => {
  beforeEach(() => {
    ForecastVerificationService.resetCumulative();
  });

  const mockObservedCell: StormCell = {
    id: 'obs-cell-1',
    name: 'Cella Veronese',
    centroid: { lat: 45.42, lng: 10.98 },
    maxDbz: 58,
    polygon: [],
    velocity: { speedKmh: 40, directionDeg: 80, vx: 39, vy: 7 },
    sounding: { cape: 2200, cin: -20, liftedIndex: -5, freezingLevel: 3500, minus20Level: 6700, deepShear06km: 20, srh03km: 220, dewPointDepression: 3, echoTop: 11500, vil: 48 },
    meshDiameterCm: 3.8,
    pohPercentage: 95,
    poshPercentage: 85,
    severity: 'severe',
    trend: 'steady',
    nowcastCones: []
  };

  const mockForecastHit: HailGenesisForecast = {
    id: 'fc-1',
    name: 'Innesco Alto Veronese',
    originCoords: { lat: 45.38, lng: 10.80 },
    targetCoords: { lat: 45.43, lng: 10.99 }, // ~1.5 km dalla cella osservata
    directionDeg: 78,
    directionCardinal: 'ENE',
    speedKmh: 42,
    etaMinutes: 20,
    triggerConfidenceScore: 88,
    hailConversionProbability: 82,
    hailRiskLevel: 'very_high',
    expectedMeshDiameterCm: 3.5,
    expectedDbz: 57,
    targetCorridor: 'Verona Ovest',
    targetTowns: ['Bussolengo', 'Verona'],
    crossSources: [],
    maturationStage: 'imminent_trigger',
    createdAt: Date.now(),
    maturationThresholdMinutes: 25
  };

  it('calcola correttamente HIT, POD e CSI quando la previsione si avvera', () => {
    const metrics = ForecastVerificationService.evaluate([mockForecastHit], [mockObservedCell]);
    
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(0);
    expect(metrics.falseAlarms).toBe(0);
    expect(metrics.pod).toBe(1);
    expect(metrics.far).toBe(0);
    expect(metrics.csi).toBe(1);
    expect(metrics.qualityScore).toBeGreaterThanOrEqual(80);
    expect(metrics.scoreLabel).toBe('Eccellente');
  });

  it('rileva Miss e False Alarm quando le previsioni non coincidono spazialmente', () => {
    const distantForecast: HailGenesisForecast = {
      ...mockForecastHit,
      id: 'fc-distant',
      targetCoords: { lat: 41.90, lng: 12.49 } // Roma (distante da Verona)
    };

    const metrics = ForecastVerificationService.evaluate([distantForecast], [mockObservedCell]);
    expect(metrics.hits).toBe(0);
    expect(metrics.falseAlarms).toBe(1);
    expect(metrics.misses).toBe(1);
    expect(metrics.pod).toBe(0);
    expect(metrics.far).toBe(1);
    expect(metrics.csi).toBe(0);
  });
});

describe('DataExportService — Formattazione CSV & GeoJSON', () => {
  const testCell: StormCell = {
    id: 'export-cell-1',
    name: 'Temporale Mantova',
    centroid: { lat: 45.156, lng: 10.791 },
    maxDbz: 55,
    polygon: [{ lat: 45.1, lng: 10.7 }, { lat: 45.2, lng: 10.8 }, { lat: 45.1, lng: 10.7 }],
    velocity: { speedKmh: 35, directionDeg: 90, vx: 35, vy: 0 },
    sounding: { cape: 1800, cin: -30, liftedIndex: -4, freezingLevel: 3700, minus20Level: 6900, deepShear06km: 18, srh03km: 190, dewPointDepression: 4, echoTop: 10500, vil: 40 },
    meshDiameterCm: 2.6,
    pohPercentage: 80,
    poshPercentage: 65,
    severity: 'moderate',
    trend: 'steady',
    nowcastCones: []
  };

  it('genera CSV ben formato per le celle', () => {
    const csv = DataExportService.exportCellsCSV([testCell]);
    expect(csv).toContain('ID,Nome,Latitudine,Longitudine');
    expect(csv).toContain('export-cell-1');
    expect(csv).toContain('"Temporale Mantova"');
    expect(csv).toContain('45.15600');
    expect(csv).toContain('55');
  });

  it('genera GeoJSON valido conforme alle specifiche RFC 7946', () => {
    const geojsonStr = DataExportService.exportCellsGeoJSON([testCell]);
    const geojson = JSON.parse(geojsonStr);
    
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBe(1);
    expect(geojson.features[0].geometry.type).toBe('Polygon');
    expect(geojson.features[0].properties.name).toBe('Temporale Mantova');
    expect(geojson.features[0].properties.max_dbz).toBe(55);
  });
});
