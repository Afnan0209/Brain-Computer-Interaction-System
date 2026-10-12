import serial
import numpy as np
import pywt
import scipy.stats
from scipy.signal import butter, filtfilt
import joblib
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque
import sys

SERIAL_PORT = 'COM15'  
BAUD_RATE = 115200

try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
except Exception:
    print(f"\n[ERROR] Could not connect to {SERIAL_PORT}. Close the Arduino IDE!\n")
    sys.exit()

print("Waking up the BCI model...")
scaler = joblib.load("saved_models/bci_scaler.joblib")
model = joblib.load("saved_models/bci_xgb_model.joblib")

WINDOW_SIZE = 160
raw_buffer = deque(maxlen=300) 
feature_buffer = deque(maxlen=5) 

alpha_buffer = deque([0]*100, maxlen=100)
beta_buffer = deque([0]*100, maxlen=100)

BLINK_THRESHOLD = 400

# 1-40Hz Bandpass Filter to eliminate 50Hz room noise
def get_bandpass_filter(lowcut, highcut, fs, order=4):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return b, a

b_band, a_band = get_bandpass_filter(1.0, 40.0, 100.0, order=4)

fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(10, 8))

line1, = ax1.plot([], [], lw=2, color='#00d1b2')
ax1.set_ylim(-500, 500) 
ax1.set_xlim(0, 300)
title_text = ax1.set_title("Initializing BCI...", fontsize=16, fontweight='bold')
ax1.set_ylabel("Amplitude")
ax1.grid(True, alpha=0.3)

line2, = ax2.plot(range(100), [0]*100, lw=2, color='#9b59b6') 
ax2.set_ylim(0, 1.0)
ax2.set_xlim(0, 100)
ax2.set_title("Alpha Wave Power (Relaxation)")
ax2.set_ylabel("Relative Power")
ax2.grid(True, alpha=0.3)

line3, = ax3.plot(range(100), [0]*100, lw=2, color='#e74c3c') 
ax3.set_ylim(0, 1.0)
ax3.set_xlim(0, 100)
ax3.set_title("Beta Wave Power (Focus)")
ax3.set_ylabel("Relative Power")
ax3.grid(True, alpha=0.3)

def process_features(signal_window):
    coeffs = pywt.wavedec(signal_window, 'db4', level=4)
    
    delta = float(np.mean(np.square(coeffs[0])))
    theta = float(np.mean(np.square(coeffs[1])))
    alpha = float(np.mean(np.square(coeffs[2])))
    beta = float(np.mean(np.square(coeffs[3])))
    gamma = float(np.mean(np.square(coeffs[4])))
    
    total_pwr = delta + theta + alpha + beta + gamma + 1e-6
    rel_a, rel_b, rel_t, rel_g = alpha/total_pwr, beta/total_pwr, theta/total_pwr, gamma/total_pwr
    
    power_dist = [max(p, 1e-9) for p in [rel_a, rel_b, rel_t, rel_g, delta/total_pwr]]
    entropy = float(scipy.stats.entropy(power_dist))
    
    features = [rel_a, rel_b, rel_t, rel_g, 
                rel_b/(rel_a + 1e-6), rel_t/(rel_b + 1e-6), 
                entropy, float(np.var(signal_window)), float(np.ptp(signal_window))]
    
    return features, rel_a, rel_b

def update_graph(frame):
    while ser.in_waiting:
        try:
            val = float(ser.readline().decode('utf-8').strip())
            raw_buffer.append(val)
        except ValueError:
            pass 

    if len(raw_buffer) >= WINDOW_SIZE:
        
        # 1. Grab ALL data in the buffer for smooth plotting
        full_raw = np.array(list(raw_buffer), dtype=np.float64)
        
        # 2. Filter the whole buffer (matches full_raw length)
        filtered_full = filtfilt(b_band, a_band, full_raw)
        
        # 3. Extract exactly 160 points for the AI to analyze
        current_window = filtered_full[-WINDOW_SIZE:]
        
        features, rel_a, rel_b = process_features(current_window)
        alpha_buffer.append(rel_a)
        beta_buffer.append(rel_b)
        
        if np.ptp(current_window) > BLINK_THRESHOLD:
            title_text.set_text("STATUS: 👀 BLINK DETECTED (JUMP!)")
            title_text.set_color('green')
            line1.set_color('green')
            feature_buffer.clear() 
            
        else:
            feature_buffer.append(features)
            
            if len(feature_buffer) == 5:
                smoothed_features = np.mean(feature_buffer, axis=0).reshape(1, -1)
                scaled_features = scaler.transform(smoothed_features)
                prediction = model.predict(scaled_features)[0]
                
                if prediction == 1:
                    title_text.set_text("STATUS: 🧠 INTENSE FOCUS (MOVE)")
                    title_text.set_color('red')
                    line1.set_color('red')
                else:
                    title_text.set_text("STATUS: 🌊 RELAXED (IDLE)")
                    title_text.set_color('blue')
                    line1.set_color('blue')

        # Redraw all 3 graphs (X and Y arrays perfectly match)
        line1.set_data(range(len(filtered_full)), list(filtered_full))
        line2.set_data(range(len(alpha_buffer)), list(alpha_buffer))
        line3.set_data(range(len(beta_buffer)), list(beta_buffer))

    return line1, line2, line3, title_text

ani = animation.FuncAnimation(fig, update_graph, interval=100, blit=False, cache_frame_data=False)
plt.tight_layout()
plt.show()