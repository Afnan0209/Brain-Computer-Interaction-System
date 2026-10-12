
# ============================================================
# BCI PROJECT: COMPLETE MODEL GRAPH GENERATION
# Model: XGBoost | Features: DWT-based EEG features
# ============================================================

from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    confusion_matrix,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_curve,
    roc_auc_score
)

# ------------------------------------------------------------
# 1. Set project paths
# ------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
FEATURE_FILE = BASE_DIR / "features" / "master_advanced_features.csv"
MODEL_FILE = BASE_DIR / "saved_models" / "bci_xgb_model.joblib"
SCALER_FILE = BASE_DIR / "saved_models" / "bci_scaler.joblib"

RESULTS_DIR = BASE_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------
# 2. Load saved model and scaler
# ------------------------------------------------------------

if not FEATURE_FILE.exists():
    raise FileNotFoundError(
        f"Feature CSV not found: {FEATURE_FILE}"
    )

if not MODEL_FILE.exists() or not SCALER_FILE.exists():
    raise FileNotFoundError(
        "Trained model or scaler not found. Run train_model.py first."
    )

model = joblib.load(MODEL_FILE)
scaler = joblib.load(SCALER_FILE)

print("Saved BCI model and scaler loaded successfully.")

# ------------------------------------------------------------
# 3. Reconstruct the same test set used in training
# ------------------------------------------------------------

df = pd.read_csv(FEATURE_FILE)
df = df.sort_values(by=["Subject"]).reset_index(drop=True)
df["Target"] = df["Event"]

feature_cols = [
    "Rel_Alpha",
    "Rel_Beta",
    "Rel_Theta",
    "Rel_Gamma",
    "Beta_Alpha_Ratio",
    "Theta_Beta_Ratio",
    "Spectral_Entropy",
    "Signal_Variance",
    "Signal_PtP"
]

# Match the smoothing operation in train_model.py
df[feature_cols] = df.groupby("Subject")[feature_cols].transform(
    lambda x: x.rolling(window=5, min_periods=1).mean()
)

X = df[feature_cols].values
y = df["Target"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

X_test_scaled = scaler.transform(X_test)
y_pred = model.predict(X_test_scaled)

# ------------------------------------------------------------
# GRAPH 1: CONFUSION MATRIX
# ------------------------------------------------------------

cm = confusion_matrix(y_test, y_pred, labels=[0, 1])

plt.figure(figsize=(7, 5))
sns.heatmap(
    cm,
    annot=True,
    fmt="d",
    cmap="Blues",
    xticklabels=["Background (0)", "Mental Arithmetic (1)"],
    yticklabels=["Background (0)", "Mental Arithmetic (1)"]
)
plt.xlabel("Predicted Class")
plt.ylabel("Actual Class")
plt.title("XGBoost Classification - Confusion Matrix")
plt.tight_layout()
plt.savefig(RESULTS_DIR / "01_confusion_matrix.png", dpi=300)
plt.close()

# ------------------------------------------------------------
# GRAPH 2: FEATURE IMPORTANCE
# ------------------------------------------------------------

importance_df = pd.DataFrame({
    "Feature": feature_cols,
    "Importance": model.feature_importances_
}).sort_values("Importance", ascending=True)

plt.figure(figsize=(9, 6))
plt.barh(importance_df["Feature"], importance_df["Importance"])
plt.xlabel("Feature Importance")
plt.ylabel("EEG Features")
plt.title("XGBoost - EEG Feature Importance")
plt.tight_layout()
plt.savefig(RESULTS_DIR / "02_feature_importance.png", dpi=300)
plt.close()

# ------------------------------------------------------------
# GRAPH 3: ROC CURVE
# ------------------------------------------------------------

if hasattr(model, "predict_proba") and len(np.unique(y_test)) == 2:
    y_prob = model.predict_proba(X_test_scaled)[:, 1]
    auc_value = roc_auc_score(y_test, y_prob)

    fpr, tpr, thresholds = roc_curve(y_test, y_prob)

    plt.figure(figsize=(7, 5))
    plt.plot(fpr, tpr, label=f"XGBoost (AUC = {auc_value:.3f})")
    plt.plot([0, 1], [0, 1], "k--", label="Random baseline")
    plt.xlabel("False Positive Rate")
    plt.ylabel("True Positive Rate")
    plt.title("XGBoost - ROC Curve")
    plt.legend()
    plt.tight_layout()
    plt.savefig(RESULTS_DIR / "03_roc_curve.png", dpi=300)
    plt.close()
else:
    auc_value = None
    print("ROC curve skipped because both classes are not present.")

# ------------------------------------------------------------
# GRAPH 4: PERFORMANCE METRICS
# ------------------------------------------------------------

metrics = {
    "Accuracy": accuracy_score(y_test, y_pred),
    "Precision": precision_score(y_test, y_pred, zero_division=0),
    "Recall": recall_score(y_test, y_pred, zero_division=0),
    "F1-score": f1_score(y_test, y_pred, zero_division=0)
}

plt.figure(figsize=(8, 5))
bars = plt.bar(metrics.keys(), metrics.values())
plt.ylim(0, 1.1)
plt.ylabel("Score")
plt.title("BCI Classifier - Performance Metrics")

for bar, value in zip(bars, metrics.values()):
    plt.text(
        bar.get_x() + bar.get_width() / 2,
        bar.get_height() + 0.02,
        f"{value:.3f}",
        ha="center"
    )

plt.tight_layout()
plt.savefig(RESULTS_DIR / "04_performance_metrics.png", dpi=300)
plt.close()

# ------------------------------------------------------------
# GRAPH 5: FEATURE DISTRIBUTION
# ------------------------------------------------------------

scaled_feature_df = pd.DataFrame(
    X_test_scaled,
    columns=feature_cols
)

plt.figure(figsize=(10, 6))
sns.boxplot(data=scaled_feature_df, orient="h")
plt.xlabel("Standardized Feature Value")
plt.ylabel("EEG Features")
plt.title("Distribution of Standardized EEG Features")
plt.tight_layout()
plt.savefig(RESULTS_DIR / "05_feature_distribution.png", dpi=300)
plt.close()

# ------------------------------------------------------------
# GRAPH 6: FEATURE CORRELATION HEATMAP
# ------------------------------------------------------------

plt.figure(figsize=(9, 7))
sns.heatmap(
    df[feature_cols].corr(),
    annot=True,
    fmt=".2f",
    cmap="coolwarm",
    center=0
)
plt.title("Correlation Between Extracted EEG Features")
plt.tight_layout()
plt.savefig(RESULTS_DIR / "06_feature_correlation.png", dpi=300)
plt.close()

# ------------------------------------------------------------
# 4. Save actual evaluation metrics
# ------------------------------------------------------------

metrics_df = pd.DataFrame([
    {"Metric": name, "Score": value}
    for name, value in metrics.items()
])

if auc_value is not None:
    metrics_df.loc[len(metrics_df)] = {
        "Metric": "ROC-AUC",
        "Score": auc_value
    }

metrics_df.to_csv(RESULTS_DIR / "model_metrics.csv", index=False)

print("\n========== BCI MODEL EVALUATION ==========")
for name, value in metrics.items():
    print(f"{name}: {value:.4f} ({value * 100:.2f}%)")

if auc_value is not None:
    print(f"ROC-AUC: {auc_value:.4f}")

print("\nAll graphs saved in:")
print(RESULTS_DIR)
print("\nOpen the results folder in VS Code Explorer.")
