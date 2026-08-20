"""
HailCast-ML: Machine Learning Training Pipeline for Hail Severity & Diameter Nowcasting
======================================================================================
Questo script genera un dataset sintetico calibrato su osservazioni radar e radiosondaggi
convettivi, allena un modello di Gradient Boosting / Random Forest e calcola metriche
di validazione (RMSE, R², Precision/Recall, Matrice di Confusione).
"""

import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier
from sklearn.metrics import classification_report, mean_squared_error, r2_score

def generate_convective_dataset(n_samples: int = 5000, random_seed: int = 42) -> pd.DataFrame:
    """Genera un dataset meteorologico sintetico con distribuzioni fisiche realistiche."""
    np.random.seed(random_seed)
    
    # 1. Variabili Radar
    max_dbz = np.random.normal(loc=52, scale=9, size=n_samples)
    max_dbz = np.clip(max_dbz, 25, 75)
    
    vil = np.random.exponential(scale=25, size=n_samples) + (max_dbz - 30) * 1.1
    vil = np.clip(vil, 5, 85)
    
    echo_top = np.random.normal(loc=11500, scale=2000, size=n_samples)
    echo_top = np.clip(echo_top, 6000, 16000)
    
    # 2. Variabili Termodinamiche & Radiosondaggio
    cape = np.random.exponential(scale=1200, size=n_samples) + (max_dbz - 40) * 45
    cape = np.clip(cape, 100, 4500)
    
    cin = np.random.exponential(scale=35, size=n_samples)
    cin = np.clip(cin, 5, 250)
    
    lifted_index = -1.0 * (cape / 400.0) + np.random.normal(0, 1.2, size=n_samples)
    lifted_index = np.clip(lifted_index, -12, 4)
    
    deep_shear = np.random.normal(loc=18, scale=6, size=n_samples)
    deep_shear = np.clip(deep_shear, 4, 38)
    
    srh03km = deep_shear * 8 + np.random.normal(0, 40, size=n_samples)
    srh03km = np.clip(srh03km, 30, 450)
    
    freezing_level = np.random.normal(loc=3600, scale=350, size=n_samples)
    freezing_level = np.clip(freezing_level, 2500, 4500)
    
    dewpoint_depression = np.random.uniform(1.5, 8.0, size=n_samples)
    
    # 3. Calcolo Ground Truth Fisico + Disturbo Naturale
    # Equazione Witt MESH + influenza di CAPE e Shear
    h45 = np.minimum(echo_top, freezing_level + (max_dbz - 45) * 350)
    delta_h = np.maximum(0, (h45 - freezing_level) / 1000.0)
    
    w_z = np.where(max_dbz < 40, 0, np.where(max_dbz >= 50, 1, (max_dbz - 40) / 10))
    e_dot = 5.0e-6 * (10 ** (0.084 * max_dbz)) * w_z
    shi = 0.1 * e_dot * np.maximum(0, echo_top - freezing_level)
    
    raw_mesh_cm = (2.54 * np.sqrt(np.maximum(0, shi))) / 10.0
    # Aggiungi influenza di forte instabilità e shear
    convective_boost = (cape / 2500.0) * 0.5 + (deep_shear / 25.0) * 0.4
    hail_diameter_cm = raw_mesh_cm * (0.8 + convective_boost) + np.random.normal(0, 0.3, size=n_samples)
    hail_diameter_cm = np.maximum(0, np.round(hail_diameter_cm, 1))
    
    # Target Binario / Severità
    has_hail = (hail_diameter_cm >= 1.0) & (max_dbz >= 48)
    is_severe_hail = hail_diameter_cm >= 3.0
    
    df = pd.DataFrame({
        'max_dbz': max_dbz,
        'vil': vil,
        'echo_top': echo_top,
        'cape': cape,
        'cin': cin,
        'lifted_index': lifted_index,
        'deep_shear': deep_shear,
        'srh03km': srh03km,
        'freezing_level': freezing_level,
        'dewpoint_depression': dewpoint_depression,
        'hail_diameter_cm': hail_diameter_cm,
        'has_hail': has_hail.astype(int),
        'is_severe_hail': is_severe_hail.astype(int)
    })
    
    return df

def train_and_evaluate():
    print("🔬 Generazione dataset meteorologico ed addestramento modelli ML...")
    df = generate_convective_dataset(n_samples=6000)
    
    feature_cols = [
        'max_dbz', 'vil', 'echo_top', 'cape', 'cin', 'lifted_index',
        'deep_shear', 'srh03km', 'freezing_level', 'dewpoint_depression'
    ]
    
    X = df[feature_cols]
    y_class = df['has_hail']
    y_reg = df['hail_diameter_cm']
    
    X_train, X_test, y_cls_train, y_cls_test, y_reg_train, y_reg_test = train_test_split(
        X, y_class, y_reg, test_size=0.2, random_state=42
    )
    
    # 1. Modello di Classificazione (Probabilità di Grandine)
    clf = GradientBoostingClassifier(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42)
    clf.fit(X_train, y_cls_train)
    y_cls_pred = clf.predict(X_test)
    
    print("\n--- CLASSIFICATION REPORT (HAIL DETECTION) ---")
    print(classification_report(y_cls_test, y_cls_pred, target_names=['No Hail', 'Hail']))
    
    # 2. Modello di Regressione (Stima Diametro Chicco in cm)
    reg = GradientBoostingRegressor(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42)
    reg.fit(X_train, y_reg_train)
    y_reg_pred = reg.predict(X_test)
    
    mse = mean_squared_error(y_reg_test, y_reg_pred)
    r2 = r2_score(y_reg_test, y_reg_pred)
    print("\n--- REGRESSION METRICS (HAIL DIAMETER) ---")
    print(f"RMSE: {np.sqrt(mse):.3f} cm")
    print(f"R² Score: {r2:.3f}")
    
    # 3. Feature Importance
    importances = dict(zip(feature_cols, reg.feature_importances_))
    sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    print("\n--- FEATURE IMPORTANCES (TOP METEOROLOGICAL DRIVERS) ---")
    for feat, imp in sorted_imp:
        print(f"  {feat:20s}: {imp * 100:.2f}%")
        
    print("\n✅ Training completato con successo!")

if __name__ == '__main__':
    train_and_evaluate()
