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
  lightningPotential?: number; // J/kg or index (ICON-D2 LPI)
  verticalProfile?: VerticalAtmosphericProfile;
}

export interface VerticalLevelData {
  pressureHpa: number;
  altitudeMeters: number;
  temperatureC: number;
  dewPointC: number;
  windSpeedKmh?: number;
}

export interface VerticalAtmosphericProfile {
  coords: Coordinates;
  locationName?: string;
  levels: VerticalLevelData[];
  hgzBottomMeters: number; // Quota 0°C (Base Hail Growth Zone)
  hgzTopMeters: number;    // Quota -20°C (Cima Hail Growth Zone)
  hgzThicknessMeters: number;
  cape: number;
  liftedIndex: number;
  lightningPotentialIndex?: number;
}

export interface DualPolRadarData {
  zdrDb: number;      // Differential Reflectivity in dB (-0.5 to +4.5)
  cc: number;         // Correlation Coefficient rho_hv (0.80 to 1.00)
  kdpDegKm: number;   // Specific Differential Phase
  hydrometeorClass: 'giant_hail' | 'large_hail' | 'hail_rain_mix' | 'heavy_rain' | 'moderate_rain';
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
  createdAt?: number;      // Epoch ms when cell initiated
  ageMinutes?: number;     // Elapsed active duration
  lifespanMinutes?: number;// Total expected convective lifespan (e.g. 45 - 110 min)
  isDissipated?: boolean;  // True when cell has decayed completely and should be removed
  dualPol?: DualPolRadarData;
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
  timestampMs?: number;      // Epoch ms for precise TTL expiration
  expiresAt?: number;        // Epoch ms when report expires from active view
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
  lastAlertType?: 'hail' | 'rain'; // Tipo dell'ultima allerta scattata (per riarmo selettivo)
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
