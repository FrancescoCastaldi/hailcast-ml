import { Coordinates, NowcastCone, StormCell, LocationRiskAssessment, ConvectiveSounding } from '../types/meteorology';
import { HailPredictorML } from './hail-ml-model';

/**
 * Calcola la distanza del cerchio massimo (Formula di Haversine) tra due coordinate in chilometri
 */
export function calculateHaversineDistanceKm(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371; // Raggio terrestre medio in km
  const dLat = (coord2.lat - coord1.lat) * (Math.PI / 180);
  const dLon = (coord2.lng - coord1.lng) * (Math.PI / 180);
  const lat1 = coord1.lat * (Math.PI / 180);
  const lat2 = coord2.lat * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Calcola il bearing iniziale (azimuth in gradi 0-360) da coord1 a coord2
 */
export function calculateBearingDeg(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const lat1 = coord1.lat * (Math.PI / 180);
  const lat2 = coord2.lat * (Math.PI / 180);
  const dLon = (coord2.lng - coord1.lng) * (Math.PI / 180);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

/**
 * Converte bearing e distanza in una nuova coordinata geografica
 */
export function destinationPoint(
  start: Coordinates,
  distanceKm: number,
  bearingDeg: number
): Coordinates {
  const R = 6371;
  const δ = distanceKm / R;
  const θ = bearingDeg * (Math.PI / 180);
  const φ1 = start.lat * (Math.PI / 180);
  const λ1 = start.lng * (Math.PI / 180);

  const sinφ2 =
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2);
  const λ2 = λ1 + Math.atan2(y, x);

  return {
    lat: φ2 * (180 / Math.PI),
    lng: ((λ2 * (180 / Math.PI) + 540) % 360) - 180
  };
}

/**
 * Genera i coni di incertezza predittiva per il nowcasting (15, 30, 45, 60 minuti)
 */
export function generateNowcastCones(
  centroid: Coordinates,
  speedKmh: number,
  directionDeg: number
): NowcastCone[] {
  const intervals = [15, 30, 45, 60];
  const cones: NowcastCone[] = [];

  for (const mins of intervals) {
    const travelDistKm = (speedKmh * mins) / 60;
    const projectedCentroid = destinationPoint(centroid, travelDistKm, directionDeg);
    
    // Incertezza conica crescente col tempo (allargamento laterale del cono)
    const uncertaintyRadiusKm = 4 + (travelDistKm * 0.18);
    
    // Costruzione del poligono di inviluppo del cono
    const leftPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm, (directionDeg - 90 + 360) % 360);
    const rightPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm, (directionDeg + 90) % 360);
    const frontPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm * 0.6, directionDeg);

    cones.push({
      minutesAhead: mins,
      projectedCentroid,
      uncertaintyRadiusKm,
      polygon: [centroid, leftPoint, frontPoint, rightPoint, centroid]
    });
  }

  return cones;
}

/**
 * Motore di Tracking & Proiezione Nowcasting delle celle temporalesche
 */
export class StormTracker {
  /**
   * Crea una cella temporalesca completa con vettori di spostamento e predizione MESH/ML
   */
  public static createStormCell(
    id: string,
    name: string,
    centroid: Coordinates,
    maxDbz: number,
    speedKmh: number,
    directionDeg: number,
    sounding: ConvectiveSounding,
    radiusKm: number = 12
  ): StormCell {
    // Calcola componenti vettoriali
    const rad = directionDeg * (Math.PI / 180);
    const vx = speedKmh * Math.sin(rad); // Eastward
    const vy = speedKmh * Math.cos(rad); // Northward

    // Genera poligono del nucleo riflettente (approssimazione ellittica orientata)
    const polygon: Coordinates[] = [];
    const pointsCount = 12;
    for (let i = 0; i < pointsCount; i++) {
      const angle = (i * 360) / pointsCount;
      // Allungamento lungo la direzione del vento
      const isAligned = Math.abs(Math.sin((angle - directionDeg) * (Math.PI / 180)));
      const dist = radiusKm * (0.8 + 0.4 * (1 - isAligned));
      polygon.push(destinationPoint(centroid, dist, angle));
    }
    polygon.push(polygon[0]); // Chiusura poligono

    const nowcastCones = generateNowcastCones(centroid, speedKmh, directionDeg);
    const prediction = HailPredictorML.predict(maxDbz, sounding);

    return {
      id,
      name,
      centroid,
      maxDbz,
      polygon,
      velocity: {
        speedKmh,
        directionDeg,
        vx,
        vy
      },
      sounding,
      meshDiameterCm: prediction.expectedDiameterCm,
      pohPercentage: prediction.probability,
      poshPercentage: prediction.posh,
      severity: prediction.severityClass,
      trend: maxDbz > 58 ? 'intensifying' : 'steady',
      nowcastCones
    };
  }

