import { Coordinates } from '../types/meteorology';

export interface DPCRadarStation {
  id: string;
  name: string;
  region: string;
  operator: 'DPC' | 'ARPA' | 'ENAV' | 'Aeronautica Militare';
  lat: number;
  lng: number;
  altitudeM: number;
  band: 'C-Band' | 'X-Band';
  polarization: 'Dual-Pol' | 'Single-Pol';
  rangeKm: number;
  status: 'operational' | 'maintenance' | 'degraded';
}

/**
 * Elenco ufficiale delle principali stazioni radar meteorologiche
 * facenti parte della Rete Radar Nazionale coordinata dal Dipartimento della Protezione Civile (DPC).
 */
export const DPC_RADAR_NETWORK: DPCRadarStation[] = [
  {
    id: 'DPC_MACAION',
    name: 'Monte Macaion',
    region: 'Trentino-Alto Adige',
    operator: 'ARPA',
    lat: 46.495,
    lng: 11.212,
    altitudeM: 1866,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_MONTE_GRANDE',
    name: 'Teolo (Monte Grande)',
    region: 'Veneto',
    operator: 'ARPA',
    lat: 45.352,
    lng: 11.696,
    altitudeM: 472,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_CONCORDIA',
    name: 'Concordia Sagittaria',
    region: 'Veneto',
    operator: 'ARPA',
    lat: 45.733,
    lng: 12.833,
    altitudeM: 5,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_FOSSALON',
    name: 'Fossalon di Grado',
    region: 'Friuli Venezia Giulia',
    operator: 'ARPA',
    lat: 45.735,
    lng: 13.488,
    altitudeM: 2,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_BRIC_CROCE',
    name: 'Bric della Croce (Torino)',
    region: 'Piemonte',
    operator: 'ARPA',
    lat: 45.034,
    lng: 7.732,
    altitudeM: 712,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_SETTEPANI',
    name: 'Monte Settepani',
    region: 'Liguria',
    operator: 'ARPA',
    lat: 44.246,
    lng: 8.198,
    altitudeM: 1386,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_GATTATICO',
    name: 'Gattatico (Reggio Emilia)',
    region: 'Emilia-Romagna',
    operator: 'ARPA',
    lat: 44.789,
    lng: 10.457,
    altitudeM: 38,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_CAPOFIUME',
    name: 'San Pietro Capofiume',
    region: 'Emilia-Romagna',
    operator: 'ARPA',
    lat: 44.654,
    lng: 11.622,
    altitudeM: 10,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_MONTE_MIDIA',
    name: 'Monte Midia',
    region: 'Abruzzo',
    operator: 'DPC',
    lat: 42.062,
    lng: 13.183,
    altitudeM: 1737,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_IL_MONTE',
    name: 'Il Monte (Castiglione)',
    region: 'Lazio',
    operator: 'DPC',
    lat: 41.745,
    lng: 12.656,
    altitudeM: 520,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_MONTE_CRISPO',
    name: 'Monte Crispo',
    region: 'Basilicata / Campania',
    operator: 'DPC',
    lat: 40.061,
    lng: 16.208,
    altitudeM: 1600,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_MONTE_LIPPO',
    name: 'Monte Lippo (Brindisi)',
    region: 'Puglia',
    operator: 'ENAV',
    lat: 40.634,
    lng: 17.915,
    altitudeM: 15,
    band: 'C-Band',
    polarization: 'Single-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_MONTE_RASU',
    name: 'Monte Rasu',
    region: 'Sardegna',
    operator: 'ARPA',
    lat: 40.385,
    lng: 8.998,
    altitudeM: 1259,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  },
  {
    id: 'DPC_MONTE_ZEDA',
    name: 'Monte Zeda (Catania)',
    region: 'Sicilia',
    operator: 'DPC',
    lat: 37.589,
    lng: 14.887,
    altitudeM: 920,
    band: 'C-Band',
    polarization: 'Dual-Pol',
    rangeKm: 250,
    status: 'operational'
  }
];

export class ProtezioneCivileService {
  public static WMS_ENDPOINT = 'https://radar-geowebcache.protezionecivile.it/service/wms';
  public static WMTS_ENDPOINT = 'https://radar-geowebcache.protezionecivile.it/service/wmts';
  
  public static LAYERS = {
    VMI: 'radar:vmi', // Vertical Maximum Intensity (dBZ)
    SRI: 'radar:sri', // Surface Rainfall Intensity (mm/h)
    HRD: 'radar:hrd', // Heavy Rain Detection
    SRT: 'radar:srt'  // Surface Rainfall Total
  };

  /**
   * Genera il template URL per i tile WMTS di GeoWebCache della Protezione Civile
   * @param layer Identificativo del layer (es. 'radar:vmi' o 'radar:sri')
   */
  public static getTileUrlTemplate(layer: string = 'radar:vmi'): string {
    return `https://radar-geowebcache.protezionecivile.it/service/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=&TILEMATRIXSET=EPSG:900913&TILEMATRIX=EPSG:900913:{z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png`;
  }

  /**
   * Ritorna tutte le stazioni della rete radar nazionale DPC
   */
  public static getRadarStations(): DPCRadarStation[] {
    return DPC_RADAR_NETWORK;
  }

  /**
   * Trova la stazione radar più vicina a un punto geografico
   */
  public static getNearestStation(coords: Coordinates): { station: DPCRadarStation; distanceKm: number } {
    let nearest = DPC_RADAR_NETWORK[0];
    let minDistance = Infinity;

    for (const station of DPC_RADAR_NETWORK) {
      const dist = this.haversineDistance(coords.lat, coords.lng, station.lat, station.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = station;
      }
    }

    return {
      station: nearest,
      distanceKm: Math.round(minDistance * 10) / 10
    };
  }

  /**
   * Calcola la distanza Haversine in chilometri tra due coordinate geografiche
   */
  public static haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Raggio terrestre medio in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Configurazione WMS Leaflet per il layer DPC
   */
  public static getWmsOptions(layerName: string = 'radar:vmi') {
    return {
      layers: layerName,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: 'Mosaico Radar Nazionale &copy; Dipartimento Protezione Civile (DPC)',
      opacity: 0.85,
      tiled: true,
      pane: 'radarPane'
    };
  }
}
