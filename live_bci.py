import sys
import time
import numpy as np
import serial
from scipy.signal import butter, filtfilt, welch
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque
from types import SimpleNamespace

from game_link import GameLink, GameTrigger
from feedback_learner import PersonalFocus, FEATURE_NAMES

SERIAL_PORT = 'COM9'
BAUD_RATE = 115200

FS_OVERRIDE = None      # set a number (e.g. 250) only if you KNOW the true sampling rate;
                        # None = measure it automatically during the first 5 seconds
BLINK_THRESHOLD = 400     # a swing bigger than this in the last 0.5 s = one blink = one jump
ARTIFACT_PTP = 900        # classification pauses only for swings bigger than this (big movement).
                          # Must be above normal blinks (400-650), or every blink freezes your focus reading.
DEBUG = True            # prints features + probability once per second

# Calibration: 30 s relax + 30 s focus at the start of the run.
ALWAYS_CALIBRATE = True   # True = calibrate every time you start (best: electrode placement changes
                          # a little each session). False = only the first time, or with --calibrate
CAL_PREP_SEC = 5
CAL_RELAX_SEC = 30
CAL_FOCUS_SEC = 30
CAL_MIN_CLEAN = 40       # each phase continues (up to 2x its length) until this many clean samples
CAL_SKIP_SEC = 4        # ignore the first seconds of each phase (you are still switching state)
CAL_SAMPLE_EVERY = 0.5

# Focus decision: smoothed probability with hysteresis, so it does not flicker
P_ON, P_OFF = 0.65, 0.45
P_SMOOTH = 0.4

try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    ser.reset_input_buffer()
except Exception:
    print(f"\n[ERROR] Could not connect to {SERIAL_PORT}. Close the Arduino IDE!\n")
    sys.exit()

# ---- Game link + personal model ------------------------------------------------
game_link = GameLink()
game_link.start()
game_trigger = GameTrigger(game_link, blink_threshold=BLINK_THRESHOLD)
learner = PersonalFocus()
game_link.on_feedback = learner.handle_key
learner.notify = game_link.ask

CALIBRATE = ALWAYS_CALIBRATE or ('--calibrate' in sys.argv) or (not learner.ready)

raw_buffer = deque(maxlen=400)
alpha_buffer = deque([0] * 100, maxlen=100)
beta_buffer = deque([0] * 100, maxlen=100)

st = SimpleNamespace(
    fs=None, t_first=None, n_count=0,
    b=None, a=None, hc=40.0,
    win=160, recent=50, feat_win=200,
    calibrating=CALIBRATE, cal_idx=-1, cal_t0=0.0, cal_last=0.0, cal_n=[0, 0],
    p_smooth=None, state=0, last_debug=0.0, last_art=0.0,
)

fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(10, 8))

line1, = ax1.plot([], [], lw=2, color='#00d1b2')
ax1.set_ylim(-500, 500)
ax1.set_xlim(0, 400)
title_text = ax1.set_title("Measuring sampling rate...", fontsize=16, fontweight='bold')
ax1.set_ylabel("Amplitude")
ax1.grid(True, alpha=0.3)

line2, = ax2.plot(range(100), [0] * 100, lw=2, color='#9b59b6')
ax2.set_ylim(0, 1.0)
ax2.set_xlim(0, 100)
ax2.set_title("Alpha Wave Power (Relaxation)")
ax2.set_ylabel("Relative Power")
ax2.grid(True, alpha=0.3)

line3, = ax3.plot(range(100), [0] * 100, lw=2, color='#e74c3c')
ax3.set_ylim(0, 1.0)
ax3.set_xlim(0, 100)
ax3.set_title("Beta Wave Power (Focus)")
ax3.set_ylabel("Relative Power")
ax3.grid(True, alpha=0.3)


def beep():
    try:
        import winsound
        winsound.Beep(900, 200)
    except Exception:
        print("\a", end="")


def setup_for_rate(fs):
    """Everything that depends on the real sampling rate."""
    global raw_buffer
    st.fs = fs
    st.hc = min(40.0, 0.4 * fs)
    nyq = 0.5 * fs
    st.b, st.a = butter(4, [1.0 / nyq, st.hc / nyq], btype='band')
    st.win = int(1.6 * fs)        # blink analysis window (same 1.6 s as before)
    st.recent = int(0.5 * fs)     # last 0.5 s - used for one-blink-one-jump
    st.feat_win = int(2.0 * fs)   # EEG window for band power
    raw_buffer = deque(raw_buffer, maxlen=int(4 * fs))
    ax1.set_xlim(0, int(4 * fs))
    print(f"[FS] Sampling rate measured: {fs:.1f} Hz  (bandpass 1-{st.hc:.0f} Hz)")
    if fs < 70:
        print("[FS] WARNING: below 70 Hz beta (13-30 Hz) is poorly captured. "
              "Raise the Arduino sampling rate if you can.")


