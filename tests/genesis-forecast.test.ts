import { describe, it, expect } from 'vitest';
import { GenesisForecastEngine } from '../src/ml/genesis-forecast-engine';
import { MultiSourceStormDetector } from '../src/services/multi-source-tracker';

describe('GenesisForecastEngine & Previsioni in Direzione', () => {
  it('dovrebbe generare previsioni di innesco con evidenze multi-sorgente incrociate', () => {
    const forecasts = GenesisForecastEngine.generateGenesisForecasts(Date.now(), 0);
    expect(forecasts.length).toBeGreaterThan(0);

    for (const f of forecasts) {
      expect(f.id).toBeDefined();
      expect(f.name).toContain('Innesco');
      expect(f.originCoords.lat).toBeGreaterThan(40);
      expect(f.targetCoords.lat).toBeGreaterThan(40);
      expect(f.speedKmh).toBeGreaterThan(20);
      expect(f.triggerConfidenceScore).toBeGreaterThanOrEqual(40);
      expect(f.hailConversionProbability).toBeGreaterThanOrEqual(25);
      expect(f.hailConversionProbability).toBeLessThanOrEqual(100);
      expect(['low', 'moderate', 'high', 'very_high', 'extreme']).toContain(f.hailRiskLevel);
      expect(f.crossSources.length).toBeGreaterThanOrEqual(3);
      
      // Verifica presenza delle fonti incrociate chiave
      const sourceNames = f.crossSources.map(s => s.sourceName);
      expect(sourceNames.some(s => s.includes('Protezione Civile') || s.includes('DPC'))).toBe(true);
      expect(sourceNames.some(s => s.includes('Open-Meteo') || s.includes('SBCAPE'))).toBe(true);
      expect(sourceNames.some(s => s.includes('RainViewer'))).toBe(true);
    }
  });

  it('dovrebbe evolvere lo stato di maturazione all\'avanzare del tempo (concretizzazione in cella attiva)', () => {
    // A t = 0 min, gli inneschi sono in fase trigger o developing
    const initialForecasts = GenesisForecastEngine.generateGenesisForecasts(Date.now(), 0);
    const hasActiveTrigger = initialForecasts.some(f => f.maturationStage === 'imminent_trigger' || f.maturationStage === 'developing');
    expect(hasActiveTrigger).toBe(true);

    // Con offset temporale avanzato (+25 min), l'innesco deve concretizzarsi
    const advancedForecasts = GenesisForecastEngine.generateGenesisForecasts(Date.now(), 25);
    const concretized = advancedForecasts.find(f => f.maturationStage === 'concretized');
    expect(concretized).toBeDefined();

    if (concretized) {
      const resultingCell = GenesisForecastEngine.concretizeForecastIntoStormCell(concretized);
      expect(resultingCell.id).toBeDefined();
      expect(resultingCell.name).toContain('Cella Formata');
      expect(resultingCell.maxDbz).toBeGreaterThanOrEqual(50);
      expect(resultingCell.meshDiameterCm).toBeGreaterThan(1.0);
      expect(resultingCell.polygon.length).toBeGreaterThanOrEqual(4);
      expect(resultingCell.nowcastCones.length).toBe(4);
    }
  });

  it('dovrebbe convertire correttamente i gradi in punti cardinali', () => {
    expect(GenesisForecastEngine.degToCardinal(0)).toBe('N');
    expect(GenesisForecastEngine.degToCardinal(90)).toBe('E');
    expect(GenesisForecastEngine.degToCardinal(180)).toBe('S');
    expect(GenesisForecastEngine.degToCardinal(270)).toBe('W');
    expect(GenesisForecastEngine.degToCardinal(78)).toBe('ENE');
  });

  it('dovrebbe essere integrato in MultiSourceStormDetector', () => {
    const forecasts = MultiSourceStormDetector.getGenesisForecasts(0);
    expect(forecasts).toBeDefined();
    expect(forecasts.length).toBeGreaterThan(0);
  });
});
