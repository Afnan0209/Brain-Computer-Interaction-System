const POWERUPS = {
  JETPACK: { icon: '🚀', label: 'Jetpack', time: 8 },
  SNEAKERS: { icon: '👟', label: 'Super jump', time: 10 },
  MAGNET: { icon: '🧲', label: 'Coin magnet', time: 10 },
  MULTIPLIER: { icon: '✖2', label: 'Double score', time: 12 }
};

const COMMAND_LABELS = { JUMP: '↑ Jump', SLIDE: '↓ Slide', LEFT: '← Left', RIGHT: '→ Right' };

export class UIManager {
  constructor(handlers) {
    this.handlers = handlers;
    const $ = (id) => document.getElementById(id);

    this.screens = {
      mainMenu: $('screen-main-menu'),
      charSelect: $('screen-char-select'),
      levelSelect: $('screen-level-select'),
      settings: $('screen-settings'),
      hud: $('screen-hud'),
      pause: $('screen-pause'),
      levelComplete: $('screen-level-complete'),
      gameOver: $('screen-game-over')
    };

    this.menuHighScore = $('menu-high-score');
    this.menuTotalCoins = $('menu-total-coins');
    this.hudScore = $('hud-score');
    this.hudCoins = $('hud-coins');
    this.hudDistance = $('hud-distance');
    this.hudWordContainer = $('hud-word-letters');
    this.hudToast = $('hud-toast');
    this.hudCmd = $('hud-cmd');
    this.hudPowerups = $('hud-powerups');
    this.muteBtn = $('btn-mute');
    this.finalScore = $('final-score');
    this.finalCoins = $('final-coins');
    this.finalDistance = $('final-distance');

    this.selectedSkinIndex = 0;
    this.wordKey = '';
    this.toastTimer = null;
    this.cmdTimer = null;
    this.puChips = {};

    this.buildPowerupChips();
    this.bindEvents();
  }

  showScreen(name) {
    Object.entries(this.screens).forEach(([key, el]) => {
      if (el) el.classList.toggle('active', key === name);
    });
  }

  setLevels(unlockedCount) {
    const levelCards = document.querySelectorAll('.level-card');
    levelCards.forEach(card => {
      const lvl = parseInt(card.dataset.level, 10);
      const isUnlocked = lvl <= unlockedCount;
      card.classList.toggle('locked', !isUnlocked);
      const badge = card.querySelector('.lvl-badge');
      if (isUnlocked) {
        card.removeAttribute('aria-disabled');
        if (badge) badge.textContent = `Level ${lvl}`;
      } else {
        card.setAttribute('aria-disabled', 'true');
        if (badge) badge.textContent = `Level ${lvl} · locked`;
      }
    });
  }

  buildPowerupChips() {
    Object.entries(POWERUPS).forEach(([type, meta]) => {
      const chip = document.createElement('div');
      chip.className = 'pu-chip';
      chip.hidden = true;
      chip.innerHTML = `<span>${meta.icon}</span><span>${meta.label}</span><div class="pu-bar"><i></i></div>`;
      this.hudPowerups.appendChild(chip);
      this.puChips[type] = { el: chip, bar: chip.querySelector('i') };
    });
  }

  bindEvents() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    const h = this.handlers;

    on('btn-play', () => h.onPlay());
    on('btn-char-select', () => this.showScreen('charSelect'));
    on('btn-level-select', () => this.showScreen('levelSelect'));
    on('btn-settings', () => this.showScreen('settings'));

    const charCards = document.querySelectorAll('.char-card');
    charCards.forEach(card => card.addEventListener('click', () => {
      charCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      this.selectedSkinIndex = parseInt(card.dataset.skin, 10);
    }));

    on('btn-char-confirm', () => {
      h.onSelectCharacter(this.selectedSkinIndex);
      this.showScreen('mainMenu');
    });