def band_features(x, fs, hc):
    """Band powers of a 2 s window, computed at the REAL sampling rate."""
    x = x - np.mean(x)
    nper = int(min(len(x), fs))                       # 1 s segments -> ~1 Hz resolution
    f, pxx = welch(x, fs=fs, nperseg=nper, noverlap=nper // 2, detrend='constant')
    df = f[1] - f[0]

    def bp(lo, hi):
        m = (f >= lo) & (f < hi)
        return float(np.sum(pxx[m]) * df)

    theta, alpha, beta = bp(4, 8), bp(8, 13), bp(13, 30)
    hf = bp(30, hc)
    slow = bp(1, 4)                       # drift / blinks / electrode movement - NOT brain rhythm
    total = bp(4, hc) + 1e-9              # relative powers use 4-40 Hz only, so slow drift
    eps = 1e-9                            # can no longer squash theta/alpha/beta to zero
    feats = [theta / total, alpha / total, beta / total, hf / total,
             float(np.log((beta + eps) / (alpha + theta + eps))),
             float(np.log10(total))]
    slow_frac = slow / (slow + total)
    return feats, alpha / total, beta / total, slow_frac


CAL_PHASES = [
    ("GET READY - sit still, eyes open", CAL_PREP_SEC, None),
    ("RELAX - stare at one spot, no jaw clenching", CAL_RELAX_SEC, 0),
    ("GET READY for mental math", CAL_PREP_SEC, None),
    ("FOCUS - count backward from 1000 by 7", CAL_FOCUS_SEC, 1),
]


def run_calibration(feats, artifact, now):
    """Returns True while calibration is still running."""
    phase_over = st.cal_idx < 0
    if not phase_over:
        _msg, _dur, _label = CAL_PHASES[st.cal_idx]
        elapsed = now - st.cal_t0
        if _label is None:
            phase_over = elapsed >= _dur
        else:   # keep going until enough CLEAN samples (up to twice the planned time)
            phase_over = (elapsed >= _dur and st.cal_n[_label] >= CAL_MIN_CLEAN) or elapsed >= 2 * _dur
    if phase_over:
        st.cal_idx += 1
        if st.cal_idx >= len(CAL_PHASES):
            print(f"[CAL] Done. Collected {st.cal_n[0]} relaxed + {st.cal_n[1]} focus samples.")
            q = learner.train()
            if q is None:
                print("[CAL] Not enough clean samples - run again with --calibrate "
                      "and try to stay still (no blinking spikes).")
            elif q >= 0.75:
                print("[CAL] Good separation - your signal carries focus information.")
            elif q >= 0.62:
                print("[CAL] Weak separation. It will work somewhat; improve electrode contact "
                      "and press y/n/f/r while playing to sharpen it.")
            else:
                print("[CAL] POOR separation: relaxed and focused look the same on this setup. "
                      "Check electrode contact/reference, then re-run with --calibrate.")
            st.calibrating = False
            title_text.set_text("Calibration complete")
            return False
        st.cal_t0 = now
        st.cal_last = now
        print(f"[CAL] {CAL_PHASES[st.cal_idx][0]}  ({CAL_PHASES[st.cal_idx][1]} s)")
        beep()

    msg, dur, label = CAL_PHASES[st.cal_idx]
    remaining = max(0.0, dur - (now - st.cal_t0))
    got = f"  clean {st.cal_n[label]}/{CAL_MIN_CLEAN}" if label is not None else ""
    title_text.set_text(f"CALIBRATION: {msg}  [{remaining:.0f}s{got}]")
    title_text.set_color('orange')
    if (label is not None and not artifact and now - st.cal_t0 > CAL_SKIP_SEC
            and now - st.cal_last >= CAL_SAMPLE_EVERY and feats is not None):
        learner.add_sample(feats, label, "calib", st.fs, train=False)
        st.cal_n[label] += 1
        st.cal_last = now
    return True


def update_graph(frame):
    now = time.monotonic()
    n_new = 0
    while ser.in_waiting:
        try:
            val = float(ser.readline().decode('utf-8').strip())
            raw_buffer.append(val)
            n_new += 1
        except ValueError:
            pass

    # ---- measure the real sampling rate (first 5 s) -------------------------------
    if st.fs is None:
        if FS_OVERRIDE:
            setup_for_rate(float(FS_OVERRIDE))
        else:
            if st.t_first is None:
                if n_new:
                    st.t_first = now          # count only samples that arrive after this
                return line1, line2, line3, title_text
            st.n_count += n_new
            if now - st.t_first < 5.0:
                return line1, line2, line3, title_text
            fs = st.n_count / (now - st.t_first)
            if not (20 <= fs <= 2000):
                print(f"[FS] Odd measurement ({fs:.1f} Hz) - assuming 100 Hz. "
                      f"Set FS_OVERRIDE at the top of live_bci.py.")
                fs = 100.0
            setup_for_rate(fs)

    if len(raw_buffer) < st.feat_win + 20:
        return line1, line2, line3, title_text

    # ---- filter + features ---------------------------------------------------------
    full_raw = np.array(list(raw_buffer), dtype=np.float64)
    filtered_full = filtfilt(st.b, st.a, full_raw)
    current_window = filtered_full[-st.win:]
    window_ptp = float(np.ptp(current_window))
    recent_ptp = float(np.ptp(current_window[-st.recent:]))   # last 0.5 s

    eeg = filtered_full[-st.feat_win:]
    artifact = float(np.ptp(eeg)) > ARTIFACT_PTP              # big movement in the last 2 s
    feats, rel_a, rel_b, slow_frac = band_features(eeg, st.fs, st.hc)
    if not artifact:
        alpha_buffer.append(rel_a)
        beta_buffer.append(rel_b)
        learner.set_latest(feats)

    # ---- calibration mode (no game commands while it runs) ------------------------
    if st.calibrating:
        run_calibration(feats, artifact, now)
    else:
        # One blink -> one jump
        if game_trigger.update_blink(recent_ptp):
            learner.on_blink_fired(recent_ptp)

        if artifact:
            # Keep showing the last decision instead of going blank, and say why we hold.
            swing = float(np.ptp(eeg))
            if st.p_smooth is None:
                title_text.set_text("BLINK / MOVEMENT - hold still for 2 s")
            else:
                name = "FOCUS" if st.state == 1 else "RELAXED"
                title_text.set_text(f"STATUS: {name}  (holding - blink/movement)")
            title_text.set_color('orange')
            line1.set_color('orange')
            if now - st.last_art > 1.0:
                st.last_art = now
                print(f"[ARTIFACT] signal swing {swing:.0f} > {ARTIFACT_PTP} within the last 2 s "
                      f"-> holding last state. Sit still; if this never stops, check the electrode "
                      f"contact / reference / cable.")
        else:
            p = learner.predict_proba(feats)
            if p is None:
                title_text.set_text("No personal model yet - run with --calibrate")
            else:
                st.p_smooth = p if st.p_smooth is None else (1 - P_SMOOTH) * st.p_smooth + P_SMOOTH * p
                if st.state == 0 and st.p_smooth > P_ON:
                    st.state = 1
                elif st.state == 1 and st.p_smooth < P_OFF:
                    st.state = 0
                if game_trigger.update_focus(st.state):
                    learner.on_focus_fired()
                if st.state == 1:
                    title_text.set_text(f"STATUS: INTENSE FOCUS (MOVE)  p={st.p_smooth:.2f}")
                    title_text.set_color('red')
                    line1.set_color('red')
                else:
                    title_text.set_text(f"STATUS: RELAXED (IDLE)  p={st.p_smooth:.2f}")
                    title_text.set_color('blue')
                    line1.set_color('blue')

                if DEBUG and now - st.last_debug > 1.0:
                    st.last_debug = now
                    print(f"[DEBUG] fs={st.fs:.0f} p={st.p_smooth:.2f} state={st.state} "
                          f"theta={feats[0]:.2f} alpha={feats[1]:.2f} beta={feats[2]:.2f} "
                          f"hf={feats[3]:.2f} logpow={feats[5]:.1f} slow(drift)={slow_frac:.2f}")

    line1.set_data(range(len(filtered_full)), list(filtered_full))
    line2.set_data(range(len(alpha_buffer)), list(alpha_buffer))
    line3.set_data(range(len(beta_buffer)), list(beta_buffer))
    return line1, line2, line3, title_text


ani = animation.FuncAnimation(fig, update_graph, interval=100, blit=False, cache_frame_data=False)
plt.tight_layout()
plt.show()
