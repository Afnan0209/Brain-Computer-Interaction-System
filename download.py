import urllib.request
import sys

# Direct link to the PhysioNet dataset ZIP
url = "https://physionet.org/static/published-projects/eegmat/eeg-during-mental-arithmetic-tasks-1.0.0.zip"
filename = "eeg-mental-arithmetic-tasks.zip"

def progress(count, block_size, total_size):
    downloaded = count * block_size / (1024 * 1024)
    total = total_size / (1024 * 1024)
    percent = (count * block_size * 100) / total_size if total_size > 0 else 0
    sys.stdout.write(f"\rDownloading: {downloaded:.1f} MB / {total:.1f} MB ({percent:.1f}%)")
    sys.stdout.flush()

print("Bypassing browser throttling to fetch PhysioNet data...")
urllib.request.urlretrieve(url, filename, reporthook=progress)
print("\n\nDownload complete! Unzip this folder to start processing your new C3/C4 data.")