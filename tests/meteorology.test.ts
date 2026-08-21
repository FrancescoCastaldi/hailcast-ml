import { describe, it, expect } from 'vitest';
import {
  calculateHailKineticEnergy,
  calculateHeightWeight,
  calculateSHI,
  calculateMESH,
  calculateWaldvogelPOH,
  calculatePOSH,
  classifyHailSeverity,
  evaluateConvectiveHail
} from '../src/ml/mesh-poh';

import {
  calculateHaversineDistanceKm,
  calculateBearingDeg,
  destinationPoint,
  generateNowcastCones,
  StormTracker
} from '../src/ml/storm-tracker';

import { HailPredictorML } from '../src/ml/hail-ml-model';
import { ConvectiveSounding } from '../src/types/meteorology';
import { OpenMeteoService } from '../src/services/openmeteo';

describe('Meteorological & Physical Models (MESH / POH / SHI)', () => {
  const mockSounding: ConvectiveSounding = {
    cape: 2400,
    cin: 20,
    liftedIndex: -6.0,
    freezingLevel: 3600,
    minus20Level: 6800,
    deepShear06km: 24,
    srh03km: 220,
    dewPointDepression: 3.5,
    echoTop: 13000,
    vil: 60
  };

  it('calcola correttamente l\'energia cinetica radar (E_dot)', () => {
    expect(calculateHailKineticEnergy(35)).toBe(0);
    expect(calculateHailKineticEnergy(40)).toBe(0);
    expect(calculateHailKineticEnergy(50)).toBeGreaterThan(0);
    expect(calculateHailKineticEnergy(65)).toBeGreaterThan(calculateHailKineticEnergy(55));
  });

  it('calcola correttamente la funzione di peso in quota W(H)', () => {
    expect(calculateHeightWeight(3000, 3600, 6800)).toBe(0);
    expect(calculateHeightWeight(7000, 3600, 6800)).toBe(1);
    expect(calculateHeightWeight(5200, 3600, 6800)).toBeCloseTo(0.5, 1);
  });

  it('calcola SHI e MESH per supercelle violente', () => {
    const shi = calculateSHI(64, mockSounding);
    expect(shi).toBeGreaterThan(50);

    const meshCm = calculateMESH(shi);
    expect(meshCm).toBeGreaterThan(1.5);
    expect(meshCm).toBeLessThan(12.0);
  });

  it('calcola Waldvogel POH e POSH in funzione di Delta H e SHI', () => {
    expect(calculateWaldvogelPOH(3500, 3600)).toBe(0);
    expect(calculateWaldvogelPOH(8100, 3600)).toBe(100);
    expect(calculateWaldvogelPOH(5600, 3600)).toBeCloseTo(44, 0);

    expect(calculatePOSH(10)).toBe(0);
    expect(calculatePOSH(100)).toBeGreaterThan(80);
  });

  it('valuta la convezione con evaluateConvectiveHail', () => {
    const evalResult = evaluateConvectiveHail(62, mockSounding);
    expect(evalResult.probability).toBeGreaterThan(50);
    expect(evalResult.expectedDiameterCm).toBeGreaterThan(1.5);
    expect(evalResult.recommendations.length).toBeGreaterThan(0);
  });

  it('classifica la severità della grandine', () => {
    expect(classifyHailSeverity(0.3, 10)).toBe('none');
    expect(classifyHailSeverity(1.5, 60)).toBe('minor');
    expect(classifyHailSeverity(2.8, 80)).toBe('moderate');
    expect(classifyHailSeverity(4.2, 90)).toBe('severe');
    expect(classifyHailSeverity(6.5, 95)).toBe('destructive');
  });

  it('esegue la predizione congiunta fisica + ML', () => {
    const pred = HailPredictorML.predict(62, mockSounding);
    expect(pred.probability).toBeGreaterThanOrEqual(0);
    expect(pred.probability).toBeLessThanOrEqual(100);
    expect(pred.expectedDiameterCm).toBeGreaterThan(1.0);
    expect(pred.recommendations.length).toBeGreaterThan(0);
  });
});

