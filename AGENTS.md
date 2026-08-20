# 🤖 AGENTS.md — Linee Guida Operative & Stato di Progetto

> **Repository:** `hailcast-ml`  
> **Scopo:** Sistema di Nowcasting & Tracciamento Grandine in Tempo Reale con Mappe Open-Source, Radars e Machine Learning.  
> **Ultimo Aggiornamento:** Agosto 2026  

---

## ⚡ Comandi Rapidi di Sviluppo & Test

| Comando | Descrizione |
|---|---|
| `npm install` | Installa le dipendenze Node.js del progetto |
| `npm run dev` | Avvia il server di sviluppo Vite su `http://localhost:5173` |
| `npm run build` | Compilazione TypeScript e bundle statico di produzione in `dist/` |
| `npm run test` | Esegue la suite di test unitari con Vitest |
| `python ml_training/train_hail_model.py` | Esegue il training e la validazione del modello ML in Python |

---

## 📊 Tabella Stato dei Moduli

| Modulo / Feature | File Principale | Stato | Note |
|---|---|---|---|
| **Mappa Radar Open-Source** | [`src/components/RadarMap.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/RadarMap.ts) | ✅ Completato | Supporta basemap Dark/Sat/Topo, RainViewer dBZ e poligoni celle |
| **Equazioni Fisiche MESH/POH** | [`src/ml/mesh-poh.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/mesh-poh.ts) | ✅ Completato | Formule Witt (1998) SHI/MESH e Waldvogel POH verificate |
| **Inference Engine ML** | [`src/ml/hail-ml-model.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/hail-ml-model.ts) | ✅ Completato | Ensemble Gradient Boosted Trees Physics-Informed |
| **Storm Tracking & Nowcast** | [`src/ml/storm-tracker.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/ml/storm-tracker.ts) | ✅ Completato | Calcolo vettori moto, coni 15-60m ed ETA per coordinate |
| **API RainViewer** | [`src/services/rainviewer.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/rainviewer.ts) | ✅ Completato | Recupero frame live e nowcast con fallback |
| **API Open-Meteo Sounding** | [`src/services/openmeteo.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/openmeteo.ts) | ✅ Completato | Recupero CAPE, Shear, Zero Termico per qualsiasi punto |
| **Ricerca Geografica** | [`src/services/geocoding.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/services/geocoding.ts) | ✅ Completato | Geocoding Nominatim + preset comuni italiani |
| **Feed Spotter & Modal** | [`src/components/SpotterModal.ts`](file:///c:/Users/franc/Documents/hailcast-ml/src/components/SpotterModal.ts) | ✅ Completato | Form interattivo con comparatori visivi di grandine |
| **Test Suite Vitest** | [`tests/meteorology.test.ts`](file:///c:/Users/franc/Documents/hailcast-ml/tests/meteorology.test.ts) | ✅ Completato | Test su MESH, POH, Haversine, Bearing e predizioni |
| **Documentazione Accademica** | [`EXAM_INFO.md`](file:///c:/Users/franc/Documents/hailcast-ml/EXAM_INFO.md) | ✅ Completato | Derivazioni, roadmap e piano presentazione orale |

---

## 📌 Convenzioni di Codice
1. **Nessun Framework Pesante Inutile**: Logica reattiva pura in TypeScript modulare con Leaflet e Chart.js per massime prestazioni e caricamento istantaneo dei frame radar.
2. **Standard Meteorologici**: Riflettività in dBZ (scala 0-75+), diametri grandine in centimetri (cm), velocità in km/h o m/s, quote in metri (m).
3. **Privacy Accademica**: `EXAM_INFO.md`, appunti privati e materiali d'esame sono protetti in `.gitignore`.

---

## 🔄 Resume for Next Session
- **Stato Attuale:** Codebase completa, testata e documentata.
- **Handoff:** L'applicazione è pronta per essere avviata con `npm run dev` ed estesa con ulteriori feed radar locali (es. Protezione Civile / ARPA radar regionali) o esportata per pubblicazione web.
