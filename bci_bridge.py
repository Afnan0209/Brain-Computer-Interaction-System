
"""
bci_bridge.py
Trained XGBoost model -> WebSocket -> Temple BCI Runner

Run from the bci-runner folder:
    python bci_bridge.py

The current model predicts:
    0 = Relaxed
    1 = Focused

Focused predictions trigger a lane switch.
Blink detection is not provided by this trained model.
"""

import asyncio
import json
from pathlib import Path

import joblib
import numpy as np
import websockets

# --------------------------------------------------
# 1. Load the trained model and scaler
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "bci_xgb_model.joblib"
SCALER_PATH = BASE_DIR / "models" / "bci_scaler.joblib"

FEATURE_NAMES = [
    "Rel_Alpha",
    "Rel_Beta",
    "Rel_Theta",
    "Rel_Gamma",
    "Beta_Alpha_Ratio",
    "Theta_Beta_Ratio",
    "Spectral_Entropy",
    "Signal_Variance",
    "Signal_PtP",
]

model = None
scaler = None

# Match the five-row rolling average used during training.
recent_features = []


def load_model():
    global model, scaler

    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

    if not SCALER_PATH.is_file():
        raise FileNotFoundError(f"Scaler file not found: {SCALER_PATH}")

    scaler = joblib.load(SCALER_PATH)
    model = joblib.load(MODEL_PATH)

    print("Model and scaler loaded successfully.")
    print(f"Model:  {MODEL_PATH}")
    print(f"Scaler: {SCALER_PATH}")


# --------------------------------------------------
# 2. Predict from the nine trained features
# --------------------------------------------------

def predict_state(features):
    """
    features must contain nine numeric values in FEATURE_NAMES order.
    Returns the predicted class and its display label.
    """

    values = np.asarray(features, dtype=np.float64)

    if values.shape != (9,):
        raise ValueError("Exactly 9 feature values are required.")

    if not np.isfinite(values).all():
        raise ValueError("Features must be finite numbers.")

    recent_features.append(values)

    # Retain only the latest five feature rows.
    if len(recent_features) > 5:
        recent_features.pop(0)

    smoothed = np.mean(recent_features, axis=0).reshape(1, -1)
    scaled = scaler.transform(smoothed)

    prediction = int(model.predict(scaled)[0])

    if prediction == 1:
        return prediction, "Focused"

    if prediction == 0:
        return prediction, "Relaxed"

    return prediction, f"Unknown class: {prediction}"


# --------------------------------------------------
# 3. WebSocket connection with the game
# --------------------------------------------------

CLIENTS = set()


async def broadcast_command(command):
    if not CLIENTS:
        print("No game browser connected; command not sent.")
        return

    message = json.dumps({"action": command})

    results = await asyncio.gather(
        *(client.send(message) for client in list(CLIENTS)),
        return_exceptions=True,
    )

    for client, result in zip(list(CLIENTS), results):
        if isinstance(result, Exception):
            CLIENTS.discard(client)

    print(f"Game command sent: {command}")


async def handler(websocket):
    print("Game browser connected.")
    CLIENTS.add(websocket)

    try:
        await websocket.wait_closed()
    finally:
        CLIENTS.discard(websocket)
        print("Game browser disconnected.")


# --------------------------------------------------
# 4. Terminal-based software testing
# --------------------------------------------------

async def terminal_loop():
    print("\nModel testing is ready.")
    print("Enter 9 comma-separated feature values in this order:")
    print(", ".join(FEATURE_NAMES))
    print("\nCommands:")
    print("  test-focus  -> test the game's lane-switch connection")
    print("  test-blink  -> test the game's jump connection")
    print("  reset       -> clear the rolling feature history")
    print("  quit        -> stop the program")
    print("\nNote: test-focus and test-blink bypass the model.")

    while True:
        try:
            line = await asyncio.to_thread(
                input, "\nFeatures or command > "
            )
        except (EOFError, KeyboardInterrupt):
            break

        line = line.strip()

        if line.lower() == "quit":
            break

        if line.lower() == "reset":
            recent_features.clear()
            print("Feature history cleared.")
            continue

        if line.lower() == "test-focus":
            await broadcast_command("CONCENTRATION")
            continue

        if line.lower() == "test-blink":
            await broadcast_command("BLINK")
            continue

        try:
            features = [float(value.strip()) for value in line.split(",")]

            prediction, label = predict_state(features)
            print(f"Model prediction: {label} ({prediction})")

            if prediction == 1:
                await broadcast_command("CONCENTRATION")
            else:
                print("Relaxed: no game action sent.")

        except ValueError as exc:
            print(f"Invalid input: {exc}")
            print("Enter exactly 9 comma-separated numeric values.")
        except Exception as exc:
            print(f"Prediction error: {exc}")


# --------------------------------------------------
# 5. Start the WebSocket server and terminal
# --------------------------------------------------

async def main():
    load_model()

    host = "localhost"
    port = 8765

    async with websockets.serve(handler, host, port):
        print(f"\nWebSocket server running at ws://{host}:{port}")
        print("Open Temple BCI Runner in your browser.")

        await terminal_loop()

    print("BCI bridge stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBCI bridge stopped.")