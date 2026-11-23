/**
 * Levels.js - Level Objectives, Missions Engine & Persistence
 * ==========================================================
 * Manages level progression (Level 1, 2, 3+), missions checklist tracking,
 * unlockable characters, high scores, and localStorage saving/loading.
 */

export const LEVEL_DEFINITIONS = [
  {
    level: 1,
    name: 'Level 1 - BCI Training Grounds',
    targetCoins: 200,
    targetDistance: 500,
    targetWord: 'BCI',
    baseSpeed: 11.0,
    description: 'Collect 200 coins, run 500m, and spell B-C-I'
  },
  {
    level: 2,
    name: 'Level 2 - Railway Express',
    targetCoins: 400,
    targetDistance: 1000,
    targetWord: 'SUBWAY',
    targetPowerups: 2,
    baseSpeed: 13.0,
    description: 'Collect 400 coins, run 1000m, spell S-U-B-W-A-Y, get 2 power-ups'
  },
  {
    level: 3,
    name: 'Level 3 - Cyber Metro Dash',
    targetCoins: 600,
    targetDistance: 1500,
    targetWord: 'RUNNER',
    targetPowerups: 3,
    targetScore: 12000,
    baseSpeed: 15.0,
    description: 'Collect 600 coins, run 1500m, spell R-U-N-N-E-R, score 12,000'
  }
];

export class LevelManager {
  constructor() {
    this.storageKey = 'bci_runner_save_v2';

    // Persisted User Data Defaults
    this.userData = {
      unlockedLevel: 1,
      currentLevel: 1,
      selectedCharacter: 0,
      highScore: 0,
      totalCoins: 0,
      completedMissions: {}
    };

    // Mission Progress for active run
    this.runStats = {
      coins: 0,
      distance: 0,
      score: 0,
      jumps: 0,
      slides: 0,
      laneChanges: 0,
      powerupsCollected: 0,
      lettersCollected: 0,
      wordCompleted: false
    };

    this.loadData();
  }

  loadData() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.userData = { ...this.userData, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('LocalStorage save load error:', e);
    }
  }

  saveData() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.userData));
    } catch (e) {
      console.warn('LocalStorage save write error:', e);
    }
  }

  getCurrentLevelDef() {
    const levelNum = this.userData.currentLevel;
    return LEVEL_DEFINITIONS.find(l => l.level === levelNum) || LEVEL_DEFINITIONS[0];
  }

  setCurrentLevel(levelNum) {
    if (levelNum <= this.userData.unlockedLevel) {
      this.userData.currentLevel = levelNum;
      this.saveData();
    }
  }

  setSelectedCharacter(charIndex) {
    this.userData.selectedCharacter = charIndex;
    this.saveData();
  }

  resetRunStats() {
    this.runStats = {
      coins: 0,
      distance: 0,
      score: 0,
      jumps: 0,
      slides: 0,
      laneChanges: 0,
      powerupsCollected: 0,
      lettersCollected: 0,
      wordCompleted: false
    };
  }

  recordJump() { this.runStats.jumps++; }
  recordSlide() { this.runStats.slides++; }
  recordLaneChange() { this.runStats.laneChanges++; }
  recordPowerup() { this.runStats.powerupsCollected++; }
  recordCoin() { this.runStats.coins++; }

  /**
   * Check if current level objectives are complete
   */
  checkLevelComplete(score, coins, distance) {
    const currentDef = this.getCurrentLevelDef();
    
    const coinsOk = coins >= currentDef.targetCoins;
    const distOk = distance >= currentDef.targetDistance;
    const wordOk = this.runStats.wordCompleted || !currentDef.targetWord;
    const powerupsOk = !currentDef.targetPowerups || this.runStats.powerupsCollected >= currentDef.targetPowerups;

    const isComplete = coinsOk && distOk && wordOk && powerupsOk;

    if (isComplete && this.userData.currentLevel === this.userData.unlockedLevel) {
      if (this.userData.unlockedLevel < LEVEL_DEFINITIONS.length) {
        this.userData.unlockedLevel++;
      }
    }

    // High score update
    if (score > this.userData.highScore) {
      this.userData.highScore = Math.floor(score);
    }

    this.userData.totalCoins += coins;
    this.saveData();

    return {
      isComplete,
      coinsOk,
      distOk,
      wordOk,
      powerupsOk,
      targetCoins: currentDef.targetCoins,
      targetDistance: currentDef.targetDistance
    };
  }
}
