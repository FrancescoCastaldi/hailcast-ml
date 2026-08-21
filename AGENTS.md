# 🤖 AGENTS.md — Operational Guidelines & Project Status

> **Repository:** `hailcast-ml`  
> **Purpose:** Real-Time Hail Nowcasting & Tracking System with Open-Source Maps, Radars and Machine Learning.  
> **Last Updated:** August 2026  

---

## ⚡ Quick Development & Test Commands

| Command | Description |
|---|---|
| `npm install` | Install Node.js project dependencies |
| `npm run dev` | Start the Vite dev server at `http://localhost:5173` |
| `npm run build` | TypeScript compilation and production static bundle in `dist/` |
| `npm run test` | Run the unit test suite with Vitest |
| `python ml_training/train_hail_model.py` | Train and validate the ML model in Python |

---

## 📊 Module Status Table

| Module / Feature | Main File | Status | Notes |
|---|---|---|---|
| **Open-Source Radar Map** | [`src/components/RadarMap.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/RadarMap.ts) | ✅ Completed | Dark/Sat/Topo basemaps, RainViewer dBZ, DPC WMTS and cell polygons |
| **MESH/POH Physical Equations** | [`src/ml/mesh-poh.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/mesh-poh.ts) | ✅ Completed | Witt (1998) SHI/MESH and Waldvogel POH formulas verified |
| **ML Inference Engine** | [`src/ml/hail-ml-model.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/hail-ml-model.ts) | ✅ Completed | Physics-Informed Gradient Boosted Trees ensemble (local `.pkl` persisted) |
| **Storm Tracking & Nowcast** | [`src/ml/storm-tracker.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/storm-tracker.ts) | ✅ Completed | Motion vectors, 15-60m cones, dynamic lifecycles and ETA per coordinates |
| **Directional Genesis Forecasts** | [`src/ml/genesis-forecast-engine.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/genesis-forecast-engine.ts) | ✅ Completed | Directional arrows, multi-source cross-referencing and automatic storm cell concretization |
| **Hail Conversion Probability** | [`src/ml/genesis-forecast-engine.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/genesis-forecast-engine.ts) | ✅ Completed | Quantitative % likelihood of trigger evolving into severe ground hail |
| **Multi-Source Cell Engine** | [`src/services/multi-source-tracker.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/multi-source-tracker.ts) | ✅ Completed | Real-time genesis, maturation, dissipation, bivalent mode and cell purging |
| **GitHub Actions Data Sync** | [`scripts/sync-radar-data.mjs`](file:///c:/Users/franc/Documents/hailcast-ml/scripts/sync-radar-data.mjs) | ✅ Completed | 15-min scheduled data snapshot with live CAPE/radar/cells/DPC sync |
| **RainViewer API** | [`src/services/rainviewer.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/rainviewer.ts) | ✅ Completed | Live and nowcast frame retrieval with fallback |
| **Protezione Civile Radar (DPC)** | [`src/services/protezione-civile.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/protezione-civile.ts) | ✅ Completed | WMTS GeoWebCache (VMI dBZ & SRI mm/h) + 24 Stazioni Rete Nazionale |
| **Open-Meteo Sounding API** | [`src/services/openmeteo.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/openmeteo.ts) | ✅ Completed | CAPE, Shear, Freezing Level retrieval for any point |
| **Geographic Search** | [`src/services/geocoding.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/geocoding.ts) | ✅ Completed | Nominatim geocoding + common Italian presets |
| **Spotter Feed & Modal** | [`src/components/SpotterModal.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/SpotterModal.ts) | ✅ Completed | Interactive form with TTL expiration and visual hail comparators |
| **Sounding Profile & HGZ** | [`src/components/SoundingProfileModal.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/SoundingProfileModal.ts) | ✅ Completed | Multilevel Skew-T chart, Hail Growth Zone (0°C to -20°C) and LPI index |
| **Dual-Pol Radar Simulator** | [`src/components/RadarMap.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/RadarMap.ts) | ✅ Completed | Polarimetric simulation ($Z_{DR}$, $\rho_{HV}$ CC, and dBZ) with dynamic shaders |
| **Damage Calculator** | [`src/components/DamageCalculatorModal.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/DamageCalculatorModal.ts) | ✅ Completed | Vulnerability loss model for vineyards, orchards, crops, cars, and solar panels |
| **Severe Hail Bulletin** | [`src/services/bulletin-generator.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/bulletin-generator.ts) | ✅ Completed | Official printable/exportable nowcasting bulletin with security prescriptions |
| **Weather FX Animations** | [`src/components/WeatherFXOverlay.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/WeatherFXOverlay.ts) | ✅ Completed | Immersive particle FX (hail/rain/wind/lightning); hail runs in continuous loop |
| **Alert Notifications** | [`src/services/alert-notification-service.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/alert-notification-service.ts) | ✅ Completed | Email alerts via FormSubmit with hail/rain thresholds |
| **Vitest Test Suite** | [`tests/`](file:///c:/Users/franc/Documents/hailcast-ml/tests/) | ✅ Completed | 27 tests: Genesis forecast, DPC radars, alerts, MESH, POH, kinematics |
| **Academic Documentation** | [`EXAM_INFO.md`](file:///c:/Users/franc/Documents/hailcast-ml/EXAM_INFO.md) | ✅ Completed | Derivations, roadmap and oral presentation plan (private, gitignored) |

---

## 📌 Code Conventions
1. **No Unnecessary Heavy Frameworks**: Pure reactive logic in modular TypeScript with Leaflet and Chart.js for maximum performance and instant radar frame loading.
2. **Meteorological Standards**: Reflectivity in dBZ (0-75+ scale), hail diameters in centimeters (cm), speeds in km/h or m/s, heights in meters (m).
3. **Academic Privacy**: `EXAM_INFO.md`, private notes and exam materials are protected in `.gitignore`.

---

## 🔄 Resume for Next Session
- **Current State:** Complete, fully tested (27/27 Vitest passing) and documented codebase with directional genesis forecasts, DPC WMTS integration, and local ML persistence.
- **Handoff:** The application is running seamlessly with `npm run dev` and static production build in `dist/`. All source files, tests and markdown specifications are synced on `origin/main`.