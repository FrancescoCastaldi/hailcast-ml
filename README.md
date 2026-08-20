# ⛈️ HailCast-ML — GrandineRadar AI & Convective Nowcasting

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue.svg?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.1-646CFF.svg?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Leaflet-1.9-199900.svg?style=for-the-badge&logo=leaflet&logoColor=white" alt="Leaflet" />
  <img src="https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-success.svg?style=for-the-badge&logo=github" alt="Live Demo" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License" />
</p>

<p align="center">
  🌐 <strong>Live Web App:</strong> <a href="https://francescocastaldi.github.io/hailcast-ml/">https://francescocastaldi.github.io/hailcast-ml/</a>
</p>

> **HailCast-ML** è una piattaforma avanzata per il monitoraggio, tracciamento e la previsione *nowcasting* in tempo reale della grandine e delle supercelle temporalesche violente. Combina i dati radar meteorologici open-source mondiali (**RainViewer API**), i radiosondaggi termodinamici (**Open-Meteo API**), i modelli fisici di riflettività (**Witt MESH, Waldvogel POH**) e algoritmi di **Machine Learning** basati su ensemble di alberi decisionali.

---

## 🌟 Caratteristiche Principali

- 🛰️ **Mappa Radar Open-Source Interattiva**:
  - Mappe base ad alto contrasto (CartoDB Dark Matter, Satellite, Topografica, OpenStreetMap).
  - Overlay radar Doppler real-time con scala di riflettività a colori standard (dBZ 10–75+).
  - Animazione fluida dei frame radar passati e delle proiezioni future nowcasting.
- ⚡ **Algoritmi Fisici & Machine Learning Ibrido (Physics-Informed ML)**:
  - Calcolo del **Severe Hail Index ($SHI$)** e **Maximum Estimated Size of Hail ($MESH$)** secondo Witt et al. (1998).
  - Stima della **Probability of Hail ($POH$)** secondo Waldvogel et al. (1979).
  - Classificatore ed estimatore del diametro del chicco (cm) basato su Gradient Boosted Trees nel browser.
- 🎯 **Storm Cell Tracking & Calcolo ETA**:
  - Rilevamento automatico dei centroidi convettivi e calcolo del vettore di spostamento $(\text{km/h}, \text{azimuth})$.
  - Proiezione a ventaglio dei **coni d'incertezza** a 15, 30, 45 e 60 minuti.
  - Calcolo automatico dell'ETA (tempo stimato di arrivo) e della distanza per qualsiasi comune o punto cliccato sulla mappa.
- 🔍 **Ricerca Comune & Valutazione Rischio Immediato**:
  - Ricerca istantanea con geocoding Nominatim e autocompletamento.
  - Scheda di rischio con probabilità grandine, diametro atteso e raccomandazioni di protezione (auto, finestre, colture).
- 📱 **Rete di Segnalazione Spotter (Crowdsourcing)**:
  - Modale interattivo per inviare segnalazioni di grandine al suolo con comparatori visivi (Moneta 2cm, Noce 3cm, Golf 4.5cm, Uovo 6cm, Tennis 7.5cm).
- 📊 **Telemetria Convettiva & Profilo Verticale**:
  - Indicatori di instabilità: $CAPE$, Lifted Index, 0-6km Bulk Wind Shear, Quota Zero Termico ($H_0$), Isoterma $-20^\circ\text{C}$, $VIL$.
  - Grafico dinamico del profilo verticale di riflettività radar (dBZ vs Quota).
- 🌪️ **Modalità Simulazione Supercella Estrema**:
  - Possibilità di avviare con un click una simulazione dinamica di supercella padana (65 dBZ, grandine gigante >5 cm) per test e dimostrazioni.

---

## 📐 Fondamenti Fisici

