"""
game_link.py - connects live_bci.py to the Temple BCI Runner game.

* GameLink    : WebSocket server (ws://localhost:8765) running in a background thread,
                so the matplotlib window in live_bci.py keeps working as before.
* GameTrigger : turns raw per-frame signals into clean one-shot game events.

    Blink : one blink = one jump. Re-arms once the spike has left the last 0.5 s,
            with a minimum gap of blink_cooldown seconds.
    Focus : fires ONCE when you go Relaxed -> Focused (min focus_cooldown seconds
            apart). To switch lane again, relax and focus again.

update_blink() / update_focus() return True when they fired a command, so the
caller can ask the feedback learner "was that right?".
"""
import asyncio
import json
import threading
import time

import numpy as np

try:
    import websockets
except ImportError:  # keeps live_bci.py usable without the game
    websockets = None


class GameLink:
    def __init__(self, host="localhost", port=8765):
        self.host, self.port = host, port
        self.clients = set()
        self.on_feedback = None   # callback(key) for y/n/f/r pressed inside the game
        self.loop = None
        self.ready = threading.Event()

    def start(self):
        if websockets is None:
            print("[GAME] 'websockets' not installed -> run: pip install websockets (game link OFF)")
            return False
        threading.Thread(target=self._run, daemon=True).start()
        self.ready.wait(3)
        return True

    def _run(self):
        try:
            asyncio.run(self._main())
        except OSError as e:
            print(f"[GAME] Could not open port {self.port} ({e}). Close bci_bridge.py and retry.")
            self.ready.set()

    async def _main(self):
        self.loop = asyncio.get_running_loop()
        async with websockets.serve(self._handler, self.host, self.port):
            print(f"[GAME] WebSocket server ready at ws://{self.host}:{self.port}")
            self.ready.set()
            await asyncio.Future()  # run forever

    async def _handler(self, ws):
        self.clients.add(ws)
        print("[GAME] Browser connected")
        try:
            async for raw in ws:          # messages FROM the game (feedback answers)
                try:
                    key = json.loads(raw).get("feedback")
                except Exception:
                    continue
                if key and self.on_feedback:
                    self.on_feedback(key)
        finally:
            self.clients.discard(ws)
            print("[GAME] Browser disconnected")

    async def _broadcast(self, msg):
        for c in list(self.clients):
            try:
                await c.send(msg)
            except Exception:
                self.clients.discard(c)

    def ask(self, kind):
        """Show the 'was that right?' prompt inside the game ('focus' or 'blink')."""
        if self.loop is None or not self.clients:
            return
        asyncio.run_coroutine_threadsafe(
            self._broadcast(json.dumps({"action": "FEEDBACK_ASK", "kind": kind})), self.loop)

    def send(self, command):
        """Thread-safe: send {"action": command} to every connected browser."""
        if self.loop is None:
            return
        asyncio.run_coroutine_threadsafe(
            self._broadcast(json.dumps({"action": command})), self.loop)
        print(f"[GAME] -> {command}" + ("" if self.clients else "  (no browser connected)"))


class GameTrigger:
    def __init__(self, link, blink_threshold=400, blink_cooldown=0.6,
                 focus_cooldown=2.0, focus_repeat=5.0):
        self.link = link
        self.blink_threshold = blink_threshold
        self.blink_cooldown = blink_cooldown
        self.focus_cooldown = focus_cooldown
        self.focus_repeat = focus_repeat
        self.blink_armed = True
        self.last_blink = 0.0
        self.last_focus = 0.0
        self.last_state = 0

    def update_blink(self, recent_ptp):
        """recent_ptp: peak-to-peak of only the last ~0.5 s of signal. A spike in
        that span fires once; it re-arms when the spike has left it (the spike
        stays in the longer 1.6 s analysis window, which would re-trigger)."""
        now = time.monotonic()
        if recent_ptp <= self.blink_threshold:
            self.blink_armed = True
        if (self.blink_armed and recent_ptp > self.blink_threshold
                and now - self.last_blink >= self.blink_cooldown):
            self.blink_armed = False
            self.last_blink = now
            self.link.send("BLINK")
            return True
        return False

    def update_focus(self, prediction):
        now = time.monotonic()
        fired = False
        if prediction == 1:
            onset = self.last_state != 1
            # One lane switch per focus: fires on relaxed->focused, repeats only after
            # focus_repeat seconds of *continuous* focus (None = never repeat).
            if onset:
                wait = self.focus_cooldown
            elif self.focus_repeat:
                wait = self.focus_repeat
            else:
                wait = None
            if wait is not None and now - self.last_focus >= wait:
                self.link.send("CONCENTRATION")
                self.last_focus = now
                fired = True
        self.last_state = int(prediction)
        return fired
