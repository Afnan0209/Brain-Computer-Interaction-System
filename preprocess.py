import mne
import pandas as pd
import numpy as np
import glob
import os
from scipy.signal import butter, filtfilt
from sklearn.preprocessing import StandardScaler

# 1. Define Folders (Update the input path to your unzipped folder)
# 1. Define Folders 
input_folder = "eeg-mental-arithmetic-tasks" # (Update this to match the exact name of your unzipped dataset folder)
output_folder = "cleaned_datasets"
os.makedirs(output_folder, exist_ok=True)

# Find all EDF files
all_files = glob.glob(os.path.join(input_folder, "**", "*.edf"), recursive=True)
print(f"Found {len(all_files)} EDF files. Starting batch processing...")

scaler = StandardScaler()

# 2. Process Each File
for file_path in all_files:
    filename = os.path.basename(file_path)
    
    # Map Event based on filename (_1 = Rest=0, _2 = Math=1)
    if filename.endswith("_1.edf"):
        event_label = 0
    elif filename.endswith("_2.edf"):
        event_label = 1
    else:
        continue
        
    # Load EDF File quietly
    raw = mne.io.read_raw_edf(file_path, preload=True, verbose=False)
    sfreq = raw.info['sfreq'] # Get actual sampling rate dynamically
    
    # Find the Fp1 forehead channel
    ch_names = raw.ch_names
    fp_ch = [ch for ch in ch_names if 'Fp1' in ch]
    
    if not fp_ch:
        print(f"Skipping {filename}: No Fp1 forehead channel found.")
        continue
        
    # Extract time and raw voltage data
    data, times = raw[fp_ch[0], :]
    fp1_data = data[0] * 1e6 # Convert raw Volts to Microvolts (uV)
    
    # Apply 1-40Hz Bandpass filter
    nyq = 0.5 * sfreq
    b, a = butter(4, [1.0/nyq, 40.0/nyq], btype='band')
    filtered_data = filtfilt(b, a, fp1_data)
    
    # Apply Z-score normalization
    normalized_data = scaler.fit_transform(filtered_data.reshape(-1, 1)).flatten()
    
    # Recombine Time, Cleaned Voltage, and the Event labels.
    # NOTE: We name the column 'Fpz_Clean' so your existing DWT script doesn't break!
    clean_df = pd.DataFrame({
        'Time_sec': times,
        'Fpz_Clean': normalized_data,
        'Event': event_label
    })
    
    # Export as CSV
    csv_filename = filename.replace('.edf', '.csv')
    output_path = os.path.join(output_folder, f"Clean_{csv_filename}")
    clean_df.to_csv(output_path, index=False)
    
    print(f"Successfully processed: Clean_{csv_filename}")

print("\n--- ALL EDF FILES CONVERTED AND CLEANED ---")