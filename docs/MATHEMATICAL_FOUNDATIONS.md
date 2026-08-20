# 📐 Mathematical Foundations & Radar Physics — HailCast-ML

This document details the equations and physics underlying the HailCast-ML system.

## 1. Radar Reflectivity & Hail Growth Physics

The radar reflectivity factor $Z$ in Rayleigh scattering regime ($\pi D / \lambda \ll 1$) is defined by:
$$Z = \int_0^\infty N(D) D^6 \, dD \quad [\text{mm}^6/\text{m}^3]$$
expressed in logarithmic units (decibels of reflectivity, dBZ):
$$\text{dBZ} = 10 \log_{10}\left(\frac{Z}{1 \text{ mm}^6/\text{m}^3}\right)$$

For hail particles ($D > 5 \text{ mm}$), scattering transitions to the Mie regime where liquid water coating on melting hailstones produces extreme reflectivity cores ($Z > 55 \text{ dBZ}$).

## 2. Witt Severe Hail Index ($SHI$) Derivation

The hail kinetic energy flux equation is derived from empirical radar-drop size distributions:
$$\dot{E}(Z) = 5.0 \times 10^{-6} \times 10^{0.084 \cdot Z} \cdot W(Z) \quad [\text{J}/(\text{m}^2 \cdot \text{s})]$$

Integrating from the melting level $H_0$ (0°C isotherm) to the cloud top $H_{top}$:
$$SHI = 0.1 \times \int_{H_0}^{H_{top}} \dot{E}(Z(h)) \cdot W_T(h) \, dh \quad [\text{J}/(\text{m} \cdot \text{s})]$$

where $W_T(h)$ weights the energy according to the temperature profile:
$$W_T(h) = \min\left(1, \, \max\left(0, \, \frac{h - H_0}{H_{-20} - H_0}\right)\right)$$

## 3. Maximum Estimated Size of Hail ($MESH$)

$$MESH = 2.54 \times \sqrt{SHI} \quad [\text{mm}]$$

## 4. Thermodynamics & Instability Indices
- **CAPE (Convective Available Potential Energy):**
  $$CAPE = \int_{LFC}^{EL} g \left(\frac{T_{v,\text{parcel}} - T_{v,\text{env}}}{T_{v,\text{env}}}\right) dz \quad [\text{J}/\text{kg}]$$
- **Lifted Index (LI):**
  $$LI = T_{500\text{hPa},\text{env}} - T_{500\text{hPa},\text{parcel}} \quad [^\circ\text{C}]$$
- **Bulk Wind Shear (0-6 km):**
  $$\Delta \mathbf{V}_{0-6} = \|\mathbf{V}_{6\text{km}} - \mathbf{V}_{10\text{m}}\| \quad [\text{m}/\text{s}]$$

## 5. Machine Learning Hybrid Objective

The ML model optimizes the regularized gradient boosting objective:
$$\mathcal{L}^{(t)} = \sum_{i=1}^n \ell\left(y_i, \, \hat{y}_i^{(t-1)} + f_t(\mathbf{x}_i)\right) + \Omega(f_t)$$
where $\mathbf{x}_i$ is the 10-dimensional meteorological feature vector:
$$\mathbf{x} = [Z_{\max}, VIL, ET, CAPE, CIN, LI, \Delta \mathbf{V}_{0-6}, SRH_{0-3}, H_0, (T-T_d)]$$