| Indice / Metrica | Formula / Relazione | Riferimento Scientifico |
|---|---|---|
| **Hail Kinetic Energy ($\dot{E}$)** | $\dot{E} = 5.0 \times 10^{-6} \times 10^{0.084 \cdot Z} \cdot W(Z)$ | Witt et al., 1998 |
| **Severe Hail Index ($SHI$)** | $SHI = 0.1 \times \int_{H_0}^{H_{top}} \dot{E}(Z) \cdot W(H) \, dH$ | Witt et al., 1998 |
| **MESH (Diametro Max Grandine)** | $MESH_{\text{cm}} = 0.254 \times \sqrt{SHI}$ | Witt et al., 1998 |
| **POH (Probabilità Grandine)** | $POH = 22.22 \times (H_{45} - H_0)$ | Waldvogel et al., 1979 |
| **Distanza Geodesica** | Formula del cerchio massimo di Haversine | Haversine Formula |

---

## 🚀 Installazione & Avvio Rapido

### Prerequisiti
- **Node.js** (v18.0 o superiore)
- **npm** (v9.0 o superiore)
- *(Opzionale per training ML)* **Python 3.10+**

### 1. Clona o apri il progetto
```bash
cd hailcast-ml
```

### 2. Installa le dipendenze Node.js
```bash
npm install
```

### 3. Avvia il server di sviluppo
```bash
npm run dev
```
Apri il browser su `http://localhost:5173`.

### 4. Esegui i Test Unitari
```bash
npm run test
```

### 5. (Opzionale) Esegui il Training del Modello ML in Python
```bash
pip install -r ml_training/requirements.txt
python ml_training/train_hail_model.py
```

---

## 📂 Struttura del Progetto

```
hailcast-ml/
├── index.html                      # Layout della dashboard meteorologica
├── package.json                    # Dipendenze e script npm
├── tsconfig.json                   # Configurazione TypeScript
├── vite.config.ts                  # Configurazione bundler Vite
├── EXAM_INFO.md                    # Specifiche accademiche e traccia esame orale
├── codemap.md                      # Mappa architetturale dei moduli
├── AGENTS.md                       # Linee guida operative per agenti
├── docs/
│   ├── ARCHITECTURE.md             # Architettura di sistema e flussi dati
│   └── MATHEMATICAL_FOUNDATIONS.md # Derivazioni matematiche e radar equations
├── ml_training/
│   ├── requirements.txt            # Dipendenze Python (scikit-learn, pandas)
│   └── train_hail_model.py         # Pipeline di training Gradient Boosting
├── tests/
│   └── meteorology.test.ts         # Test unitari Vitest su fisica e cinematica
└── src/
    ├── main.ts                     # Orchestratore centrale dell'app
    ├── style.css                   # Tema scuro meteorologico & glassmorphism
    ├── types/
    │   └── meteorology.ts          # Definizioni TypeScript
    ├── services/
    │   ├── rainviewer.ts           # API radar in tempo reale RainViewer
    │   ├── openmeteo.ts            # API radiosondaggi convettivi Open-Meteo
    │   ├── geocoding.ts            # Ricerca geografica Nominatim
    │   └── spotter-feed.ts         # Feed segnalazioni e simulatore supercelle
    ├── ml/
    │   ├── mesh-poh.ts             # Formule Witt MESH, SHI e Waldvogel POH
    │   ├── hail-ml-model.ts        # Modello di Machine Learning in TypeScript
    │   └── storm-tracker.ts        # Centroid tracking, vettori e coni nowcast
    └── components/
        ├── RadarMap.ts             # Mappa Leaflet & radar overlays
        ├── TimelineController.ts   # Player timeline e scrubber radar
        ├── AlertFeed.ts            # Lista celle e feed allarmi
        ├── ConvectiveTelemetry.ts  # Drawer indici convettivi & grafici
        ├── LocationSearch.ts       # Barra ricerca comune e card di rischio
        └── SpotterModal.ts         # Modale segnalazione grandine spotter
```

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Consulta `LICENSE` per ulteriori dettagli.
