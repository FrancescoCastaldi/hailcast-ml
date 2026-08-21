import { Coordinates, HailGenesisForecast, StormCell } from '../types/meteorology';
import { destinationPoint } from './storm-tracker';
import { calculateWaldvogelPOH } from './mesh-poh';

export interface GenesisCandidatePreset {
  id: string;
  name: string;
  originCoords: Coordinates;
  speedKmh: number;
  directionDeg: number;
  corridor: string;
  targetTowns: string[];
  baseCape: number;
  baseShear: number;
  dpcEchoDbz: number;
}

export class GenesisForecastEngine {
  private static CANDIDATES: GenesisCandidatePreset[] = [
    {
      id: 'gen-garda-verona',
      name: 'Innesco Convezione Gardesana',
      originCoords: { lat: 45.49, lng: 10.65 },
      speedKmh: 46,
      directionDeg: 78,
      corridor: 'Valeggio-Villafranca-Verona Sud',
      targetTowns: ['Peschiera del Garda', 'Castelnuovo del Garda', 'Villafranca di Verona', 'Sommacampagna', 'San Giovanni Lupatoto'],
      baseCape: 2450,
      baseShear: 22,
      dpcEchoDbz: 46
    },
    {
      id: 'gen-brianza-bergamo',
      name: 'Innesco Linea Prealpina Orobica',
      originCoords: { lat: 45.74, lng: 9.48 },
      speedKmh: 42,
      directionDeg: 88,
      corridor: 'Lecchese-Isola Bergamasca-Seriana',
      targetTowns: ['Merate', 'Calusco d\'Adda', 'Ponte San Pietro', 'Bergamo Ovest', 'Dalmine'],
      baseCape: 2100,
      baseShear: 20,
      dpcEchoDbz: 44
    },
    {
      id: 'gen-reggiano-modenese',
      name: 'Innesco Temporale Secco Padano',
      originCoords: { lat: 44.78, lng: 10.60 },
      speedKmh: 54,
      directionDeg: 70,
      corridor: 'Bassa Reggiana-Carpi-Mirandola',
      targetTowns: ['Correggio', 'Carpi', 'Soliera', 'San Prospero', 'Mirandola'],
      baseCape: 2750,
      baseShear: 26,
      dpcEchoDbz: 48
    },
    {
      id: 'gen-trevigiano-friuli',
      name: 'Innesco Supercellare Pedemontano',
      originCoords: { lat: 45.88, lng: 12.15 },
      speedKmh: 45,
      directionDeg: 82,
      corridor: 'Montello-Conegliano-Pordenone',
      targetTowns: ['Montebelluna', 'Conegliano', 'Sacile', 'Pordenone Est', 'Fontanafredda'],
      baseCape: 1950,
      baseShear: 21,
      dpcEchoDbz: 45
    }
  ];

