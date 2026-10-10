import os
import glob
import numpy as np
import pandas as pd
import pywt
import scipy.stats  # NEW: Required for chaos measurement

INPUT_FOLDER = "cleaned_datasets"
OUTPUT_FOLDER = "features"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

all_files = glob.glob(os.path.join(INPUT_FOLDER, "Clean_*.csv"))
print(f"Extracting biologically corrected features from {len(all_files)} files...")

WINDOW_SIZE = 160  
master_features = []

for file_path in all_files:
    subject_id = os.path.basename(file_path).replace("Clean_", "").replace(".csv", "")
    df = pd.read_csv(file_path)
    
    if 'Event' in df.columns:
        df['Event'] = df['Event'].replace(0, pd.NA).ffill().fillna(0)
        
    signal = df['Fpz_Clean'].values
    events = df['Event'].values
    
    i = 0
    while i + WINDOW_SIZE <= len(signal):
        start = i
        end = start + WINDOW_SIZE
        
        window_signal = np.array(signal[start:end], dtype=np.float64)
        window_event = int(pd.Series(events[start:end]).mode()[0])
        
        coeffs = pywt.wavedec(window_signal, 'db4', level=4)
        
        delta_pwr = float(np.mean(np.square(coeffs[0]))) 
        theta_pwr = float(np.mean(np.square(coeffs[1]))) 
        alpha_pwr = float(np.mean(np.square(coeffs[2]))) 
        beta_pwr = float(np.mean(np.square(coeffs[3])))  
        gamma_pwr = float(np.mean(np.square(coeffs[4]))) 
        
        total_pwr = delta_pwr + theta_pwr + alpha_pwr + beta_pwr + gamma_pwr + 1e-6
        
        rel_alpha = alpha_pwr / total_pwr
        rel_beta = beta_pwr / total_pwr
        rel_theta = theta_pwr / total_pwr
        rel_gamma = gamma_pwr / total_pwr
        
        # --- THE ENTROPY UPGRADE ---
        # Calculates the chaos/complexity of the brainwave distribution
        power_dist = [max(p, 1e-9) for p in [rel_alpha, rel_beta, rel_theta, rel_gamma, delta_pwr/total_pwr]]
        spectral_entropy = float(scipy.stats.entropy(power_dist))
        
        signal_var = float(np.var(window_signal))
        signal_ptp = float(np.ptp(window_signal)) 
        
        master_features.append({
            'Subject': subject_id,
            'Event': window_event,
            'Rel_Alpha': rel_alpha,
            'Rel_Beta': rel_beta,
            'Rel_Theta': rel_theta,
            'Rel_Gamma': rel_gamma,
            'Beta_Alpha_Ratio': rel_beta / (rel_alpha + 1e-6),
            'Theta_Beta_Ratio': rel_theta / (rel_beta + 1e-6),
            'Spectral_Entropy': spectral_entropy,  # Added to dataset
            'Signal_Variance': signal_var,
            'Signal_PtP': signal_ptp
        })
        
        i += 80  

output_file = os.path.join(OUTPUT_FOLDER, "master_advanced_features.csv")
pd.DataFrame(master_features).to_csv(output_file, index=False)
print(f"\nSuccess! Features + Entropy saved to {output_file}")