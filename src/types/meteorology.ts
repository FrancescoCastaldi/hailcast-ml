export type HailSeverity = 'none' | 'minor' | 'moderate' | 'severe' | 'destructive';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ConvectiveSounding {
  cape: number;           // J/kg (Convective Available Potential Energy)
  cin: number;            // J/kg (Convective Inhibition)
  liftedIndex: number;    // °C
  freezingLevel: number;  // meters (H0, 0°C isotherm)
  minus20Level: number;   // meters (H-20, -20°C isotherm)
  deepShear06km: number;  // m/s (0-6km bulk wind shear)
  srh03km: number;        // m²/s² (Storm Relative Helicity)
  dewPointDepression: number; // °C (T - Td at 850hPa)
  echoTop: number;        // meters
  vil: number;            // kg/m² (Vertically Integrated Liquid)
}

export interface RadarPoint {
  lat: number;
  lng: number;
  dbz: number;            // Radar reflectivity in dBZ
}

export interface StormCell {
  id: string;
  name: string;
  centroid: Coordinates;
  maxDbz: number;
  polygon: Coordinates[];
  velocity: {
    speedKmh: number;
    directionDeg: number; // Azimuth (0 = North, 90 = East)
    vx: number;           // km/h Eastward
    vy: number;           // km/h Northward
  };
  sounding: ConvectiveSounding;
  meshDiameterCm: number;
  pohPercentage: number;
  poshPercentage: number;
  severity: HailSeverity;
  trend: 'intensifying' | 'steady' | 'weakening';
  nowcastCones: NowcastCone[];
  impactedTowns?: string[];
  isNew?: boolean;
  formationStage?: 'new_initiation' | 'rapid_intensification' | 'established' | 'dissipating';
}

export interface NowcastCone {
  minutesAhead: number;  // 15, 30, 45, 60
  projectedCentroid: Coordinates;
  uncertaintyRadiusKm: number;
  polygon: Coordinates[];
}

export interface HailPrediction {
  probability: number;       // 0 - 100%
  expectedDiameterCm: number;
  severityClass: HailSeverity;
  shi: number;               // Severe Hail Index (J/(m·s))
  posh: number;              // Probability of Severe Hail (%)
  damageRiskScore: number;   // 0 - 100
  recommendations: string[];
}

export type StormPhenomenon = 'hail' | 'wind_gust' | 'downburst' | 'lightning' | 'torrential_rain' | 'tornado';

export interface SpotterReport {
  id: string;
  locationName: string;
  coords: Coordinates;
  timestamp: string;
  hailSizeCm: number;
  phenomenon?: StormPhenomenon;
  windSpeedKmh?: number;
  damageLevel: 'none' | 'leaves' | 'cars' | 'windows' | 'severe';
  notes: string;
}

export interface LocationRiskAssessment {
  locationName: string;
  coords: Coordinates;
  hailProbability: number;
  estimatedDiameterCm: number;
  severityLevel: HailSeverity;
  nearestStormDistanceKm: number;
  estimatedArrivalMinutes: number | null; // null if not on track
  stormHeading: string;
  advisoryText: string;
}

export interface RainViewerFrame {
  time: number;
  path: string;
}

export interface RainViewerApiResponse {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: RainViewerFrame[];
    nowcast: RainViewerFrame[];
  };
  satellite?: {
    infrared: RainViewerFrame[];
  };
}

export interface AlertSubscription {
  id?: string;
  label?: string;            // es. "🏠 Casa", "🏢 Lavoro", "🚗 Garage"
  enabled: boolean;
  email: string;
  locationName: string;
  coords: Coordinates;
  hailThresholdCm: number;   // 0 = qualsiasi grandine, 2.0 = > 2cm, 4.0 = > 4cm
  rainThresholdMm: number;   // 10 = pioggia forte, 25 = nubifragio
  leadTimeMinutes: number;   // 15, 30, 45, 60
  enableBrowserPush: boolean;
  lastNotifiedAt?: number;
  lastNotifiedCellId?: string;
  alertActive?: boolean;   // Isteresi: true = allerta già scattata, in attesa che la minaccia rientri sotto la banda
}

export interface AlertHistoryEntry {
  id: string;
  timestamp: string;
  locationName: string;
  email: string;
  alertType: 'hail' | 'rain' | 'test';
  cellName?: string;
  hailSizeCm?: number;
  maxDbz?: number;
  etaMinutes?: number;
  message: string;
}