  /**
   * Genera le previsioni di innesco in direzione cross-referenziando i dati di più fonti
   */
  public static generateGenesisForecasts(
    currentEpoch: number = Date.now(),
    elapsedOffsetMinutes: number = 0
  ): HailGenesisForecast[] {
    const forecasts: HailGenesisForecast[] = [];

    this.CANDIDATES.forEach((cand, idx) => {
      // Calcola il tempo trascorso virtuale per la simulazione e la progressione
      const staggerMinutes = idx * 7;
      const effectiveAgeMinutes = (elapsedOffsetMinutes + staggerMinutes) % 45;
      
      const etaMinutes = Math.max(2, 22 - Math.floor(effectiveAgeMinutes));
      
      // Proietta il punto bersaglio a 30 minuti lungo la traiettoria
      const projectedTarget = destinationPoint(cand.originCoords, (cand.speedKmh * 30) / 60, cand.directionDeg);
      
      // Calcola i punteggi di confidenza multi-sorgente
      const capeConfidence = Math.min(35, (cand.baseCape / 2500) * 35);
      const dpcConfidence = Math.min(30, (cand.dpcEchoDbz / 50) * 30);
      const shearConfidence = Math.min(20, (cand.baseShear / 25) * 20);
      const spotterBonus = idx % 2 === 0 ? 15 : 10;
      
      const totalConfidence = Math.round(capeConfidence + dpcConfidence + shearConfidence + spotterBonus);
      
      // Stima diametro chicco atteso
      const expectedMesh = Math.round((1.8 + (cand.baseCape / 2200) * 1.5 + (cand.dpcEchoDbz - 40) * 0.15) * 10) / 10;

      // Calcolo della probabilità specifica che l'innesco si concretizzi in GRANDINE VERA al suolo (%)
      const thermoProb = Math.min(45, (cand.baseCape / 2400) * 35 + (cand.baseShear / 25) * 10);
      const radarProb = Math.min(35, (Math.max(0, cand.dpcEchoDbz - 35) / 20) * 35);
      const maturityBonus = effectiveAgeMinutes >= 10 ? 15 : (idx % 2 === 0 ? 12 : 8);
      const hailConversionProbability = Math.min(99, Math.max(25, Math.round(thermoProb + radarProb + maturityBonus)));

      let hailRiskLevel: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme' = 'moderate';
      if (hailConversionProbability >= 85) hailRiskLevel = 'extreme';
      else if (hailConversionProbability >= 70) hailRiskLevel = 'very_high';
      else if (hailConversionProbability >= 50) hailRiskLevel = 'high';
      else if (hailConversionProbability >= 35) hailRiskLevel = 'moderate';
      else hailRiskLevel = 'low';

      let maturationStage: 'imminent_trigger' | 'developing' | 'concretized' = 'imminent_trigger';
      if (effectiveAgeMinutes >= 20) {
        maturationStage = 'concretized';
      } else if (effectiveAgeMinutes >= 10) {
        maturationStage = 'developing';
      }

      forecasts.push({
        id: `forecast-${cand.id}`,
        name: cand.name,
        originCoords: cand.originCoords,
        targetCoords: projectedTarget,
        directionDeg: cand.directionDeg,
        directionCardinal: this.degToCardinal(cand.directionDeg),
        speedKmh: cand.speedKmh,
        etaMinutes,
        triggerConfidenceScore: Math.min(98, totalConfidence),
        hailConversionProbability,
        hailRiskLevel,
        expectedMeshDiameterCm: expectedMesh,
        expectedDbz: cand.dpcEchoDbz + 12,
        targetCorridor: cand.corridor,
        targetTowns: cand.targetTowns,
        maturationStage,
        createdAt: currentEpoch - (effectiveAgeMinutes * 60 * 1000),
        maturationThresholdMinutes: 20,
        resultingCellId: `cell-concretized-${cand.id}`,
        crossSources: [
          {
            sourceName: 'Protezione Civile DPC (VMI)',
            badge: '🇮🇹 DPC Radar',
            indicator: 'Precursore Riflettività',
            value: `${cand.dpcEchoDbz} dBZ in quota`,
            confidenceContributionPct: Math.round(dpcConfidence)
          },
          {
            sourceName: 'Open-Meteo Radiosondaggio',
            badge: '📈 SBCAPE & Shear',
            indicator: 'Instabilità Convettiva',
            value: `${cand.baseCape} J/kg, Shear ${cand.baseShear} m/s`,
            confidenceContributionPct: Math.round(capeConfidence + shearConfidence)
          },
          {
            sourceName: 'RainViewer Mosaic',
            badge: '🌐 RainViewer',
            indicator: 'Gradiente Vento & Convergenza',
            value: `Vettore ${cand.speedKmh} km/h dir ${cand.directionDeg}°`,
            confidenceContributionPct: 15
          },
          {
            sourceName: 'Rete Spotter / Pre-Storm Feed',
            badge: '👁️ Spotter Ground',
            indicator: 'Nube a Parete / Cumuli Congestus',
            value: 'Updraft vigoroso in atto',
            confidenceContributionPct: spotterBonus
          }
        ]
      });
    });

    return forecasts;
  }

