import { describe, it, expect, beforeEach } from 'vitest';
import { AlertNotificationService } from '../src/services/alert-notification-service';
import { AlertSubscription, StormCell, ConvectiveSounding } from '../src/types/meteorology';

// --- Mock localStorage (ambiente node) ---
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear()
};

// Evita chiamate di rete reali durante i test
(globalThis as Record<string, unknown>).fetch = () => Promise.reject(new Error('network disabled in tests'));

const mockSounding: ConvectiveSounding = {
  cape: 2400, cin: 20, liftedIndex: -6.0, freezingLevel: 3600, minus20Level: 6800,
  deepShear06km: 24, srh03km: 220, dewPointDepression: 3.5, echoTop: 13000, vil: 60
};

const TARGET = { lat: 45.4642, lng: 9.19 }; // Milano

function makeCell(id: string, maxDbz: number, meshCm: number, atTarget = true): StormCell {
  const centroid = atTarget ? TARGET : { lat: TARGET.lat + 2, lng: TARGET.lng + 2 }; // ~250 km: fuori rotta
  return {
    id, name: `Cella ${id}`, centroid,
    maxDbz, meshDiameterCm: meshCm,
    polygon: [centroid],
    velocity: { speedKmh: 40, directionDeg: 90, vx: 40, vy: 0 },
    sounding: mockSounding,
    pohPercentage: 60, poshPercentage: 40,
    severity: 'severe', trend: 'steady', nowcastCones: []
  };
}

function makeSub(overrides: Partial<AlertSubscription> = {}): AlertSubscription {
  return {
    id: 'sub-test', enabled: true, email: 'test@example.com',
    locationName: 'Milano', coords: TARGET,
    hailThresholdCm: 2.0, rainThresholdMm: 10, leadTimeMinutes: 30,
    enableBrowserPush: false, ...overrides
  };
}

/** Simula il passaggio del tempo: 20 min supera il cooldown località (15 min), 35 min supera anche il cooldown stessa cella (30 min) */
function ageLastNotification(subId: string, minutes = 20): void {
  const subs = AlertNotificationService.getSubscriptions();
  const sub = subs.find(s => s.id === subId);
  if (sub) {
    sub.lastNotifiedAt = Date.now() - minutes * 60 * 1000;
    AlertNotificationService.saveSubscription(sub);
  }
}

describe('AlertNotificationService — Isteresi anti "avvisi a singhiozzo"', () => {
  beforeEach(() => store.clear());

  it('scatta la prima allerta grandine quando una cella è in rotta', () => {
    AlertNotificationService.saveSubscription(makeSub());
    const res = AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    expect(res.triggered).toBe(true);
    expect(res.alert?.type).toBe('hail');
  });

  it('NON ri-notifica la stessa cella con la stessa minaccia ancora attiva (isteresi)', () => {
    AlertNotificationService.saveSubscription(makeSub());
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    ageLastNotification('sub-test');
    const res = AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    expect(res.triggered).toBe(false);
  });

  it('riarma e notifica quando la minaccia passa a una NUOVA cella', () => {
    AlertNotificationService.saveSubscription(makeSub());
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    ageLastNotification('sub-test');
    // Cella A passa oltre, arriva la cella B: nuova minaccia, deve scattare di nuovo
    const res = AlertNotificationService.checkStormCellAlerts([makeCell('B', 65, 3.0)]);
    expect(res.triggered).toBe(true);
    expect(res.alert?.cell.id).toBe('B');
  });

  it('riarma quando la minaccia rientra sotto la banda di isteresi e ri-allerta al nuovo picco', () => {
    AlertNotificationService.saveSubscription(makeSub());
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    // La cella si indebolisce sotto la banda di riarmo (mesh < 1.4 cm e dBZ < 36)
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 30, 1.0)]);
    ageLastNotification('sub-test', 35);
    // Nuovo picco: deve scattare di nuovo
    const res = AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    expect(res.triggered).toBe(true);
  });

  it('riarma un\'allerta di PIOGGIA in base alla sola soglia dBZ (non bloccata dalla MESH)', () => {
    AlertNotificationService.saveSubscription(makeSub());
    // Allerta pioggia: 55 dBZ >= 39 dBZ (soglia 10 mm/h), MESH 0.5 cm sotto soglia grandine
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 55, 0.5)]);
    // La pioggia scende sotto la banda di riarmo (35 < 36 dBZ) ma la MESH resta a 1.5 cm
    // (sotto la soglia di scatto 2.0 cm ma sopra la banda di riarmo grandine 1.4 cm)
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 35, 1.5)]);
    ageLastNotification('sub-test', 35);
    // Nuovo picco di pioggia: deve scattare di nuovo
    const res = AlertNotificationService.checkStormCellAlerts([makeCell('A', 55, 1.5)]);
    expect(res.triggered).toBe(true);
    expect(res.alert?.type).toBe('rain');
  });

  it('riarma quando la cella esce completamente dalla rotta', () => {
    AlertNotificationService.saveSubscription(makeSub());
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    // Cella fuori rotta (250 km): nessuna minaccia -> riarmo
    AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5, false)]);
    ageLastNotification('sub-test', 35);
    const res = AlertNotificationService.checkStormCellAlerts([makeCell('A', 65, 2.5)]);
    expect(res.triggered).toBe(true);
  });
});