    const levelCards = document.querySelectorAll('.level-card');
    levelCards.forEach(card => card.addEventListener('click', () => {
      if (card.classList.contains('locked')) return;
      levelCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (h.onSelectLevel) h.onSelectLevel(parseInt(card.dataset.level, 10));
      this.showScreen('mainMenu');
    }));

    on('btn-char-back', () => this.showScreen('mainMenu'));
    on('btn-level-back', () => this.showScreen('mainMenu'));
    on('btn-settings-back', () => this.showScreen('mainMenu'));

    on('btn-settings-save', () => {
      h.onSaveSettings({
        speedSetting: document.getElementById('setting-speed').value,
        responseWindow: document.getElementById('setting-window').value,
        trainingMode: document.getElementById('setting-training').checked
      });
      this.showScreen('mainMenu');
    });

    on('btn-pause', () => h.onPause());
    on('btn-pause-resume', () => h.onResume());
    on('btn-pause-restart', () => h.onRestart());
    on('btn-pause-main', () => h.onMainMenu());
    on('btn-next-level', () => h.onNextLevel());
    on('btn-complete-main', () => h.onMainMenu());
    on('btn-restart', () => h.onRestart());
    on('btn-over-char', () => this.showScreen('charSelect'));
    on('btn-over-main', () => h.onMainMenu());

    on('btn-mute', () => {
      if (h.onToggleMute) this.setSoundOn(h.onToggleMute());
    });

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
      if (this.screens.hud.classList.contains('active')) h.onPause();
      else if (this.screens.pause.classList.contains('active')) h.onResume();
    });
  }

  setSoundOn(isOn) {
    this.muteBtn.textContent = isOn ? '🔊' : '🔇';
  }

  updateMenuStats(highScore, totalCoins) {
    if (this.menuHighScore) this.menuHighScore.textContent = highScore;
    if (this.menuTotalCoins) this.menuTotalCoins.textContent = totalCoins;
  }

  updateHUD(score, coins, distance, wordProgress) {
    this.hudScore.textContent = Math.floor(score);
    this.hudCoins.textContent = coins;
    this.hudDistance.textContent = `${Math.floor(distance)} m`;

    if (!wordProgress) return;
    const key = wordProgress.word + wordProgress.flags.map(f => (f ? 1 : 0)).join('');
    if (key === this.wordKey) return;
    this.wordKey = key;
    this.hudWordContainer.innerHTML = '';
    wordProgress.word.split('').forEach((char, i) => {
      const slot = document.createElement('span');
      slot.className = 'letter-slot' + (wordProgress.flags[i] ? ' collected' : '');
      slot.textContent = char;
      this.hudWordContainer.appendChild(slot);
    });
  }

  updatePowerups(active) {
    Object.entries(this.puChips).forEach(([type, chip]) => {
      const left = active[type] || 0;
      chip.el.hidden = left <= 0;
      if (left > 0) chip.bar.style.width = `${Math.min(100, (left / POWERUPS[type].time) * 100)}%`;
    });
  }

  flashCommand(cmd) {
    this.hudCmd.textContent = COMMAND_LABELS[cmd] || cmd;
    this.hudCmd.classList.add('show');
    clearTimeout(this.cmdTimer);
    this.cmdTimer = setTimeout(() => this.hudCmd.classList.remove('show'), 350);
  }

  showToast(message) {
    this.hudToast.textContent = message;
    this.hudToast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.hudToast.classList.remove('show'), 2200);
  }

  showGameOver(score, coins, distance, isNewHighScore) {
    this.finalScore.textContent = Math.floor(score);
    this.finalCoins.textContent = coins;
    this.finalDistance.textContent = `${Math.floor(distance)} m`;
    document.getElementById('high-score-banner').style.display = isNewHighScore ? 'inline-block' : 'none';
    this.showScreen('gameOver');
  }

  showLevelComplete() {
    this.showScreen('levelComplete');
  }
}