  /**
   * Proietta le coordinate e i poligoni delle celle temporalesche in base all'offset temporale della timeline (in minuti)
   * Consente l'animazione dinamica dello spostamento della grandine nel passato e nel futuro (nowcasting).
   */
  public static projectStormCellsForOffset(
    baseCells: StormCell[],
    offsetMinutes: number
  ): StormCell[] {
    if (offsetMinutes === 0) return baseCells;

    return baseCells.map(cell => {
      // Distanza percorsa in km in base alla velocità della cella
      const distanceKm = (cell.velocity.speedKmh * offsetMinutes) / 60;
      const newCentroid = destinationPoint(cell.centroid, distanceKm, cell.velocity.directionDeg);

      const dLat = newCentroid.lat - cell.centroid.lat;
      const dLng = newCentroid.lng - cell.centroid.lng;

      // Sposta tutti i vertici del poligono riflettente
      const newPolygon = cell.polygon.map(pt => ({
        lat: pt.lat + dLat,
        lng: pt.lng + dLng
      }));

      // Ricalcola i coni di nowcasting centrati sulla nuova posizione della cella
      const newNowcastCones = generateNowcastCones(newCentroid, cell.velocity.speedKmh, cell.velocity.directionDeg);

      // Evoluzione fisiologica di intensità lungo il ciclo di vita (sviluppo nel passato, picco, transizione)
      let adjustedDbz = cell.maxDbz;
      if (offsetMinutes < 0) {
        // Nel passato la cella era in fase di sviluppo
        adjustedDbz = Math.max(38, Math.round(cell.maxDbz - Math.abs(offsetMinutes) * 0.15));
      } else if (offsetMinutes > 30) {
        // Nel nowcast a lungo termine (>30 min) la cella tende gradualmente a esaurire l'energia convettiva
        adjustedDbz = Math.max(42, Math.round(cell.maxDbz - (offsetMinutes - 30) * 0.18));
      }

      const prediction = HailPredictorML.predict(adjustedDbz, cell.sounding);

      return {
        ...cell,
        centroid: newCentroid,
        polygon: newPolygon,
        maxDbz: adjustedDbz,
        meshDiameterCm: prediction.expectedDiameterCm,
        pohPercentage: prediction.probability,
        poshPercentage: prediction.posh,
        severity: prediction.severityClass,
        nowcastCones: newNowcastCones
      };
    });
  }

  /**
   * Valuta il rischio immediato e l'ETA d'impatto per una coordinata target
   */
  public static assessLocationRisk(
    targetName: string,
    targetCoords: Coordinates,
    stormCells: StormCell[]
  ): LocationRiskAssessment {
    if (stormCells.length === 0) {
      return {
        locationName: targetName,
        coords: targetCoords,
        hailProbability: 5,
        estimatedDiameterCm: 0,
        severityLevel: 'none',
        nearestStormDistanceKm: 999,
        estimatedArrivalMinutes: null,
        stormHeading: 'Nessuna attività rilevata',
        advisoryText: 'Nessuna minaccia temporalesca convettiva nel raggio di 100 km.'
      };
    }

    // Trova la cella più vicina o più pericolosa in avvicinamento
    let closestCell: StormCell | null = null;
    let minDistance = Infinity;
    let minETA: number | null = null;

    for (const cell of stormCells) {
      const dist = calculateHaversineDistanceKm(cell.centroid, targetCoords);
      if (dist < minDistance) {
        minDistance = dist;
        closestCell = cell;
      }

      // Verifica se la cella è in rotta di collisione verso il target
      const bearingToTarget = calculateBearingDeg(cell.centroid, targetCoords);
      const angleDiff = Math.abs((cell.velocity.directionDeg - bearingToTarget + 180) % 360 - 180);

      // Se l'angolo di scostamento è inferiore a 35 gradi, la cella sta puntando verso il target
      if (angleDiff <= 35 && cell.velocity.speedKmh > 5) {
        const etaMinutes = Math.round((dist / cell.velocity.speedKmh) * 60);
        if (etaMinutes <= 90) {
          if (minETA === null || etaMinutes < minETA) {
            minETA = etaMinutes;
            closestCell = cell;
          }
        }
      }
    }

    if (!closestCell) {
      return {
        locationName: targetName,
        coords: targetCoords,
        hailProbability: 0,
        estimatedDiameterCm: 0,
        severityLevel: 'none',
        nearestStormDistanceKm: 999,
        estimatedArrivalMinutes: null,
        stormHeading: 'N/A',
        advisoryText: 'Nessuna cella rilevata.'
      };
    }

    const headingText = `${closestCell.velocity.speedKmh} km/h verso ${Math.round(closestCell.velocity.directionDeg)}°`;
    let advisory = '';

    if (minETA !== null && minETA <= 60) {
      advisory = `⚠️ ATTENZIONE: ${closestCell.name} con riflettività ${closestCell.maxDbz} dBZ in arrivo su ${targetName} in circa ${minETA} minuti. Stima grandine MESH: ${closestCell.meshDiameterCm} cm.`;
    } else if (minDistance < 25) {
      advisory = `🟡 Cella temporalesca nelle immediate vicinanze (${minDistance} km a ${closestCell.name}). Rischio grandine locale.`;
    } else {
      advisory = `🟢 Cella attiva a ${minDistance} km (${closestCell.name}), traiettoria non direttamente incidente al momento.`;
    }

    return {
      locationName: targetName,
      coords: targetCoords,
      hailProbability: closestCell.pohPercentage,
      estimatedDiameterCm: closestCell.meshDiameterCm,
      severityLevel: closestCell.severity,
      nearestStormDistanceKm: minDistance,
      estimatedArrivalMinutes: minETA,
      stormHeading: headingText,
      advisoryText: advisory
    };
  }
}
