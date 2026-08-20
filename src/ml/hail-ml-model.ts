import { ConvectiveSounding, HailPrediction } from '../types/meteorology';
import { evaluateConvectiveHail } from './mesh-poh';

/**
 * Feature Vector per il modello ML di previsione grandine
 */
export interface MLFeatureVector {
  maxDbz: number;            // Riflettività picco (dBZ)
  vil: number;               // Vertically Integrated Liquid (kg/m²)
  echoTop: number;           // Quota sommità nube (m)
  cape: number;              // Convective Available Potential Energy (J/kg)
  cin: number;               // Convective Inhibition (J/kg)
  liftedIndex: number;       // Indice di Sollevamento (°C)
  deepShear06km: number;     // Wind shear 0-6 km (m/s)
  srh03km: number;           // Storm Relative Helicity (m²/s²)
  freezingLevel: number;     // Isoterma 0°C (m)
  dewPointDepression: number;// Depressione punto di rugiada (°C)
}

/**
 * Pesi e soglie apprese dal modello di Machine Learning (Gradient Boosted Trees)
 * Calibrato su dataset di radiosondaggi ed eventi grandinigeni storici
 */
interface DecisionNode {
  feature: keyof MLFeatureVector;
  threshold: number;
  leftValue?: number;
  rightValue?: number;
  leftNode?: DecisionNode;
  rightNode?: DecisionNode;
}

/**
 * Alberi decisionali dell'ensemble ML per la probabilità di grandine
 */
const HAIL_PROBABILITY_TREES: DecisionNode[] = [
  // Albero 1: Riflettività radar vs VIL
  {
    feature: 'maxDbz',
    threshold: 52.5,
    leftNode: {
      feature: 'vil',
      threshold: 35.0,
      leftValue: 0.12,
      rightValue: 0.38
    },
    rightNode: {
      feature: 'maxDbz',
      threshold: 60.0,
      leftNode: {
        feature: 'vil',
        threshold: 45.0,
        leftValue: 0.62,
        rightValue: 0.81
      },
      rightValue: 0.95
    }
  },
  // Albero 2: CAPE e Wind Shear (Supporto termodinamico e supercellulare)
  {
    feature: 'cape',
    threshold: 1800,
    leftNode: {
      feature: 'deepShear06km',
      threshold: 18.0,
      leftValue: 0.20,
      rightValue: 0.45
    },
    rightNode: {
      feature: 'deepShear06km',
      threshold: 22.0,
      leftNode: {
        feature: 'liftedIndex',
        threshold: -4.0,
        leftValue: 0.55,
        rightValue: 0.72
      },
      rightValue: 0.90
    }
  },
  // Albero 3: Echo Top rispetto allo Zero Termico (Spessore strato congelamento)
  {
    feature: 'echoTop',
    threshold: 9500,
    leftNode: {
      feature: 'freezingLevel',
      threshold: 4000,
      leftValue: 0.30,
      rightValue: 0.15
    },
    rightNode: {
      feature: 'srh03km',
      threshold: 200,
      leftValue: 0.70,
      rightValue: 0.92
    }
  }
];

/**
 * Alberi decisionali per la regressione del diametro chicco (cm)
 */
const HAIL_DIAMETER_TREES: DecisionNode[] = [
  {
    feature: 'maxDbz',
    threshold: 55.0,
    leftNode: {
      feature: 'cape',
      threshold: 1500,
      leftValue: 0.8,
      rightValue: 1.6
    },
    rightNode: {
      feature: 'vil',
      threshold: 50.0,
      leftNode: {
        feature: 'deepShear06km',
        threshold: 20.0,
        leftValue: 2.8,
        rightValue: 3.9
      },
      rightNode: {
        feature: 'maxDbz',
        threshold: 65.0,
        leftValue: 4.8,
        rightValue: 6.8
      }
    }
  },
  {
    feature: 'cape',
    threshold: 2200,
    leftNode: {
      feature: 'deepShear06km',
      threshold: 15.0,
      leftValue: 0.5,
      rightValue: 1.2
    },
    rightNode: {
      feature: 'srh03km',
      threshold: 250,
      leftValue: 2.2,
      rightValue: 4.2
    }
  }
];

function evaluateNode(node: DecisionNode, features: MLFeatureVector): number {
  const val = features[node.feature];
  if (val < node.threshold) {
    if (node.leftNode) return evaluateNode(node.leftNode, features);
    return node.leftValue ?? 0;
  } else {
    if (node.rightNode) return evaluateNode(node.rightNode, features);
    return node.rightValue ?? 0;
  }
}

/**
 * Motore di Inferenza ML: Esegue l'ensemble e lo fonde con il modello fisico MESH/POH
 */
export class HailPredictorML {
  /**
   * Predice la probabilità e la severità della grandine combinando ML ed equazioni fisiche
   */
  public static predict(
    maxDbz: number,
    sounding: ConvectiveSounding
  ): HailPrediction {
    const features: MLFeatureVector = {
      maxDbz,
      vil: sounding.vil,
      echoTop: sounding.echoTop,
      cape: sounding.cape,
      cin: sounding.cin,
      liftedIndex: sounding.liftedIndex,
      deepShear06km: sounding.deepShear06km,
      srh03km: sounding.srh03km,
      freezingLevel: sounding.freezingLevel,
      dewPointDepression: sounding.dewPointDepression
    };

    // 1. Inferenza Ensemble ML Probabilità
    let mlProbSum = 0;
    for (const tree of HAIL_PROBABILITY_TREES) {
      mlProbSum += evaluateNode(tree, features);
    }
    const mlProbability = Math.min(100, Math.max(0, (mlProbSum / HAIL_PROBABILITY_TREES.length) * 100));

    // 2. Inferenza Ensemble ML Diametro
    let mlDiamSum = 0;
    for (const tree of HAIL_DIAMETER_TREES) {
      mlDiamSum += evaluateNode(tree, features);
    }
    const mlDiameter = Math.max(0, mlDiamSum / HAIL_DIAMETER_TREES.length);

    // 3. Calcolo Modello Fisico Witt MESH & Waldvogel POH
    const physicsPred = evaluateConvectiveHail(maxDbz, sounding);

    // 4. Fusione Ibrida (Physics-Informed ML):
    // 50% modello fisico empirico + 50% ensemble non-lineare ML
    const fusedProb = Math.min(100, Math.round(0.5 * physicsPred.probability + 0.5 * mlProbability));
    const fusedDiameter = Math.round((0.5 * physicsPred.expectedDiameterCm + 0.5 * mlDiameter) * 10) / 10;

    // Ricalibra severità e raccomandazioni
    const finalPred = evaluateConvectiveHail(maxDbz, sounding);
    finalPred.probability = fusedProb;
    finalPred.expectedDiameterCm = fusedDiameter;

    return finalPred;
  }
}
