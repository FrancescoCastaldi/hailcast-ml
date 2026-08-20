import { ConvectiveSounding, HailPrediction, HailSeverity } from '../types/meteorology';

/**
 * Calcolo dell'energia cinetica del radar per la grandine (Witt et al., 1998)
 * @param dbz Riflettività radar in dBZ
 * @returns Flusso di energia cinetica in J/(m²·s)
 */
export function calculateHailKineticEnergy(dbz: number): number {
  if (dbz <= 40) return 0;
  
  // Funzione di transizione lineare tra 40 e 50 dBZ
  const wz = dbz >= 50 ? 1 : (dbz - 40) / 10;
  
  // Formula empirica di Witt (1998)
  const eDot = 5.0e-6 * Math.pow(10, 0.084 * dbz) * wz;
  return Math.max(0, eDot);
}

/**
 * Funzione di peso termico in quota basata sull'isoterma 0°C e -20°C
 */
export function calculateHeightWeight(heightMeters: number, h0: number, hMinus20: number): number {
  if (heightMeters <= h0) return 0;
  if (heightMeters >= hMinus20) return 1;
  return (heightMeters - h0) / (hMinus20 - h0);
}

/**
 * Calcolo del Severe Hail Index (SHI)
 * SHI = 0.1 * int_{H0}^{Htop} E_dot(Z) * W(H) dH
 */
export function calculateSHI(
  maxDbz: number,
  sounding: ConvectiveSounding
): number {
  const { freezingLevel, minus20Level, echoTop } = sounding;
  
  if (maxDbz < 42 || echoTop <= freezingLevel) {
    return 0;
  }

  // Integrazione numerica a strati di 250m
  const stepMeters = 250;
  let integral = 0;

  for (let h = freezingLevel; h <= echoTop; h += stepMeters) {
    // Profilo verticale di riflettività stimato dal picco e dall'echo top
    const fraction = (h - freezingLevel) / Math.max(1000, echoTop - freezingLevel);
    // Riflettività massima nel nucleo convettivo (decresce verso l'echo top)
    const layerDbz = maxDbz - 15 * Math.pow(fraction, 1.5);
    
    const eDot = calculateHailKineticEnergy(layerDbz);
    const wH = calculateHeightWeight(h, freezingLevel, minus20Level);
    
    integral += eDot * wH * stepMeters;
  }

  const shi = 0.1 * integral;
  return Math.max(0, Math.round(shi * 10) / 10);
}

/**
 * Calcolo del Maximum Estimated Size of Hail (MESH in cm) secondo Witt et al.
 */
export function calculateMESH(shi: number): number {
  if (shi <= 0) return 0;
  // MESH in millimetri = 2.54 * (SHI)^0.5
  const meshMm = 2.54 * Math.sqrt(shi);
  const meshCm = meshMm / 10;
  return Math.round(meshCm * 10) / 10;
}

/**
 * Calcolo della Probability of Hail (POH) secondo il metodo Waldvogel
 * basato su Delta H = H_45 - H_0
 */
export function calculateWaldvogelPOH(
  height45Dbz: number,
  freezingLevel: number
): number {
  const deltaH = (height45Dbz - freezingLevel) / 1000; // in km
  if (deltaH <= 0) return 0;
  if (deltaH >= 4.5) return 100;
  
  // Curva di Waldvogel
  const poh = 22.22 * deltaH;
  return Math.min(100, Math.max(0, Math.round(poh)));
}

/**
 * Calcolo della Probability of Severe Hail (POSH: diametro >= 2.9 cm)
 */
export function calculatePOSH(shi: number): number {
  if (shi <= 10) return 0;
  // Sigmoide calibrata su dataset radar convettivi
  const posh = 100 / (1 + Math.exp(-0.065 * (shi - 65)));
  return Math.min(100, Math.max(0, Math.round(posh)));
}

/**
 * Classificazione della severità in base al diametro stimato
 */
export function classifyHailSeverity(diameterCm: number, prob: number): HailSeverity {
  if (prob < 25 || diameterCm < 0.5) return 'none';
  if (diameterCm < 2.0) return 'minor';
  if (diameterCm < 3.5) return 'moderate';
  if (diameterCm < 5.5) return 'severe';
  return 'destructive';
}

/**
 * Valutazione completa congiunta fisica + indici convettivi
 */
export function evaluateConvectiveHail(
  maxDbz: number,
  sounding: ConvectiveSounding
): HailPrediction {
  const shi = calculateSHI(maxDbz, sounding);
  const meshCm = calculateMESH(shi);
  
  // Stima quota 45 dBZ
  const h45 = Math.min(sounding.echoTop, sounding.freezingLevel + (maxDbz - 45) * 350);
  const poh = calculateWaldvogelPOH(h45, sounding.freezingLevel);
  const posh = calculatePOSH(shi);
  
  // Combinazione probabilistica pesata
  const combinedProb = Math.min(100, Math.round(0.6 * poh + 0.4 * posh));
  const severity = classifyHailSeverity(meshCm, combinedProb);
  
  // Score di rischio danno (0 - 100)
  const damageScore = Math.min(100, Math.round(
    (combinedProb * 0.4) + (Math.min(meshCm, 8) / 8 * 45) + (sounding.deepShear06km > 20 ? 15 : 5)
  ));

  const recommendations: string[] = [];
  if (severity === 'destructive') {
    recommendations.push('🚨 Allerta massima: rischio grandine gigante (>5 cm) con potenziale sfondamento parabrezza e tetti.');
    recommendations.push('🚗 Ricoverare immediatamente autovetture in garage chiusi o strutture coperte.');
    recommendations.push('🏠 Allontanarsi da finestre e verande durante il transito del nucleo temporalesco.');
  } else if (severity === 'severe') {
    recommendations.push('⚠️ Rischio grandine severa (3-5 cm): proteggere veicoli e serre agricole.');
    recommendations.push('🌧️ Possibili allagamenti lampo e violente raffiche di vento (downburst).');
  } else if (severity === 'moderate') {
    recommendations.push('🟡 Grandine di medie dimensioni (2-3 cm): prestare attenzione alla guida e all\'aperto.');
  } else if (severity === 'minor') {
    recommendations.push('🟢 Grandine piccola / pisello (<2 cm): rischio danni marginale.');
  } else {
    recommendations.push('ℹ️ Nessun rischio significativo di grandine al suolo nelle prossime ore.');
  }

  return {
    probability: combinedProb,
    expectedDiameterCm: meshCm,
    severityClass: severity,
    shi,
    posh,
    damageRiskScore: damageScore,
    recommendations
  };
}
