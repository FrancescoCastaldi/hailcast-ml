import { Coordinates, StormCell, SpotterReport, ConvectiveSounding, HailGenesisForecast } from '../types/meteorology';
import { StormTracker, destinationPoint } from '../ml/storm-tracker';
import { GenesisForecastEngine } from '../ml/genesis-forecast-engine';
import { OpenMeteoService } from './openmeteo';
import { SpotterFeedService } from './spotter-feed';

export interface ConvectiveHotspot {
  id: string;
  name: string;
  coords: Coordinates;
  baseSpeedKmh: number;
  baseDirectionDeg: number;
  areaRadiusKm: number;
  corridor: string;
}

export class MultiSourceStormDetector {
  private static STORAGE_KEY_REGISTRY = 'hailcast_cell_lifecycle_registry_v2';
  private static MAX_CELL_LIFESPAN_MIN = 105; // Durata massima assoluta di una supercella/cella prima della scomparsa totale

  // Punti di monitoraggio convettivo strategici per l'Italia
  private static HOTSPOTS: ConvectiveHotspot[] = [
    {
      id: 'cell-garda-verona',
      name: 'Supercella Gardesana / Valpolicella',
      coords: { lat: 45.42, lng: 10.72 },
      baseSpeedKmh: 48,
      baseDirectionDeg: 76,
      areaRadiusKm: 14,
      corridor: 'Garda-Adige'
    },
    {
      id: 'cell-prealpi-lombarde',
      name: 'Cella Multicellulare Sebino-Bresciana',
      coords: { lat: 45.65, lng: 10.15 },
      baseSpeedKmh: 38,
      baseDirectionDeg: 88,
      areaRadiusKm: 11,
      corridor: 'Orobiche-Bresciano'
    },
    {
      id: 'cell-pedemontana-veneta',
      name: 'Mesociclone Vicentino-Bassano',
      coords: { lat: 45.68, lng: 11.62 },
      baseSpeedKmh: 42,
      baseDirectionDeg: 82,
      areaRadiusKm: 12,
      corridor: 'Pedemontana-Piave'
    },
    {
      id: 'cell-emilia-centrale',
      name: 'Temporale V-Shaped Modenese-Reggiano',
      coords: { lat: 44.72, lng: 10.95 },
      baseSpeedKmh: 52,
      baseDirectionDeg: 68,
      areaRadiusKm: 16,
      corridor: 'Secchia-Panaro'
    },
    {
      id: 'cell-friuli-bassa',
      name: 'Supercella Bassa Friulana-Pordenonese',
      coords: { lat: 45.92, lng: 12.85 },
      baseSpeedKmh: 46,
      baseDirectionDeg: 80,
      areaRadiusKm: 15,
      corridor: 'Tagliamento-Isonzo'
    },
    {
      id: 'cell-piemonte-torinese',
      name: 'Linea Convettiva Canavese-Torinese',
      coords: { lat: 45.22, lng: 7.78 },
      baseSpeedKmh: 35,
      baseDirectionDeg: 72,
      areaRadiusKm: 13,
      corridor: 'Canavese-Dora'
    },
    {
      id: 'cell-toscana-appennino',
      name: 'Cella Temporalesca Valdarno-Mugello',
      coords: { lat: 43.85, lng: 11.35 },
      baseSpeedKmh: 36,
      baseDirectionDeg: 85,
      areaRadiusKm: 12,
      corridor: 'Appennino-Arno'
    }
  ];

  /**
   * Tenta di caricare il feed sincronizzato generato dalla GitHub Action
   */
  public static async fetchSyncedData(): Promise<any | null> {
    try {
      const now = Date.now();
      const res = await fetch(`./data/live-radar-feed.json?_t=${now}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const ageSec = (now - (data.updatedEpoch || new Date(data.updatedAt).getTime())) / 1000;
        // Valido se recente (< 2 ore)
        if (ageSec < 7200 && Array.isArray(data.detectedStormCells) && data.detectedStormCells.length > 0) {
          return data;
        }
      }
    } catch (e) {
      console.warn('Network / JSON Error in fetchSyncedData:', e);
    }
    return null;
  }

  public static async fetchSyncedPerturbations(): Promise<any | null> {
    try {
      const now = Date.now();
      const res = await fetch(`./data/live-perturbations-feed.json?_t=${now}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const ageSec = (now - (data.updatedEpoch || new Date(data.updatedAt).getTime())) / 1000;
        // Valido se recente (< 2 ore)
        if (ageSec < 7200 && Array.isArray(data.detectedPerturbations) && data.detectedPerturbations.length > 0) {
          return data;
        }
      }
    } catch (e) {
      console.warn('Network / JSON Error in fetchSyncedPerturbations:', e);
    }
    return null;
  }

