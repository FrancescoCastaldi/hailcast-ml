import { HailGenesisForecast, StormCell, Coordinates } from '../types/meteorology';

export interface VerificationMetrics {
  /** Probability of Detection: hits / (hits + misses) */
  pod: number;
  /** False Alarm Ratio: falseAlarms / (hits + falseAlarms) */
  far: number;
  /** Critical Success Index: hits / (hits + misses + falseAlarms) */
  csi: number;
  /** Frequency Bias: (hits + falseAlarms) / (hits + misses) */
  bias: number;
  /** Number of correct forecasts matched to observed cells */
  hits: number;
  /** Number of observed cells that were not forecasted */
  misses: number;
  /** Number of forecasts that did not verify */
  falseAlarms: number;
  /** Total number of forecasts evaluated */
  totalForecasts: number;
  /** Total number of observed cells */
  totalObserved: number;
  /** Human-readable score label */
  scoreLabel: string;
  /** 0-100 composite quality score */
  qualityScore: number;
}

/**
 * ForecastVerificationService — Verifica Previsioni con Metriche Scientifiche
 * 
 * Confronta le previsioni di genesi (HailGenesisForecast) con le celle
 * effettivamente osservate (StormCell) utilizzando matching spaziale e temporale.
 * 
 * Riferimenti: Wilks (2011) Statistical Methods in the Atmospheric Sciences,
 * WMO Standard Verification System for Weather Forecasts.
 */
export class ForecastVerificationService {
  /** Raggio massimo di matching spaziale (km) */
  private static SPATIAL_THRESHOLD_KM = 35;
  
  /** Storico cumulativo per metriche a lunga durata */
  private static cumulativeHits = 0;
  private static cumulativeMisses = 0;
  private static cumulativeFalseAlarms = 0;

  /**
   * Calcola la distanza (km) tra due coordinate con la formula di Haversine
   */
  private static haversineKm(a: Coordinates, b: Coordinates): number {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /**
   * Valuta le previsioni rispetto alle celle osservate.
   * 
   * Un forecast è un HIT se esiste una StormCell osservata entro:
   * - distanza < SPATIAL_THRESHOLD_KM dalla targetCoords del forecast
   * - la cella ha severity >= 'moderate' (per filtrare rumore)
   * 
   * Le celle osservate non matchate sono MISSES.
   * I forecast non matchati sono FALSE ALARMS.
   */
  public static evaluate(
    forecasts: HailGenesisForecast[],
    observedCells: StormCell[]
  ): VerificationMetrics {
    // Filtra solo i forecast attivi (non concretizzati — quelli sono già diventati celle)
    const activeForecasts = forecasts.filter(f => 
      f.maturationStage === 'imminent_trigger' || f.maturationStage === 'developing'
    );
    
    // Filtra celle con almeno severità moderata (per evitare falsi matching con pioggia debole)
    const significantCells = observedCells.filter(c => 
      c.severity !== 'none' && c.severity !== 'minor'
    );

    // Anche i forecast concretizzati contano come hit nel cumulativo
    const concretizedForecasts = forecasts.filter(f => f.maturationStage === 'concretized');

    const matchedForecasts = new Set<string>();
    const matchedCells = new Set<string>();

    // 1. Match forecast concretizzati (hit automatici — il sistema li ha già promossi)
    for (const cf of concretizedForecasts) {
      matchedForecasts.add(cf.id);
      if (cf.resultingCellId) {
        matchedCells.add(cf.resultingCellId);
      }
    }

    // 2. Match forecast attivi con celle osservate (Hungarian-style greedy matching)
    for (const forecast of activeForecasts) {
      if (matchedForecasts.has(forecast.id)) continue;

      let bestMatch: StormCell | null = null;
      let bestDist = Infinity;

      for (const cell of significantCells) {
        if (matchedCells.has(cell.id)) continue;

        const dist = this.haversineKm(forecast.targetCoords, cell.centroid);
        if (dist < this.SPATIAL_THRESHOLD_KM && dist < bestDist) {
          bestDist = dist;
          bestMatch = cell;
        }
      }

      if (bestMatch) {
        matchedForecasts.add(forecast.id);
        matchedCells.add(bestMatch.id);
      }
    }

    const allEvaluated = [...activeForecasts, ...concretizedForecasts];
    const hits = matchedForecasts.size;
    const falseAlarms = allEvaluated.length - hits;
    const misses = significantCells.length - matchedCells.size;

    // Aggiorna cumulativo
    this.cumulativeHits += hits;
    this.cumulativeMisses += misses;
    this.cumulativeFalseAlarms += falseAlarms;
    
    // Calcola metriche
    const pod = (hits + misses) > 0 ? hits / (hits + misses) : 1;
    const far = (hits + falseAlarms) > 0 ? falseAlarms / (hits + falseAlarms) : 0;
    const csi = (hits + misses + falseAlarms) > 0 ? hits / (hits + misses + falseAlarms) : 1;
    const bias = (hits + misses) > 0 ? (hits + falseAlarms) / (hits + misses) : 1;

    // Composite quality score (0-100)
    const qualityScore = Math.round(
      Math.max(0, Math.min(100,
        (csi * 50) + ((1 - far) * 30) + (pod * 20)
      ))
    );

    const scoreLabel = qualityScore >= 80 ? 'Eccellente' :
                       qualityScore >= 60 ? 'Buono' :
                       qualityScore >= 40 ? 'Discreto' :
                       qualityScore >= 20 ? 'Sufficiente' : 'In Calibrazione';

    return {
      pod: Math.round(pod * 100) / 100,
      far: Math.round(far * 100) / 100,
      csi: Math.round(csi * 100) / 100,
      bias: Math.round(bias * 100) / 100,
      hits,
      misses: Math.max(0, misses),
      falseAlarms: Math.max(0, falseAlarms),
      totalForecasts: allEvaluated.length,
      totalObserved: significantCells.length,
      scoreLabel,
      qualityScore
    };
  }

  /**
   * Restituisce le metriche cumulative aggregate nel tempo
   */
  public static getCumulativeStats(): { hits: number; misses: number; falseAlarms: number } {
    return {
      hits: this.cumulativeHits,
      misses: this.cumulativeMisses,
      falseAlarms: this.cumulativeFalseAlarms
    };
  }

  /**
   * Resetta le metriche cumulative
   */
  public static resetCumulative(): void {
    this.cumulativeHits = 0;
    this.cumulativeMisses = 0;
    this.cumulativeFalseAlarms = 0;
  }
}