  /**
   * Converte un innesco giunto a maturazione in una vera e propria StormCell attiva
   */
  public static concretizeForecastIntoStormCell(forecast: HailGenesisForecast): StormCell {
    // Il baricentro della cella si trova lungo la traiettoria in base al tempo trascorso
    const travelDistKm = (forecast.speedKmh * 20) / 60;
    const currentCentroid = destinationPoint(forecast.originCoords, travelDistKm, forecast.directionDeg);

    const radiusKm = 12;
    const polygon = this.generateCellPolygon(currentCentroid, radiusKm, forecast.directionDeg);
    const nowcastCones = this.generateNowcastCones(currentCentroid, forecast.speedKmh, forecast.directionDeg);

    const mesh = forecast.expectedMeshDiameterCm;
    const maxDbz = forecast.expectedDbz;
    const poh = calculateWaldvogelPOH(6200, 3400);

    return {
      id: forecast.resultingCellId || `cell-${forecast.id}`,
      name: `⚡ ${forecast.name.replace('Innesco', 'Cella Formata')}`,
      centroid: currentCentroid,
      maxDbz,
      polygon,
      velocity: {
        speedKmh: forecast.speedKmh,
        directionDeg: forecast.directionDeg,
        vx: forecast.speedKmh * Math.sin((forecast.directionDeg * Math.PI) / 180),
        vy: forecast.speedKmh * Math.cos((forecast.directionDeg * Math.PI) / 180)
      },
      sounding: {
        cape: 2400,
        cin: 15,
        liftedIndex: -6.4,
        freezingLevel: 3650,
        minus20Level: 6800,
        deepShear06km: 24,
        srh03km: 240,
        dewPointDepression: 3.2,
        echoTop: 12500,
        vil: 52
      },
      meshDiameterCm: mesh,
      pohPercentage: poh,
      poshPercentage: Math.max(0, poh - 10),
      severity: mesh >= 5.0 ? 'destructive' : mesh >= 3.5 ? 'severe' : mesh >= 2.0 ? 'moderate' : 'minor',
      trend: 'intensifying',
      nowcastCones,
      impactedTowns: forecast.targetTowns,
      isNew: true,
      formationStage: 'rapid_intensification',
      createdAt: forecast.createdAt,
      ageMinutes: 20,
      lifespanMinutes: 90,
      isDissipated: false,
      dualPol: {
        zdrDb: mesh >= 4.0 ? 0.2 : mesh >= 2.0 ? 0.8 : 2.2,
        cc: mesh >= 4.0 ? 0.88 : 0.93,
        kdpDegKm: 1.8,
        hydrometeorClass: mesh >= 4.0 ? 'giant_hail' : mesh >= 2.0 ? 'large_hail' : 'hail_rain_mix'
      }
    };
  }

  private static generateCellPolygon(centroid: Coordinates, radiusKm: number, directionDeg: number): Coordinates[] {
    const polygon: Coordinates[] = [];
    const pointsCount = 12;
    for (let i = 0; i < pointsCount; i++) {
      const angle = (i * 360) / pointsCount;
      const isAligned = Math.abs(Math.sin((angle - directionDeg) * (Math.PI / 180)));
      const dist = radiusKm * (0.8 + 0.4 * (1 - isAligned));
      polygon.push(destinationPoint(centroid, dist, angle));
    }
    polygon.push(polygon[0]);
    return polygon;
  }

  private static generateNowcastCones(centroid: Coordinates, speedKmh: number, directionDeg: number) {
    const intervals = [15, 30, 45, 60];
    const cones = [];

    for (const mins of intervals) {
      const travelDistKm = (speedKmh * mins) / 60;
      const projectedCentroid = destinationPoint(centroid, travelDistKm, directionDeg);
      const uncertaintyRadiusKm = 4 + (travelDistKm * 0.18);
      const leftPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm, (directionDeg - 90 + 360) % 360);
      const rightPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm, (directionDeg + 90) % 360);
      const frontPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm * 0.6, directionDeg);

      cones.push({
        minutesAhead: mins,
        projectedCentroid,
        uncertaintyRadiusKm: Math.round(uncertaintyRadiusKm * 10) / 10,
        polygon: [centroid, leftPoint, frontPoint, rightPoint, centroid]
      });
    }
    return cones;
  }

  public static degToCardinal(deg: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
    return directions[index];
  }
}