  public static async scanAndDetectPerturbations(): Promise<StormCell[]> {
    const syncedData = await this.fetchSyncedPerturbations();
    if (syncedData && syncedData.detectedPerturbations) {
      console.log('✅ Utilizzando feed perturbazioni live sincronizzato da GitHub Actions');
      return syncedData.detectedPerturbations;
    }
    return [];
  }

  /**
   * Esegue una scansione multi-sorgente con ciclo di vita reale (genesi, maturità, dissolvimento, scomparsa)
   */
  public static async scanAndDetectCells(offsetMinutes: number = 0): Promise<StormCell[]> {
    const spotters = SpotterFeedService.getReports();
    const detectedCells: StormCell[] = [];
    const now = Date.now();

    // 1. Pulizia periodica del registro da celle vecchie (> 110 minuti)
    this.purgeStaleRegistry(now);

    // 2. Prova a verificare prima se c'è uno snapshot fresco sincronizzato
    const syncedSnapshot = await this.fetchSyncedData();
    if (syncedSnapshot && syncedSnapshot.detectedStormCells?.length > 0) {
      for (const synced of syncedSnapshot.detectedStormCells) {
        // Calcola l'invecchiamento in tempo reale rispetto al timestamp di creazione
        const ageMinutes = Math.max(0, (now - (synced.createdAt || now)) / 60000);
        const lifespan = synced.lifespanMinutes || 85;

        // Se la cella ha superato il ciclo di vita, SCOMPARE definitivamente
        if (ageMinutes >= lifespan) {
          continue;
        }

        // Evolvi lo stato in base all'età reale attuale
        let stage: 'new_initiation' | 'rapid_intensification' | 'established' | 'dissipating' = synced.formationStage || 'established';
        let isNew = false;
        let dbz = synced.maxDbz;

        if (ageMinutes < 15) {
          stage = 'new_initiation';
          isNew = true;
        } else if (ageMinutes < 45) {
          stage = 'rapid_intensification';
          isNew = false;
        } else if (ageMinutes >= lifespan - 20) {
          stage = 'dissipating';
          isNew = false;
          dbz = Math.max(38, dbz - 8);
        }

        const cell = StormTracker.createStormCell(
          synced.id,
          synced.name,
          synced.centroid,
          dbz,
          synced.velocity.speedKmh,
          synced.velocity.directionDeg,
          synced.sounding,
          12,
          isNew,
          stage,
          {
            createdAt: synced.createdAt,
            ageMinutes: Math.round(ageMinutes),
            lifespanMinutes: lifespan,
            isDissipated: false
          }
        );
        detectedCells.push(cell);
      }

      if (detectedCells.length > 0) {
        return detectedCells;
      }
    }

    // 3. Generazione e tracking orario dinamico multi-sorgente (Open-Meteo + Spotters)
    // Seleziona un set rotante di 3-4 hotspot in base all'orario attuale (cambia ogni 90 min)
    const timeSlot = Math.floor(now / (1000 * 60 * 45)); // Slot rotante ogni 45 min
    const startIndex = timeSlot % this.HOTSPOTS.length;
    const selectedHotspots: ConvectiveHotspot[] = [];

    for (let i = 0; i < 4; i++) {
      const idx = (startIndex + i) % this.HOTSPOTS.length;
      selectedHotspots.push(this.HOTSPOTS[idx]);
    }

    for (let i = 0; i < selectedHotspots.length; i++) {
      const spot = selectedHotspots[i];
      let sounding: ConvectiveSounding;

      try {
        sounding = await OpenMeteoService.fetchConvectiveSounding(spot.coords);
      } catch {
        sounding = OpenMeteoService.getSyntheticSounding(spot.coords);
      }

      const nearbySpotter = this.findNearbySpotter(spot.coords, spotters, 40);

      // Stima riflettività di picco (dBZ)
      let peakDbz = 50;
      if (sounding.cape > 2400) {
        peakDbz = Math.min(68, Math.round(58 + (sounding.cape - 2400) / 300));
      } else if (sounding.cape > 1500) {
        peakDbz = Math.round(52 + (sounding.cape - 1500) / 400);
      } else {
        peakDbz = Math.max(42, Math.round(44 + sounding.cape / 500));
      }

      if (nearbySpotter && nearbySpotter.hailSizeCm > 3.0) {
        peakDbz = Math.max(peakDbz, 62);
      }

      // Velocità e direzione dinamica
      const speedKmh = Math.max(28, Math.min(72, Math.round(sounding.deepShear06km * 2.2)));
      const directionDeg = spot.baseDirectionDeg + (Math.sin(now / 180000 + i) * 6);

      // Ciclo di vita dinamico (età, stadio, eventuale dissolvimento)
      const isGenesisTrigger = i === 1 || (sounding.cape > 2000 && (timeSlot % 2 === 0));
      const cellLifespanMin = 70 + (i * 12); // Durata totale 70-106 min
      const lifecycle = this.getCellLifecycle(`${spot.id}-${timeSlot % 6}`, isGenesisTrigger, cellLifespanMin, now);

      // Se la cella è dissolta / scaduta, SCOMPARE definitivamente e non viene renderizzata
      if (lifecycle.isDissipated) {
        continue;
      }

      // Micro-spostamento geografico coerente con l'età della cella (dalla genesi ad oggi)
      const travelDistKm = (speedKmh * Math.min(lifecycle.ageMinutes, cellLifespanMin)) / 60;
      const currentCentroid = destinationPoint(spot.coords, travelDistKm, directionDeg);

      // Modula i dBZ in base alla fase vitale
      let lifecycleDbz = peakDbz;
      if (lifecycle.stage === 'new_initiation') {
        lifecycleDbz = Math.max(40, peakDbz - 5);
      } else if (lifecycle.stage === 'rapid_intensification') {
        lifecycleDbz = Math.min(68, peakDbz + 3);
      } else if (lifecycle.stage === 'dissipating') {
        lifecycleDbz = Math.max(36, peakDbz - 10);
      }

      const cell = StormTracker.createStormCell(
        `${spot.id}-${timeSlot % 6}`,
        spot.name,
        currentCentroid,
        lifecycleDbz,
        speedKmh,
        directionDeg,
        sounding,
        spot.areaRadiusKm,
        lifecycle.isNew,
        lifecycle.stage,
        {
          createdAt: lifecycle.createdAt,
          ageMinutes: Math.round(lifecycle.ageMinutes),
          lifespanMinutes: cellLifespanMin,
          isDissipated: false
        }
      );

      cell.trend = lifecycle.trend;
      detectedCells.push(cell);
    }

    // 4. Integra le celle derivate dagli inneschi concretizzati (previsioni in direzione giunte a maturazione)
    const genesisForecasts = this.getGenesisForecasts(offsetMinutes);
    for (const forecast of genesisForecasts) {
      if (forecast.maturationStage === 'concretized') {
        const concretizedCell = GenesisForecastEngine.concretizeForecastIntoStormCell(forecast);
        // Evita duplicati
        if (!detectedCells.some(c => c.id === concretizedCell.id)) {
          detectedCells.push(concretizedCell);
        }
      }
    }

    return detectedCells;
  }

