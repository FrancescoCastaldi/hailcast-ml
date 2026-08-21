import { StormCell, HailGenesisForecast } from '../types/meteorology';

/**
 * DataExportService — Esportazione Dati Meteorologici
 * 
 * Genera file CSV e GeoJSON scaricabili con le celle attive,
 * traiettorie e previsioni di genesi per analisi offline e GIS.
 */
export class DataExportService {

  /**
   * Esporta le celle temporalesche in formato CSV
   */
  public static exportCellsCSV(cells: StormCell[]): string {
    const header = [
      'ID', 'Nome', 'Latitudine', 'Longitudine', 'Max_dBZ', 'MESH_cm',
      'POH_%', 'POSH_%', 'Velocità_km/h', 'Direzione_deg', 'Severità',
      'Trend', 'Stadio', 'Fenomeno', 'Pioggia_mm/h', 'CAPE_J/kg',
      'Shear_0-6km_m/s', 'Livello_Congelamento_m', 'Timestamp'
    ].join(',');

    const rows = cells.map(c => [
      c.id,
      `"${c.name.replace(/"/g, '""')}"`,
      c.centroid.lat.toFixed(5),
      c.centroid.lng.toFixed(5),
      c.maxDbz,
      c.meshDiameterCm,
      c.pohPercentage,
      c.poshPercentage,
      c.velocity.speedKmh.toFixed(1),
      c.velocity.directionDeg.toFixed(0),
      c.severity,
      c.trend,
      c.formationStage || 'established',
      c.phenomenon || 'hail',
      c.rainIntensityMmH || 0,
      c.sounding.cape,
      c.sounding.deepShear06km.toFixed(1),
      c.sounding.freezingLevel,
      new Date().toISOString()
    ].join(','));

    return [header, ...rows].join('\n');
  }

  /**
   * Esporta le celle temporalesche in formato GeoJSON (FeatureCollection)
   */
  public static exportCellsGeoJSON(cells: StormCell[]): string {
    const features = cells.map(c => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [...c.polygon.map(p => [p.lng, p.lat]), [c.polygon[0].lng, c.polygon[0].lat]]
        ]
      },
      properties: {
        id: c.id,
        name: c.name,
        centroid_lat: c.centroid.lat,
        centroid_lng: c.centroid.lng,
        max_dbz: c.maxDbz,
        mesh_cm: c.meshDiameterCm,
        poh_pct: c.pohPercentage,
        posh_pct: c.poshPercentage,
        speed_kmh: c.velocity.speedKmh,
        direction_deg: c.velocity.directionDeg,
        severity: c.severity,
        trend: c.trend,
        formation_stage: c.formationStage || 'established',
        phenomenon: c.phenomenon || 'hail',
        rain_mmh: c.rainIntensityMmH || 0,
        cape_jkg: c.sounding.cape,
        shear_ms: c.sounding.deepShear06km,
        freezing_level_m: c.sounding.freezingLevel,
        timestamp: new Date().toISOString()
      }
    }));

    const geojson = {
      type: 'FeatureCollection' as const,
      name: 'HailCast-ML Storm Cells',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:EPSG::4326' }
      },
      features
    };

    return JSON.stringify(geojson, null, 2);
  }

  /**
   * Esporta le previsioni genesis in formato CSV
   */
  public static exportForecastsCSV(forecasts: HailGenesisForecast[]): string {
    const header = [
      'ID', 'Nome', 'Origine_Lat', 'Origine_Lng', 'Target_Lat', 'Target_Lng',
      'Direzione_deg', 'Direzione_Card', 'Velocità_km/h', 'ETA_min',
      'Confidenza_Innesco_%', 'Prob_Grandine_%', 'Livello_Rischio',
      'MESH_Atteso_cm', 'dBZ_Atteso', 'Corridoio_Target', 'Comuni_Target',
      'Stadio_Maturazione', 'Timestamp'
    ].join(',');

    const rows = forecasts.map(f => [
      f.id,
      `"${f.name.replace(/"/g, '""')}"`,
      f.originCoords.lat.toFixed(5),
      f.originCoords.lng.toFixed(5),
      f.targetCoords.lat.toFixed(5),
      f.targetCoords.lng.toFixed(5),
      f.directionDeg.toFixed(0),
      f.directionCardinal,
      f.speedKmh.toFixed(1),
      f.etaMinutes,
      f.triggerConfidenceScore,
      f.hailConversionProbability,
      f.hailRiskLevel,
      f.expectedMeshDiameterCm,
      f.expectedDbz,
      `"${f.targetCorridor.replace(/"/g, '""')}"`,
      `"${f.targetTowns.join('; ')}"`,
      f.maturationStage,
      new Date().toISOString()
    ].join(','));

    return [header, ...rows].join('\n');
  }

  /**
   * Triggera il download di un file dal browser
   */
  public static downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Helper: genera il nome file con timestamp
   */
  public static getTimestampedFilename(baseName: string, extension: string): string {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${baseName}_${ts}.${extension}`;
  }
}
