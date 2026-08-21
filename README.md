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

> **HailCast-ML** is an advanced platform for real-time monitoring, tracking and *nowcasting* of hail and severe convective supercells. It combines global open-source weather radar data (**RainViewer API**), thermodynamic soundings (**Open-Meteo API**), physical reflectivity models (**Witt MESH, Waldvogel POH**) and **Machine Learning** algorithms based on decision tree ensembles.

---

## 🌟 Key Features

- 🛰️ **Interactive Multi-Source Radar Map**:
  - High-contrast basemaps (CartoDB Dark Matter, Satellite, Topographic, OpenStreetMap).
  - Real-time Doppler radar overlay (**RainViewer Global Mosaic** + **Protezione Civile DPC National Radar** with 24 stations).
  - Native WMTS tile ingestion for `radar:vmi` (dBZ) and `radar:sri` (mm/h).
  - Smooth animation of past radar frames and future nowcasting projections.
- ⚡ **Directional Hail Genesis Forecasts & Vector Cones**:
  - Multi-source cross-referencing (DPC + RainViewer + Open-Meteo Soundings + Spotters).
  - Real-time directional arrow vectors with target town corridors and ETA countdown.
  - **Dynamic Storm Cell Maturation**: automatic concretization of trigger nodes into standard tracked convective cells.
- ❄️ **Quantitative Real Hail Conversion Probability**:
  - Thermodynamic & radar-informed probability estimation of triggers evolving into severe ground hail (0-100%).
  - Multi-tiered risk classification (`low`, `moderate`, `high`, `very_high`, `extreme`) with color-coded meters and progress bars.
- 🔄 **Bivalent Operational Mode**:
  - Instant toggle between **Grandine (Hail Nowcasting)** and **Perturbazioni (Precipitation Tracking)**.
- ⚡ **Hybrid Physics & Machine Learning (Physics-Informed ML)**:
  - **Severe Hail Index ($SHI$)** and **Maximum Estimated Size of Hail ($MESH$)** computed per Witt et al. (1998).
  - **Probability of Hail ($POH$)** estimation per Waldvogel et al. (1979).
  - In-browser and locally trained Python Gradient Boosted Trees model (saved in `ml_models/`).
- 🎯 **Storm Cell Tracking & ETA Calculation**:
  - Automatic convective centroid detection and motion vector computation $(\text{km/h}, \text{azimuth})$.
  - Fan-shaped **uncertainty cones** projected at 15, 30, 45 and 60 minutes.
  - Automatic ETA and distance calculation for any town or map-clicked point.
- 🔍 **Town Search & Instant Risk Assessment**:
  - Instant search with Nominatim geocoding and autocomplete.
  - Risk card with hail probability, expected diameter and protection recommendations.
- 📱 **Spotter Reporting Network (Crowdsourcing)**:
  - Interactive modal to submit ground hail reports with visual comparators (Coin 2cm, Walnut 3cm, Golf 4.5cm, Egg 6cm, Tennis 7.5cm).
- 🎬 **Immersive Weather FX Animations**:
  - Canvas particle animations (bouncing hail, torrential rain, wind downburst, lightning) triggered by cell, trajectory and spotter clicks.
- 📊 **Convective Telemetry & Vertical Profile**:
  - Instability indicators: $CAPE$, Lifted Index, 0-6km Bulk Wind Shear, Freezing Level ($H_0$), $-20^\circ\text{C}$ isotherm, $VIL$.
  - Dynamic Chart.js vertical dBZ profile chart and Hail Growth Zone (HGZ).
- 🌪️ **Extreme Supercell Simulation Mode**:
  - One-click dynamic simulation of a Po Valley supercell (65 dBZ, giant hail >5 cm) for testing and demonstrations.

---

## 📐 Physical Foundations

| Index / Metric | Formula / Relation | Scientific Reference |
|---|---|---|
| **Hail Kinetic Energy ($\dot{E}$)** | $\dot{E} = 5.0 \times 10^{-6} \times 10^{0.084 \cdot Z} \cdot W(Z)$ | Witt et al., 1998 |
| **Severe Hail Index ($SHI$)** | $SHI = 0.1 \times \int_{H_0}^{H_{top}} \dot{E}(Z) \cdot W(H) \, dH$ | Witt et al., 1998 |
| **MESH (Max Hail Diameter)** | $MESH_{\text{cm}} = 0.254 \times \sqrt{SHI}$ | Witt et al., 1998 |
| **POH (Hail Probability)** | $POH = 22.22 \times (H_{45} - H_0)$ | Waldvogel et al., 1979 |
| **Geodesic Distance** | Great-circle Haversine formula | Haversine Formula |

---

## 🚀 Installation & Quick Start

### Prerequisites
- **Node.js** (v18.0 or higher)
- **npm** (v9.0 or higher)
- *(Optional, for ML training)* **Python 3.10+**

### 1. Clone or open the project
```bash
cd hailcast-ml
```

### 2. Install Node.js dependencies
```bash
npm install
```

### 3. Start the development server
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

### 4. Run the Unit Tests
```bash
npm run test
```

### 5. (Optional) Train the ML Model in Python
```bash
pip install -r ml_training/requirements.txt
python ml_training/train_hail_model.py
```

---

## 📂 Project Structure

```
hailcast-ml/
├── index.html                      # Weather dashboard layout
├── package.json                    # Dependencies and npm scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite bundler configuration
├── EXAM_INFO.md                    # Academic specifications and oral exam brief (private)
├── codemap.md                      # Architectural module map
├── AGENTS.md                       # Operational guidelines for agents
├── docs/
│   ├── ARCHITECTURE.md             # System architecture and data flows
│   └── MATHEMATICAL_FOUNDATIONS.md # Mathematical derivations and radar equations
├── ml_training/
│   ├── requirements.txt            # Python dependencies (scikit-learn, pandas)
│   └── train_hail_model.py         # Gradient Boosting training pipeline
├── tests/
│   └── meteorology.test.ts         # Vitest unit tests on physics and kinematics
└── src/
    ├── main.ts                     # Central app orchestrator
    ├── style.css                   # Dark meteorological theme & glassmorphism
    ├── types/
    │   └── meteorology.ts          # TypeScript definitions
    ├── services/
    │   ├── rainviewer.ts           # RainViewer real-time radar API
    │   ├── openmeteo.ts            # Open-Meteo convective sounding API
    │   ├── geocoding.ts            # Nominatim geographic search
    │   ├── spotter-feed.ts         # Spotter reports feed and supercell simulator
    │   ├── alert-notification-service.ts # Email alert subscriptions (FormSubmit)
    │   └── multi-source-tracker.ts # Multi-source storm data aggregation
    ├── ml/
    │   ├── mesh-poh.ts             # Witt MESH, SHI and Waldvogel POH formulas
    │   ├── hail-ml-model.ts        # Machine Learning model in TypeScript
    │   └── storm-tracker.ts        # Centroid tracking, vectors and nowcast cones
    └── components/
        ├── RadarMap.ts             # Leaflet map & radar overlays
        ├── TimelineController.ts   # Timeline player and radar scrubber
        ├── AlertFeed.ts            # Cell list and alert feed
        ├── ConvectiveTelemetry.ts  # Convective indices drawer & charts
        ├── LocationSearch.ts       # Town search bar and risk card
        ├── SpotterModal.ts         # Spotter hail report modal
        ├── NotificationModal.ts    # Alert subscription modal
        └── WeatherFXOverlay.ts     # Immersive particle FX animations (hail loop)
```

---

## 📄 License

Distributed under the **MIT** license. See `LICENSE` for details.