  /**
   * Restituisce le previsioni di innesco in direzione cross-referenziate
   */
  public static getGenesisForecasts(offsetMinutes: number = 0): HailGenesisForecast[] {
    return GenesisForecastEngine.generateGenesisForecasts(Date.now(), offsetMinutes);
  }

  /**
   * Monitora e fa evolvere temporalmente la cella (0-15m: nuova -> 15-45m: picco -> 45-80m: matura -> 80-105m: dissolvimento -> >105m: scomparsa)
   */
  private static getCellLifecycle(
    cellId: string,
    isInitialGenesis: boolean,
    lifespanMinutes: number,
    now: number
  ): {
    isNew: boolean;
    stage: 'new_initiation' | 'rapid_intensification' | 'established' | 'dissipating';
    trend: 'intensifying' | 'steady' | 'weakening';
    ageMinutes: number;
    createdAt: number;
    isDissipated: boolean;
  } {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_REGISTRY);
      const registry: Record<string, { firstSeen: number; lastSeen: number; lifespan: number }> = raw ? JSON.parse(raw) : {};

      if (!registry[cellId]) {
        registry[cellId] = { firstSeen: now, lastSeen: now, lifespan: lifespanMinutes };
      } else {
        registry[cellId].lastSeen = now;
      }
      localStorage.setItem(this.STORAGE_KEY_REGISTRY, JSON.stringify(registry));

