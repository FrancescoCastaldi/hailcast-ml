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

  private static isPointInPolygon(pt: Coordinates, poly: Coordinates[]): boolean {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].lat, yi = poly[i].lng;
      const xj = poly[j].lat, yj = poly[j].lng;
      const intersect = ((yi > pt.lng) !== (yj > pt.lng)) &&
        (pt.lat < (xj - xi) * (pt.lng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Valuta il rischio immediato e l'ETA d'impatto per una coordinata target in modo coerente
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
        hailProbability: 0,
        estimatedDiameterCm: 0,
        severityLevel: 'none',
        nearestStormDistanceKm: 999,
        estimatedArrivalMinutes: null,
        stormHeading: 'Nessuna attività rilevata',
        advisoryText: 'Condizioni stabili: nessun temporale convettivo attivo nell\'area.'
      };
    }

    // 1. Controlla se il punto cliccato si trova DIRETTAMENTE DENTRO il poligono o a meno di 14 km dal centroide di una cella
    const directHitCell = stormCells.find(c =>
      this.isPointInPolygon(targetCoords, c.polygon) ||
      calculateHaversineDistanceKm(c.centroid, targetCoords) <= 14
    );

    if (directHitCell) {
      const dist = calculateHaversineDistanceKm(directHitCell.centroid, targetCoords);
      return {
        locationName: targetName,
        coords: targetCoords,
        hailProbability: directHitCell.pohPercentage,
        estimatedDiameterCm: directHitCell.meshDiameterCm,
        severityLevel: directHitCell.severity,
        nearestStormDistanceKm: Math.round(dist),
        estimatedArrivalMinutes: 0,
        stormHeading: `${directHitCell.velocity.speedKmh} km/h verso ${Math.round(directHitCell.velocity.directionDeg)}°`,
        advisoryText: `🚨 TEMPORALE CON GRANDINE IN CORSO SOPRA LA TUA ZONA: Rilevati ${directHitCell.maxDbz} dBZ (${directHitCell.name}) con chicchi stimati di ${directHitCell.meshDiameterCm} cm. Mettersi subito al riparo!`
      };
    }

    // 2. Controlla celle in arrivo lungo la traiettoria di nowcast
    let incomingCell: StormCell | null = null;
    let minETA: number | null = null;
    let incomingDist: number = Infinity;

    // 3. Trova anche la cella in assoluto più vicina
    let closestCell: StormCell = stormCells[0];
    let minDistance = Infinity;

    for (const cell of stormCells) {
      const dist = calculateHaversineDistanceKm(cell.centroid, targetCoords);
      if (dist < minDistance) {
        minDistance = dist;
        closestCell = cell;
      }

      // Verifica rotta verso il target
      const bearingToTarget = calculateBearingDeg(cell.centroid, targetCoords);
      const angleDiff = Math.abs((cell.velocity.directionDeg - bearingToTarget + 180) % 360 - 180);

      // Angolo di tolleranza di 40 gradi
      if (angleDiff <= 40 && cell.velocity.speedKmh > 5) {
        const etaMinutes = Math.round((dist / cell.velocity.speedKmh) * 60);
        if (etaMinutes <= 90) {
          if (minETA === null || etaMinutes < minETA) {
            minETA = etaMinutes;
            incomingCell = cell;
            incomingDist = dist;
          }
        }
      }
    }

    if (incomingCell && minETA !== null && minETA <= 60) {
      return {
        locationName: targetName,
        coords: targetCoords,
        hailProbability: Math.max(30, Math.round(incomingCell.pohPercentage * (1 - incomingDist / 120))),
        estimatedDiameterCm: incomingCell.meshDiameterCm,
        severityLevel: incomingCell.severity,
        nearestStormDistanceKm: Math.round(incomingDist),
        estimatedArrivalMinutes: minETA,
        stormHeading: `${incomingCell.velocity.speedKmh} km/h verso ${Math.round(incomingCell.velocity.directionDeg)}°`,
        advisoryText: `⚠️ ALLERTA GRANDINE: ${incomingCell.name} (${incomingCell.maxDbz} dBZ) in arrivo su ${targetName} in circa ${minETA} minuti. Chicchi stimati MESH: ${incomingCell.meshDiameterCm} cm.`
      };
    }

    // Se vicina (< 30 km) ma non in traiettoria diretta
    if (minDistance <= 30) {
      const severity = closestCell.severity === 'destructive' ? 'severe' : closestCell.severity === 'severe' ? 'moderate' : 'minor';
      return {
        locationName: targetName,
        coords: targetCoords,
        hailProbability: Math.round(closestCell.pohPercentage * 0.65),
        estimatedDiameterCm: +(closestCell.meshDiameterCm * 0.75).toFixed(1),
        severityLevel: severity,
        nearestStormDistanceKm: Math.round(minDistance),
        estimatedArrivalMinutes: null,
        stormHeading: `${closestCell.velocity.speedKmh} km/h verso ${Math.round(closestCell.velocity.directionDeg)}°`,
        advisoryText: `🟡 Cella convettiva attiva a ${Math.round(minDistance)} km (${closestCell.name}). Possibili raffiche di vento e piogge intense nelle vicinanze.`
      };
    }

    // Se a distanza media (30 - 65 km)
    if (minDistance <= 65) {
      return {
        locationName: targetName,
        coords: targetCoords,
        hailProbability: 20,
        estimatedDiameterCm: +(closestCell.meshDiameterCm * 0.4).toFixed(1),
        severityLevel: 'minor',
        nearestStormDistanceKm: Math.round(minDistance),
        estimatedArrivalMinutes: null,
        stormHeading: `${closestCell.velocity.speedKmh} km/h verso ${Math.round(closestCell.velocity.directionDeg)}°`,
        advisoryText: `☁️ Temporale a ${Math.round(minDistance)} km (${closestCell.name}). Nessun impatto diretto atteso sulla tua posizione.`
      };
    }

    // Distanza elevata (> 65 km): rischio nullo
    return {
      locationName: targetName,
      coords: targetCoords,
      hailProbability: 0,
      estimatedDiameterCm: 0,
      severityLevel: 'none',
      nearestStormDistanceKm: Math.round(minDistance),
      estimatedArrivalMinutes: null,
      stormHeading: 'N/A',
      advisoryText: `🟢 Condizioni stabili: nessuna cella temporalesca nel raggio di ${Math.round(minDistance)} km.`
    };
  }
}
