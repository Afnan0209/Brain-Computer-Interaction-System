# BCI Runner - 2-Lane Brain-Controlled Endless Runner

**BCI Runner** is a feature-complete **2-lane** endless runner browser game developed for a **Brain-Computer Interface (BCI)** college project demonstration. 

It features a 2-lane railway runner environment (`LEFT = -1.5`, `RIGHT = +1.5`), original human 3D character avatars with 4 selectable outfits, a Safe Coin Spawning system, power-ups, word collection, progressive level missions, and dedicated EEG accessibility settings.

---

## 🧠 BCI ARCHITECTURE & EEG ACCESSIBILITY

### BCI Input Abstraction Boundary (`js/inputController.js`)
Gameplay and player logic **never** listen to raw keyboard events directly. All movement, jump, and slide actions pass strictly through the `InputController` abstraction API.

| Action | Simulated BCI Signal | Controls | API Method |
|---|---|---|---|
| **MOVE LEFT** | Beta Band + Left Motor Intent | `←` / `A` | `inputController.triggerMoveLeft()` |
| **MOVE RIGHT** | Beta Band + Right Motor Intent | `→` / `D` | `inputController.triggerMoveRight()` |
| **JUMP** | Eye Blink Spike (Fp1/Fp2) | `↑` / `W` / `Space` | `inputController.triggerJump()` |
| **SLIDE** | Alpha Band / Down Intent | `↓` / `S` | `inputController.triggerSlide()` |

### BCI-Friendly Game Speed & Latency Buffering
To accommodate 1–3 second classification latency of real EEG decoders:
1. **Slower Base Running Speed**: Default starting speed is set to SLOW (11–13 units/s, ~40% of standard runner speed).
2. **Generous Reaction Windows**: Obstacle wave spacing is set to $\ge 45-60$ units, providing 3 to 5 seconds of look-ahead reaction time.
3. **EEG Action Buffer**: Configurable `EEG_ACTION_BUFFER` (~1.5 seconds) holds incoming predictions so commands remain active during classification delays.
4. **Training Mode**: Optional practice mode where obstacle hits show warnings without game-over penalties.

---

## 🎮 GAMEPLAY FEATURES & SYSTEMS

1. **2-Lane System**: Smooth lateral interpolation between `LEFT (-1.5)` and `RIGHT (+1.5)`.
2. **Human 3D Characters**: Human runner model with 4 selectable outfits (*Cyber Runner*, *Street Runner*, *Neon Athlete*, *Sci-Fi Explorer*) saved to `localStorage`.
3. **Safe Spawning Engine**: Coins, letters, and power-ups **NEVER** spawn inside trains or barriers. Occupied 3D bounding boxes are calculated first, and collectibles are spawned strictly in safe open lanes, on train roofs, or parabolic jump arches.
4. **Power-Ups**:
   - 🚀 **Jetpack**: Ascends player to $Y=5.8$, collects aerial coins, protected from ground obstacles.
   - 👟 **Super Sneakers**: Increases jump height by 40%.
   - 🧲 **Coin Magnet**: Attracts nearby coins within 14u radius.
   - ✖️ **2x Multiplier**: Doubles continuous score gain rate.
5. **Word Collection**: Collect letters along the track to complete words (`S-U-B-W-A-Y` / `B-C-I`) for celebration fireworks and bonus points.
6. **Levels & Missions**: Level 1, 2, 3+ with specific coin, distance, and word objectives.
7. **Procedural Web Audio Engine**: Zero MP3/WAV dependencies; uses Web Audio API for jump, slide, coin chime, powerup pickup, and word complete fanfare.

---

## 🚀 HOW TO RUN LOCALLY

### Option 1: Live Server in VS Code
1. Open VS Code and open the `bci-runner` folder.
2. Right-click `index.html` and select **Open with Live Server**.

### Option 2: Python Simple HTTP Server
Open your terminal in the `bci-runner` directory and run:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your web browser.
