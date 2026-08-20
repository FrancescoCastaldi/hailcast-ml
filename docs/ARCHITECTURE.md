# 🏗️ Architecture & Data Flow Specification — HailCast-ML

## 1. System Overview
HailCast-ML is an end-to-end meteorological radar nowcasting platform. It processes multi-source atmospheric data to detect, classify, and track severe convective storms producing hail.

```
+------------------------+      +--------------------------+
| RainViewer Radar API   |      | Open-Meteo Sounding API  |
| (Global Radar Sweeps)  |      | (CAPE, Shear, Freezing L)|
+-----------+------------+      +------------+-------------+
            |                                |
            +----------------+---------------+
                             |
                             v
                +-------------------------+
                |  HailCast-ML Ingestion  |
                +------------+------------+
                             |
             +---------------+---------------+
             |                               |
             v                               v
+-------------------------+     +--------------------------+
| Physics Engine (MESH)   |     | Machine Learning Model   |
| - Witt SHI Equation     |     | - Gradient Boosted Trees |
| - Waldvogel POH         |     | - Feature Vector Ingest  |
+------------+------------+     +------------+-------------+
             |                               |
             +---------------+---------------+
                             | (Physics-Informed Fusion)
                             v
                +-------------------------+
                |   Hail Severity Class   |
                |   & Diameter Prediction |
                +------------+------------+
                             |
                             v
                +-------------------------+
                | Storm Cell Kinematics   |
                | - Centroid Tracking     |
                | - 15-60m Nowcast Cones  |
                | - Target ETA Calculator |
                +------------+------------+
                             |
                             v
                +-------------------------+
                | Interactive Leaflet HUD |
                | & Telemetry Dashboard   |
                +-------------------------+
```

## 2. Component Design
- **Map Subsystem:** Built upon Leaflet with hardware-accelerated tile layers and SVG polygon overlays.
- **Physics Subsystem:** Computes numerical integrals with discrete 250m atmospheric vertical stepping.
- **ML Subsystem:** Fast in-browser decision trees executing in sub-millisecond time.
- **Nowcasting Subsystem:** Geodesic calculations based on great-circle trigonometry (Haversine formula).