describe('Storm Tracking & Geodesics (Haversine / Cones / ETA)', () => {
  it('calcola la distanza di Haversine tra due città', () => {
    const milano = { lat: 45.4642, lng: 9.1900 };
    const verona = { lat: 45.4384, lng: 10.9916 };
    const dist = calculateHaversineDistanceKm(milano, verona);
    // Distanza Milano-Verona è circa 140-145 km
    expect(dist).toBeGreaterThan(130);
    expect(dist).toBeLessThan(155);
  });

  it('calcola il bearing geografico corretto e il punto di destinazione', () => {
    const start = { lat: 45.0, lng: 10.0 };
    const east = { lat: 45.0, lng: 11.0 };
    const north = { lat: 46.0, lng: 10.0 };

    expect(calculateBearingDeg(start, east)).toBeCloseTo(90, 0);
    expect(calculateBearingDeg(start, north)).toBeCloseTo(0, 0);

    const destEast = destinationPoint(start, 50, 90);
    expect(destEast.lat).toBeCloseTo(45.0, 1);
    expect(destEast.lng).toBeGreaterThan(10.0);
  });

  it('genera coni di incertezza nowcast a 15, 30, 45, 60 minuti', () => {
    const cones = generateNowcastCones({ lat: 45.0, lng: 10.0 }, 40, 90);
    expect(cones.length).toBe(4);
    expect(cones[0].minutesAhead).toBe(15);
    expect(cones[3].minutesAhead).toBe(60);
    expect(cones[3].uncertaintyRadiusKm).toBeGreaterThan(cones[0].uncertaintyRadiusKm);
  });

  it('calcola il rischio e l\'ETA per un comune target', () => {
    const sounding: ConvectiveSounding = {
      cape: 2500,
      cin: 10,
      liftedIndex: -6.5,
      freezingLevel: 3600,
      minus20Level: 6800,
      deepShear06km: 25,
      srh03km: 240,
      dewPointDepression: 3.0,
      echoTop: 13500,
      vil: 65
    };

    const cell = StormTracker.createStormCell(
      'c1',
      'Test Cell',
      { lat: 45.30, lng: 10.50 },
      62,
      50, // 50 km/h
      60, // verso E-NE
      sounding
    );

    const targetCoords = { lat: 45.45, lng: 10.85 };
    const assessment = StormTracker.assessLocationRisk('Verona Test', targetCoords, [cell]);
    
    expect(assessment.locationName).toBe('Verona Test');
    expect(assessment.nearestStormDistanceKm).toBeLessThan(50);
  });

  it('gestisce correttamente gli stadi del ciclo di vita della cella (genesi, maturità, dissolvimento)', () => {
    const sounding: ConvectiveSounding = {
      cape: 2200,
      cin: 15,
      liftedIndex: -5.5,
      freezingLevel: 3500,
      minus20Level: 6600,
      deepShear06km: 20,
      srh03km: 200,
      dewPointDepression: 3.5,
      echoTop: 12500,
      vil: 55
    };

    const newCell = StormTracker.createStormCell(
      'new-c1',
      'Cella Nuova',
      { lat: 45.4, lng: 10.5 },
      52,
      40,
      80,
      sounding,
      12,
      true,
      'new_initiation',
      { createdAt: Date.now() - 5 * 60000, ageMinutes: 5, lifespanMinutes: 80, isDissipated: false }
    );

    expect(newCell.isNew).toBe(true);
    expect(newCell.formationStage).toBe('new_initiation');
    expect(newCell.trend).toBe('intensifying');
    expect(newCell.ageMinutes).toBe(5);

    const dissipatingCell = StormTracker.createStormCell(
      'old-c2',
      'Cella in Dissolvimento',
      { lat: 45.6, lng: 11.2 },
      40,
      35,
      85,
      sounding,
      10,
      false,
      'dissipating',
      { createdAt: Date.now() - 75 * 60000, ageMinutes: 75, lifespanMinutes: 80, isDissipated: false }
    );

    expect(dissipatingCell.formationStage).toBe('dissipating');
    expect(dissipatingCell.trend).toBe('weakening');
  });

  it('calcola correttamente i livelli isobarici e la Hail Growth Zone (HGZ)', () => {
    const profile = OpenMeteoService.getSyntheticVerticalProfile({ lat: 45.4, lng: 10.5 });
    expect(profile.levels.length).toBeGreaterThanOrEqual(6);
    expect(profile.hgzBottomMeters).toBeGreaterThan(2500);
    expect(profile.hgzTopMeters).toBeGreaterThan(profile.hgzBottomMeters);
    expect(profile.hgzThicknessMeters).toBe(profile.hgzTopMeters - profile.hgzBottomMeters);
    expect(profile.lightningPotentialIndex).toBeGreaterThan(0);
    expect(profile.lightningPotentialIndex).toBeLessThanOrEqual(100);
  });
});

