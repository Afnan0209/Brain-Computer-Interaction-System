import * as THREE from 'three';
import { InputController } from './inputController.js?v=2026';
import { Player } from './player.js?v=2026';
import { Environment } from './environment.js?v=2026';
import { ObstacleManager } from './obstacles.js?v=2026';
import { CoinManager } from './coins.js?v=2026';
import { PowerUpManager } from './powerups.js?v=2026';
import { LetterManager } from './letters.js?v=2026';
import { LevelManager } from './levels.js?v=2026';
import { AudioManager } from './audio.js?v=2026';
import { UIManager } from './ui.js?v=2026';

/**
 * Game.js - Upgraded Core Engine & BCI State Machine
 * ==================================================
 * Coordinates 2-lane physics, human player character, safe spawning pipeline,
 * power-ups, word collection, level missions, procedural audio, and BCI accessibility settings.
 */

export const GAME_STATES = {
  MAIN_MENU: 'MAIN_MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE'
};

export class Game {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.state = GAME_STATES.MAIN_MENU;

    // Three.js Core Setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Audio & Levels Subsystems
    this.audio = new AudioManager();
    this.levelManager = new LevelManager();

    // Settings
    this.settings = {
      speedSetting: 'SLOW',
      responseWindow: 'LONG',
      trainingMode: false
    };

    // Subsystem Managers
    this.player = new Player(this.scene);
    this.environment = new Environment(this.scene, this.camera);
    this.obstacles = new ObstacleManager(this.scene);
    this.coins = new CoinManager(this.scene);
    this.powerups = new PowerUpManager(this.scene);
    this.letters = new LetterManager(this.scene);

    // Initial character selection from storage
    this.player.setSkin(this.levelManager.userData.selectedCharacter);

    // UI Manager
    this.ui = new UIManager({
      onPlay: () => this.startGame(),
      onSelectCharacter: (skinIdx) => {
        this.levelManager.setSelectedCharacter(skinIdx);
        this.player.setSkin(skinIdx);
      },
      onSelectLevel: (n) => this.levelManager.setCurrentLevel(n),
      onToggleMute: () => this.audio.toggleMute(),
      onSaveSettings: (newSettings) => {
        this.settings = { ...this.settings, ...newSettings };
        this.applySettings();
      },
      onPause: () => this.pauseGame(),
      onResume: () => this.resumeGame(),
      onRestart: () => this.startGame(),
      onMainMenu: () => this.showMainMenu(),
      onNextLevel: () => {
        this.levelManager.setCurrentLevel(this.levelManager.userData.currentLevel + 1);
        this.startGame();
      }
    });

    // Sync level unlocked state to UI
    this.ui.setLevels(this.levelManager.userData.unlockedLevel);

    // Input Abstraction Controller (BCI Action API)
    this.input = new InputController();
    this.input.bindActions({
      onJump: () => {
        if (this.state === GAME_STATES.PLAYING) {
          if (this.player.jump()) {
            this.audio.playJump();
            this.levelManager.recordJump();
            this.ui.flashCommand('JUMP');
          }
        }
      },
      onSlide: () => {
        if (this.state === GAME_STATES.PLAYING) {
          if (this.player.slide()) {
            this.audio.playSlide();
            this.levelManager.recordSlide();
            this.ui.flashCommand('SLIDE');
          }
        }
      },
      onMoveLeft: () => {
        if (this.state === GAME_STATES.PLAYING) {
          this.player.moveLeft();
          this.levelManager.recordLaneChange();
          this.ui.flashCommand('LEFT');
        }
      },
      onMoveRight: () => {
        if (this.state === GAME_STATES.PLAYING) {
          this.player.moveRight();
          this.levelManager.recordLaneChange();
          this.ui.flashCommand('RIGHT');
        }
      }
    });

    // Gameplay Metrics
    this.score = 0;
    this.coinCount = 0;
    this.distance = 0;
    this.currentSpeed = 12.0;

    this.lastTime = performance.now();

    window.addEventListener('resize', () => this.onWindowResize(), false);

    this.ui.updateMenuStats(
      this.levelManager.userData.highScore,
      this.levelManager.userData.totalCoins
    );

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  applySettings() {
    const speeds = { VERY_SLOW: 9.0, SLOW: 12.0, NORMAL: 16.0 };
    this.baseSpeed = speeds[this.settings.speedSetting] || 12.0;

    const spacings = { LONG: 55.0, MEDIUM: 42.0, SHORT: 32.0 };
    const spacing = spacings[this.settings.responseWindow] || 55.0;
    this.obstacles.setBciSpacing(spacing);
  }

  startGame() {
    this.audio.init();
    this.audio.playClick();
    this.audio.startBgMusic();
    this.applySettings();
    this.resetState();

    const currentLevelDef = this.levelManager.getCurrentLevelDef();
    this.letters.setTargetWord(currentLevelDef.targetWord || 'SUBWAY');

    this.state = GAME_STATES.PLAYING;
    this.input.setEnabled(true);
    this.ui.showScreen('hud');
  }