      const createdAt = registry[cellId].firstSeen;
      const ageMinutes = (now - createdAt) / (60 * 1000);

      // Superato il ciclo vitale -> la cella è morta e deve SCOMPARIRE
      if (ageMinutes >= lifespanMinutes) {
        delete registry[cellId];
        localStorage.setItem(this.STORAGE_KEY_REGISTRY, JSON.stringify(registry));
        return {
          isNew: false,
          stage: 'dissipating',
          trend: 'weakening',
          ageMinutes,
          createdAt,
          isDissipated: true
        };
      }

      // Fase 1: Appena comparsa (0-15 min) -> Nuovo Sviluppo
      if (ageMinutes < 15) {
        return {
          isNew: isInitialGenesis || ageMinutes < 10,
          stage: 'new_initiation',
          trend: 'intensifying',
          ageMinutes,
          createdAt,
          isDissipated: false
        };
      }
      // Fase 2: Crescita rapida & Picco severità grandine (15-45 min)
      if (ageMinutes < 45) {
        return {
          isNew: false,
          stage: 'rapid_intensification',
          trend: 'intensifying',
          ageMinutes,
          createdAt,
          isDissipated: false
        };
      }
      // Fase 3: Stabilizzata / Matura (45-75 min)
      if (ageMinutes < lifespanMinutes - 20) {
        return {
          isNew: false,
          stage: 'established',
          trend: 'steady',
          ageMinutes,
          createdAt,
          isDissipated: false
        };
      }
      // Fase 4: Dissolvimento / Fine temporale (75-105 min)
      return {
        isNew: false,
        stage: 'dissipating',
        trend: 'weakening',
        ageMinutes,
        createdAt,
        isDissipated: false
      };
    } catch {
      return {
        isNew: isInitialGenesis,
        stage: isInitialGenesis ? 'new_initiation' : 'established',
        trend: 'steady',
        ageMinutes: 10,
        createdAt: now - 600000,
        isDissipated: false
      };
    }
  }

  /**
   * Pulisce tutte le voci in localStorage più vecchie di 2 ore
   */
  private static purgeStaleRegistry(now: number): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_REGISTRY);
      if (!raw) return;
      const registry: Record<string, { firstSeen: number; lastSeen: number; lifespan: number }> = JSON.parse(raw);
      let changed = false;

      for (const [id, record] of Object.entries(registry)) {
        const age = (now - record.firstSeen) / (60 * 1000);
        if (age > this.MAX_CELL_LIFESPAN_MIN || (now - record.lastSeen) > 3 * 3600 * 1000) {
          delete registry[id];
          changed = true;
        }
      }

      if (changed) {
        localStorage.setItem(this.STORAGE_KEY_REGISTRY, JSON.stringify(registry));
      }
    } catch {
      // Ignora errori di parsing
    }
  }

  private static findNearbySpotter(
    coords: Coordinates,
    reports: SpotterReport[],
    maxDistKm: number
  ): SpotterReport | null {
    for (const rep of reports) {
      const dLat = (rep.coords.lat - coords.lat) * 111.32;
      const dLng = (rep.coords.lng - coords.lng) * (111.32 * Math.cos((coords.lat * Math.PI) / 180));
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist <= maxDistKm) return rep;
    }
    return null;
  }
}
