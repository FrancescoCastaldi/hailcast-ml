# 🏗️ Architecture & Data Flow Specification — HailCast-ML

## 1. System Overview
HailCast-ML is an end-to-end meteorological radar nowcasting platform. It processes multi-source atmospheric data to detect, classify, and track severe convective storms producing hail.

```
+------------------------+  +--------------------------+  +--------------------------+  +--------------------------+
| RainViewer Radar API   |  | Open-Meteo Sounding API  |  | Protezione Civile DPC    |  | Spotter Crowdsource Feed |
| (Global Radar Sweeps)  |  | (CAPE, Shear, Freezing L)|  | (WMTS VMI dBZ / SRI mm/h)|  | (Ground Hail Size & Obs) |
+-----------+------------+  +------------+-------------+  +------------+-------------+  +------------+-------------+
            |                            |                             |                             |
            +----------------------------+--------------+--------------+-----------------------------+
                                                        |
                                                        v
                                           +-------------------------+
                                           |  HailCast-ML Ingestion  |
                                           | & Multi-Source Tracker  |
                                           +------------+------------+
                                                        |
                        +-------------------------------+-------------------------------+
                        |                               |                               |
                        v                               v                               v
           +-------------------------+     +--------------------------+     +--------------------------+
           | Physics Engine (MESH)   |     | Machine Learning Model   |     | Genesis Forecast Engine  |
           | - Witt SHI Equation     |     | - Gradient Boosted Trees |     | - Directional Vectors    |
           | - Waldvogel POH         |     | - In-Browser / Python PKL|     | - Hail Probability %     |
           +------------+------------+     +------------+-------------+     +------------+-------------+
                        |                               |                               |
                        +-------------------------------+-------------------------------+
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
                                           | & Directional Cones     |
                                           +-------------------------+
```

## 2. Component Design
- **Map Subsystem:** Built upon Leaflet with hardware-accelerated tile layers, WMTS GeoWebCache raster layers, SVG directional arrows and polygon overlays.
- **Genesis Forecast Subsystem:** Cross-references thermodynamic instability (SBCAPE), DPC reflectivity precursors, and storm motion vectors to predict convective cell genesis 15-30 minutes ahead of radar maturity.
- **Physics Subsystem:** Computes numerical integrals with discrete 250m atmospheric vertical stepping.
- **ML Subsystem:** Fast in-browser decision trees executing in sub-millisecond time, backed by offline scikit-learn models.
- **Nowcasting Subsystem:** Geodesic calculations based on great-circle trigonometry (Haversine formula).