  pauseGame() {
    if (this.state === GAME_STATES.PLAYING) {
      this.state = GAME_STATES.PAUSED;
      this.input.setEnabled(false);
      this.ui.showScreen('pause');
    }
  }

  resumeGame() {
    if (this.state === GAME_STATES.PAUSED) {
      this.state = GAME_STATES.PLAYING;
      this.input.setEnabled(true);
      this.ui.showScreen('hud');
    }
  }

  showMainMenu() {
    this.audio.playClick();
    this.resetState();
    this.state = GAME_STATES.MAIN_MENU;
    this.input.setEnabled(false);
    this.ui.updateMenuStats(
      this.levelManager.userData.highScore,
      this.levelManager.userData.totalCoins
    );
    this.ui.setLevels(this.levelManager.userData.unlockedLevel);
    this.ui.showScreen('mainMenu');
  }

  resetState() {
    this.score = 0;
    this.coinCount = 0;
    this.distance = 0;
    this.currentSpeed = this.baseSpeed || 12.0;

    this.player.reset();
    this.environment.reset();
    this.obstacles.reset();
    this.coins.reset();
    this.powerups.reset();
    this.letters.reset();
    this.levelManager.resetRunStats();

    this.ui.updateHUD(this.score, this.coinCount, this.distance, this.letters.getWordProgress());
  }

  gameOver() {
    this.state = GAME_STATES.GAME_OVER;
    this.input.setEnabled(false);
    this.audio.playCrash();

    const isNewHigh = this.score > this.levelManager.userData.highScore;
    if (isNewHigh) {
      this.levelManager.userData.highScore = Math.floor(this.score);
      this.levelManager.saveData();
    }

    this.ui.showGameOver(this.score, this.coinCount, this.distance, isNewHigh);
  }

  levelComplete() {
    this.state = GAME_STATES.LEVEL_COMPLETE;
    this.input.setEnabled(false);
    this.audio.playWordComplete();
    this.ui.setLevels(this.levelManager.userData.unlockedLevel);
    this.ui.showLevelComplete(this.levelManager.getCurrentLevelDef());
  }

  animate(currentTime) {
    requestAnimationFrame(this.animate);

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    if (this.state === GAME_STATES.PLAYING) {
      // Input buffer update
      this.input.update(dt);

      // Speed Scaling (Gradual BCI speed increase)
      this.currentSpeed = Math.min(24.0, this.currentSpeed + dt * 0.08);

      // Powerups Update
      this.powerups.update(
        this.currentSpeed, dt, this.player, this.coins,
        (type) => {
          this.audio.playPowerUp();
          this.levelManager.recordPowerup();
          this.ui.showToast(`POWER-UP ACTIVATED: ${type}!`);
        }
      );
      this.ui.updatePowerups(this.powerups.active);

      // Obstacles Update & Collision Check
      this.obstacles.update(this.currentSpeed, dt, this.distance);
      const collisionResult = this.obstacles.checkCollisions(this.player);

      if (collisionResult.collided && !this.powerups.isJetpackActive()) {
        if (this.settings.trainingMode) {
          this.ui.showToast('⚠️ WARNING: OBSTACLE HIT (TRAINING MODE)');
        } else {
          this.gameOver();
          return;
        }
      }

      // Player Frame Update
      this.player.update(dt, collisionResult.trainRoofY, this.powerups);

      // Environment & Camera Update
      this.environment.update(this.currentSpeed, dt, this.player);

      // Safe Coins Generator & Collection Pass
      this.coins.update(this.currentSpeed, dt, this.player, () => {
        this.coinCount++;
        this.score += 50;
        this.audio.playCoin();
        this.levelManager.recordCoin();
      });

      // Periodically trigger Safe Pattern Spawner
      if (Math.random() < 0.015) {
        this.coins.spawnSafePattern(this.obstacles, this.powerups, this.letters);
      }

      // Letters Update
      this.letters.update(
        this.currentSpeed, dt, this.player,
        (char) => {
          this.audio.playCoin();
          this.ui.showToast(`LETTER COLLECTED: ${char}!`);
        },
        (word) => {
          this.levelManager.runStats.wordCompleted = true;
          this.score += 2000;
          this.coinCount += 50;
          this.audio.playWordComplete();
          this.ui.showToast(`🎉 WORD COMPLETE: ${word}! +2000 SCORE`);
        }
      );

      // Score Multiplier calculation
      const mult = this.powerups.isMultiplierActive() ? 2.0 : 1.0;
      this.distance += this.currentSpeed * dt;
      this.score += this.currentSpeed * dt * 0.5 * mult;

      // Level Objective Completion Check
      const levelCheck = this.levelManager.checkLevelComplete(this.score, this.coinCount, this.distance);
      if (levelCheck.isComplete) {
        this.levelComplete();
        return;
      }

      // Update HUD
      this.ui.updateHUD(this.score, this.coinCount, this.distance, this.letters.getWordProgress());

    } else if (this.state === GAME_STATES.MAIN_MENU) {
      this.environment.update(6.0, dt);
      this.player.update(dt, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
