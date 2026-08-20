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

const ITALIAN_TOWNS: { name: string; coords: Coordinates }[] = [
  // Veneto & Garda
  { name: 'Verona', coords: { lat: 45.438, lng: 10.991 } },
  { name: 'Villafranca', coords: { lat: 45.352, lng: 10.843 } },
  { name: 'Peschiera del Garda', coords: { lat: 45.438, lng: 10.693 } },
  { name: 'Desenzano del Garda', coords: { lat: 45.468, lng: 10.536 } },
  { name: 'Sirmione', coords: { lat: 45.492, lng: 10.608 } },
  { name: 'Lazise', coords: { lat: 45.505, lng: 10.732 } },
  { name: 'Bardolino', coords: { lat: 45.547, lng: 10.722 } },
  { name: 'Sommacampagna', coords: { lat: 45.405, lng: 10.857 } },
  { name: 'San Bonifacio', coords: { lat: 45.399, lng: 11.275 } },
  { name: 'Legnago', coords: { lat: 45.193, lng: 11.309 } },
  { name: 'Vicenza', coords: { lat: 45.545, lng: 11.535 } },
  { name: 'Padova', coords: { lat: 45.406, lng: 11.876 } },
  { name: 'Treviso', coords: { lat: 45.666, lng: 12.243 } },
  { name: 'Venezia', coords: { lat: 45.440, lng: 12.315 } },
  { name: 'Rovigo', coords: { lat: 45.071, lng: 11.790 } },
  // Lombardia
  { name: 'Milano', coords: { lat: 45.464, lng: 9.190 } },
  { name: 'Brescia', coords: { lat: 45.541, lng: 10.211 } },
  { name: 'Bergamo', coords: { lat: 45.698, lng: 9.677 } },
  { name: 'Mantova', coords: { lat: 45.156, lng: 10.791 } },
  { name: 'Cremona', coords: { lat: 45.133, lng: 10.022 } },
  { name: 'Castiglione d/S', coords: { lat: 45.395, lng: 10.490 } },
  { name: 'Montichiari', coords: { lat: 45.414, lng: 10.395 } },
  { name: 'Lonato', coords: { lat: 45.461, lng: 10.485 } },
  { name: 'Salò', coords: { lat: 45.607, lng: 10.528 } },
  { name: 'Monza', coords: { lat: 45.584, lng: 9.274 } },
  { name: 'Pavia', coords: { lat: 45.184, lng: 9.158 } },
  { name: 'Lodi', coords: { lat: 45.313, lng: 9.503 } },
  { name: 'Crema', coords: { lat: 45.364, lng: 9.685 } },
  // Emilia-Romagna
  { name: 'Bologna', coords: { lat: 44.494, lng: 11.342 } },
  { name: 'Modena', coords: { lat: 44.647, lng: 10.925 } },
  { name: 'Reggio Emilia', coords: { lat: 44.698, lng: 10.631 } },
  { name: 'Parma', coords: { lat: 44.801, lng: 10.327 } },
  { name: 'Piacenza', coords: { lat: 45.052, lng: 9.693 } },
  { name: 'Ferrara', coords: { lat: 44.838, lng: 11.619 } },
  { name: 'Ravenna', coords: { lat: 44.418, lng: 12.203 } },
  { name: 'Forlì', coords: { lat: 44.222, lng: 12.040 } },
  { name: 'Rimini', coords: { lat: 44.067, lng: 12.569 } },
  { name: 'Carpi', coords: { lat: 44.784, lng: 10.885 } },
  // Piemonte & Liguria
  { name: 'Torino', coords: { lat: 45.070, lng: 7.686 } },
  { name: 'Novara', coords: { lat: 45.446, lng: 8.620 } },
  { name: 'Alessandria', coords: { lat: 44.913, lng: 8.618 } },
  { name: 'Asti', coords: { lat: 44.900, lng: 8.206 } },
  { name: 'Cuneo', coords: { lat: 44.384, lng: 7.542 } },
  { name: 'Genova', coords: { lat: 44.405, lng: 8.946 } },
  { name: 'La Spezia', coords: { lat: 44.102, lng: 9.824 } },
  // Trentino & Friuli
  { name: 'Trento', coords: { lat: 46.074, lng: 11.121 } },
  { name: 'Rovereto', coords: { lat: 45.890, lng: 11.043 } },
  { name: 'Riva del Garda', coords: { lat: 45.885, lng: 10.841 } },
  { name: 'Bolzano', coords: { lat: 46.498, lng: 11.354 } },
  { name: 'Udine', coords: { lat: 46.071, lng: 13.234 } },
  { name: 'Pordenone', coords: { lat: 45.956, lng: 12.660 } },
  { name: 'Trieste', coords: { lat: 45.649, lng: 13.776 } },
  // Centro
  { name: 'Firenze', coords: { lat: 43.769, lng: 11.255 } },
  { name: 'Pisa', coords: { lat: 43.722, lng: 10.401 } },
  { name: 'Livorno', coords: { lat: 43.548, lng: 10.310 } },
  { name: 'Arezzo', coords: { lat: 43.463, lng: 11.879 } },
  { name: 'Lucca', coords: { lat: 43.842, lng: 10.502 } },
  { name: 'Perugia', coords: { lat: 43.110, lng: 12.390 } },
  { name: 'Ancona', coords: { lat: 43.615, lng: 13.518 } },
  { name: 'Roma', coords: { lat: 41.902, lng: 12.496 } }
];

export function findImpactedTowns(
  centroid: Coordinates,
  speedKmh: number,
  directionDeg: number,
  maxMinutes: number = 60
): string[] {
  const towns: { name: string; eta: number }[] = [];
  const maxDistanceKm = (speedKmh * maxMinutes) / 60;

  for (const town of ITALIAN_TOWNS) {
    const dist = calculateHaversineDistanceKm(centroid, town.coords);
    if (dist <= maxDistanceKm + 12) {
      const bearing = calculateBearingDeg(centroid, town.coords);
      const angleDiff = Math.abs((directionDeg - bearing + 180) % 360 - 180);
      if (angleDiff <= 40) {
        const eta = Math.max(5, Math.round((dist / speedKmh) * 60));
        towns.push({ name: town.name, eta });
      }
    }
  }

  towns.sort((a, b) => a.eta - b.eta);
  return towns.map(t => `${t.name} (~${t.eta}m)`).slice(0, 4);
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
    radiusKm: number = 12,
    isNew: boolean = false,
    formationStage: 'new_initiation' | 'rapid_intensification' | 'established' | 'dissipating' = 'established'
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
    const impactedTowns = findImpactedTowns(centroid, speedKmh, directionDeg, 60);

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
      trend: isNew ? 'intensifying' : maxDbz > 58 ? 'intensifying' : 'steady',
      nowcastCones,
      impactedTowns,
      isNew,
      formationStage
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
