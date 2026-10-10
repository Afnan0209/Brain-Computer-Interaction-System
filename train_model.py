import pandas as pd
import os
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier
from sklearn.metrics import classification_report, confusion_matrix
import joblib

# 1. Load & Sort Data (Sorting by subject is critical for temporal smoothing)
df = pd.read_csv(os.path.join("features", "master_advanced_features.csv"))
df = df.sort_values(by=['Subject']).reset_index(drop=True)
df['Target'] = df['Event']

# --- THE TEMPORAL SMOOTHING UPGRADE (DEBOUNCING) ---
feature_cols = ['Rel_Alpha', 'Rel_Beta', 'Rel_Theta', 'Rel_Gamma', 
                'Beta_Alpha_Ratio', 'Theta_Beta_Ratio', 'Spectral_Entropy', 'Signal_Variance', 'Signal_PtP']

print("Applying 5-second Temporal Smoothing to filter out biological noise...")
# Calculates a moving average over a 5-window span per subject to stabilize the signal
df[feature_cols] = df.groupby('Subject')[feature_cols].transform(lambda x: x.rolling(window=5, min_periods=1).mean())
# ----------------------------------------------------

# 2. Define Features 
X = df[feature_cols].values
y = df['Target'].values

# 3. Standard Train-Test Split 
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 4. Standardize Features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# 5. Dynamic Weighting for Imbalance
neg_class_count = np.sum(y_train == 0)
pos_class_count = np.sum(y_train == 1)
imbalance_ratio = neg_class_count / pos_class_count

# 6. Train the XGBoost Model with your Locked-in Optimized Parameters
print("Training Optimized & Smoothed XGBoost Model...")
best_xgb = XGBClassifier(
    n_estimators=300,
    max_depth=10,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=1.0,
    gamma=0,
    scale_pos_weight=imbalance_ratio,
    random_state=42,
    eval_metric='logloss',
    n_jobs=-1
)
best_xgb.fit(X_train_scaled, y_train)

# 7. Evaluate Performance & Format Output
y_pred = best_xgb.predict(X_test_scaled)
matrix = confusion_matrix(y_test, y_pred, labels=[0, 1])
report = classification_report(y_test, y_pred, target_names=["Relaxed (0)", "Focused (1)"])

evaluation_text = f"""========================================
BCI MODEL EVALUATION METRICS (SMOOTHED XGBOOST)
========================================

--- THE CONFUSION MATRIX (RAW NUMBERS) ---
[True Relaxed] correctly guessed as Relaxed : {matrix[0][0]}
[True Relaxed] incorrectly guessed as Focused : {matrix[0][1]}

[True Focused] incorrectly guessed as Relaxed : {matrix[1][0]}
[True Focused] correctly guessed as Focused : {matrix[1][1]}

--- SCORING METRICS ---
{report}
========================================"""

print("\n" + evaluation_text)

# 8. Export Lightweight Models 
os.makedirs("saved_models", exist_ok=True)
joblib.dump(scaler, "saved_models/bci_scaler.joblib")
joblib.dump(best_xgb, "saved_models/bci_xgb_model.joblib")

with open("saved_models/model_metrics.txt", "w") as text_file:
    text_file.write(evaluation_text)

print("\nExported bci_scaler.joblib, bci_xgb_model.joblib, and model_metrics.txt securely.")