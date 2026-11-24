"""
feedback_learner.py (v2) - PERSONAL focus model, learned from YOU.

No pretrained model involved. The model learns what *your* relaxed and *your*
focused EEG look like, using band-power features computed at the real sampling rate.

Where the labels come from
    * Calibration at startup (live_bci.py runs it automatically the first time,
      or whenever you start with --calibrate): 30 s relaxed + 30 s mental math.
    * Key presses while you play (press them in the GAME window, or in this terminal):
        y / n  = the last lane switch was right / wrong
        f      = "I'm focusing right now"  (missed trigger)
        r      = "I'm relaxed right now"
Everything is saved to personal_data.csv and the model is retrained as you go,
so it keeps improving between sessions.
"""
import os
import sys
import time
import threading
import numpy as np
import joblib
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

FEATURE_NAMES = ["rel_theta", "rel_alpha", "rel_beta", "rel_hf",
                 "log_beta_over_alpha_theta", "log_total_power"]


class PersonalFocus:
    def __init__(self, data_file="personal_data_v3.csv",
                 model_file="saved_models/personal_model_v3.joblib",
                 blink_file="blink_feedback.csv",
                 min_per_class=12, retrain_every=5, ask_window=6.0):
        self.data_file, self.model_file, self.blink_file = data_file, model_file, blink_file
        self.min_per_class = min_per_class
        self.retrain_every = retrain_every
        self.ask_window = ask_window

        self.X, self.y, self.src = [], [], []
        self.model = None
        self.latest = None          # newest feature vector
        self.latest_t = 0.0
        self.pending = None
        self.notify = None          # callback(kind): shows the prompt in the game
        self.since_train = 0
        self.blink_rows = []
        self.lock = threading.Lock()

        d = os.path.dirname(model_file)
        if d:
            os.makedirs(d, exist_ok=True)
        self._load()
        self._start_keyboard_thread()

    # ------------------------------------------------------------ persistence
    def _load(self):
        n_feat = len(FEATURE_NAMES)
        if os.path.exists(self.data_file):
            for line in open(self.data_file):
                p = line.strip().split(",")
                if len(p) != 4 + n_feat or p[0] == "timestamp":
                    continue
                self.y.append(int(p[1]))
                self.src.append(p[2])
                self.X.append([float(v) for v in p[4:]])
        if os.path.exists(self.blink_file):
            for line in open(self.blink_file):
                p = line.strip().split(",")
                if len(p) == 3 and p[0] != "timestamp":
                    try:
                        self.blink_rows.append((float(p[1]), int(p[2])))
                    except ValueError:
                        pass
        if os.path.exists(self.model_file):
            try:
                self.model = joblib.load(self.model_file)
            except Exception:
                self.model = None
        print(f"[LEARN] {len(self.y)} saved samples "
              f"({sum(self.y)} focus / {len(self.y) - sum(self.y)} relaxed), "
              f"personal model {'loaded' if self.model else 'NOT trained yet'}.")

    @property
    def ready(self):
        return self.model is not None

    def add_sample(self, feats, label, source, fs=0.0, train=True):
        feats = [float(v) for v in feats]
        if not np.all(np.isfinite(feats)):
            return
        with open(self.data_file, "a") as f:
            if f.tell() == 0:
                f.write("timestamp,label,source,fs," + ",".join(FEATURE_NAMES) + "\n")
            f.write(f"{time.time():.2f},{int(label)},{source},{fs:.1f}," +
                    ",".join(f"{v:.6f}" for v in feats) + "\n")
        self.X.append(feats)
        self.y.append(int(label))
        self.src.append(source)
        self.since_train += 1
        if train and self.since_train >= self.retrain_every:
            self.train()

    # ------------------------------------------------------------ training
    def _fit(self, X, y):
        m = make_pipeline(StandardScaler(),
                          LogisticRegression(class_weight="balanced", C=0.5, max_iter=2000))
        m.fit(X, y)
        return m

    def train(self, verbose=True):
        """Returns calibration quality (0..1) or None if not enough data."""
        self.since_train = 0
        y = np.array(self.y)
        n1, n0 = int(y.sum()), int((y == 0).sum())
        if min(n1, n0) < self.min_per_class:
            if verbose:
                print(f"[LEARN] Need >= {self.min_per_class} samples of each kind "
                      f"(have {n1} focus / {n0} relaxed).")
            return None
        X = np.array(self.X)
        quality = self._blocked_accuracy(X, y)
        self.model = self._fit(X, y)
        joblib.dump(self.model, self.model_file)
        if verbose:
            msg = f"[LEARN] Personal model trained on {len(y)} samples ({n1} focus / {n0} relaxed)."
            if quality is not None:
                msg += f"  Held-out accuracy: {quality:.0%}"
            print(msg)
        return quality

    def _blocked_accuracy(self, X, y):
        """Train on the first half (in time) of each class, test on the second half, and
        vice versa. Honest estimate - neighbouring samples are never in both sets."""
        idx0, idx1 = np.where(y == 0)[0], np.where(y == 1)[0]
        if min(len(idx0), len(idx1)) < 8:
            return None
        h0, h1 = len(idx0) // 2, len(idx1) // 2
        folds = [(np.r_[idx0[:h0], idx1[:h1]], np.r_[idx0[h0:], idx1[h1:]]),
                 (np.r_[idx0[h0:], idx1[h1:]], np.r_[idx0[:h0], idx1[:h1]])]
        accs = []
        for tr, te in folds:
            if len(set(y[tr])) < 2:
                return None
            m = self._fit(X[tr], y[tr])
            accs.append(float(np.mean(m.predict(X[te]) == y[te])))
        return float(np.mean(accs))

    def predict_proba(self, feats):
        """P(focused) in 0..1, or None if there is no model yet."""
        if self.model is None:
            return None
        try:
            return float(self.model.predict_proba(np.asarray(feats, float).reshape(1, -1))[0][1])
        except Exception:
            return None

    def set_latest(self, feats):
        self.latest = list(feats)
        self.latest_t = time.time()

    # ------------------------------------------------------------ events
    def on_focus_fired(self):
        if self.latest is not None:
            self._ask("focus", list(self.latest), "Lane switch fired")

    def on_blink_fired(self, peak_value):
        self._ask("blink", float(peak_value), "Jump fired")

    def _ask(self, kind, payload, text):
        with self.lock:
            self.pending = {"kind": kind, "payload": payload, "t": time.time()}
        print(f"[FEEDBACK] {text} - was that right?  (y / n in the game window)")
        if self.notify:
            self.notify(kind)

    def handle_key(self, key):
        key = (key or "").lower()
        with self.lock:
            pend = self.pending
            if key in ("y", "n"):
                if pend is None or time.time() - pend["t"] > self.ask_window:
                    return
                self.pending = None
            elif key not in ("f", "r"):
                return
        if key in ("y", "n"):
            right = key == "y"
            if pend["kind"] == "focus":
                self.add_sample(pend["payload"], 1 if right else 0, "fired")
                print(f"[LEARN] saved as {'FOCUSED' if right else 'NOT focused'}")
            else:
                self._save_blink(pend["payload"], right)
        elif key in ("f", "r"):
            if self.latest is None or time.time() - self.latest_t > 1.0:
                print("[LEARN] no fresh signal right now (blink or still warming up) - press again")
                return
            self.add_sample(self.latest, 1 if key == "f" else 0, "missed" if key == "f" else "relaxed")
            print(f"[LEARN] saved as {'FOCUSED' if key == 'f' else 'RELAXED'}")

    def _save_blink(self, peak, right):
        with open(self.blink_file, "a") as f:
            f.write(f"{time.time():.2f},{peak:.2f},{int(right)}\n")
        self.blink_rows.append((peak, int(right)))
        print(f"[LEARN] blink saved as {'REAL' if right else 'FALSE'}")

    # ------------------------------------------------------------ terminal keys
    def _start_keyboard_thread(self):
        def run():
            try:
                if os.name == "nt":
                    import msvcrt
                    while True:
                        if msvcrt.kbhit():
                            ch = msvcrt.getwch()
                            if ch == "\x03":          # Ctrl+C is swallowed by getwch
                                print("\n[LEARN] Ctrl+C - exiting.")
                                os._exit(0)
                            self.handle_key(ch)
                        time.sleep(0.05)
                else:
                    for line in sys.stdin:
                        self.handle_key(line.strip()[:1])
            except Exception:
                pass
        threading.Thread(target=run, daemon=True).start()
