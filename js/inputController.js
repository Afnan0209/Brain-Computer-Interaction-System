/**
 * InputController.js - BCI Input Abstraction Layer & Action Buffer
 * ================================================================
 * 
 * ARCHITECTURAL NOTE FOR BCI COLLEGE PROJECT:
 * --------------------------------------------
 * This module is the SOLE input entry point for the BCI Runner game.
 * Gameplay and player logic MUST NEVER add keydown listeners or read raw keyboard events.
 * All movement, jump, and slide commands pass strictly through this abstraction layer.
 * 
 * BCI SIGNAL MAPPING:
 * - Blink Spike (EOG / Eye Blink): Jump Command
 * - Concentration (Beta Waves): Switch Lane Toggle
 *     * If in Right Lane -> Moves to Left Lane
 *     * If in Left Lane  -> Moves to Right Lane
 * - Alpha Rise (Relaxation / Down Intent): Slide Command
 * 
 * PHYSICAL KEY SIMULATION:
 * - Blink / Jump: Space, 'b', 'B', ArrowUp, 'w', 'W'
 * - Concentration / Lane Toggle: 'c', 'C', Enter, Tab
 * - Left Steering: ArrowLeft, 'a', 'A'
 * - Right Steering: ArrowRight, 'd', 'D'
 * - Slide: ArrowDown, 's', 'S'
 */

export class InputController {
  constructor() {
    // Registered action callbacks
    this.onJump = null;
    this.onMoveLeft = null;
    this.onMoveRight = null;
    this.onSwitchLane = null;

    // Control flag: only active during PLAYING state
    this.enabled = false;

    // BCI Buffer & Debounce Settings
    this.actionBufferWindow = 1.5; // 1.5 seconds default buffer
    this.bufferedAction = null;
    this.bufferTimer = 0;

    // Debounce tracker for EEG prediction stability
    this.lastRawCommand = null;
    this.commandHistory = [];
    this.debounceThreshold = 2;

    // Bind event handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
    
    // Initialize listener
    this.setupKeyboardListeners();
  }

  /**
   * Set callbacks for game actions
   */
  bindActions({ onJump, onMoveLeft, onMoveRight, onSwitchLane }) {
    this.onJump = onJump;
    this.onMoveLeft = onMoveLeft;
    this.onMoveRight = onMoveRight;
    this.onSwitchLane = onSwitchLane;
  }

  /**
   * Enable or disable input listening
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.clearBuffer();
    }
  }

  /**
   * Update Action Buffer timer in frame loop
   */
  update(dt) {
    if (this.bufferedAction && this.enabled) {
      this.bufferTimer -= dt;
      if (this.bufferTimer <= 0) {
        this.clearBuffer();
      }
    }
  }

  clearBuffer() {
    this.bufferedAction = null;
    this.bufferTimer = 0;
  }

  /**
   * Set up DOM keyboard event listeners.
   */
  setupKeyboardListeners() {
    window.addEventListener('keydown', this.handleKeyDown, false);
    this.setupWebSocketBridge();
  }

  /**
   * Connect to optional Python BCI Bridge (ws://localhost:8765)
   */
  setupWebSocketBridge() {
    try {
      this.ws = new WebSocket('ws://localhost:8765');
      this.ws.onopen = () => {
        console.log('✅ Connected to BCI Python Bridge (ws://localhost:8765)');
      };
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const cmd = (data.action || data.command || '').toUpperCase();
          if (cmd === 'BLINK' || cmd === 'JUMP') {
            this.processBciCommand('JUMP');
          } else if (cmd === 'CONCENTRATION' || cmd === 'SWITCH' || cmd === 'SWITCH_LANE') {
            this.processBciCommand('CONCENTRATION');
          } else if (cmd === 'LEFT') {
            this.processBciCommand('LEFT');
          } else if (cmd === 'RIGHT') {
            this.processBciCommand('RIGHT');
          }
        } catch (e) {
          console.warn('Error parsing BCI WebSocket packet:', e);
        }
      };
      this.ws.onerror = () => {
        // Silent fallback: standard keyboard simulation mode active
      };
    } catch (err) {
      // WebSocket unavailable
    }
  }

  /**
   * Keyboard event handler translating physical keys to abstract BCI commands.
   */
  handleKeyDown(event) {
    // Only process input if active during gameplay
    if (!this.enabled) return;

    // Prevent default browser scrolling behavior for game controls
    const keysToPrevent = ['ArrowUp', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'];
    if (keysToPrevent.includes(event.key)) {
      event.preventDefault();
    }

    switch (event.key) {
      // 1. BLINK SPIKE -> JUMP
      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
      case 'b':
      case 'B':
        this.processBciCommand('JUMP');
        break;

      // 2. CONCENTRATION (BETA WAVES) -> TOGGLE LANE (RIGHT <-> LEFT)
      case 'c':
      case 'C':
      case 'Enter':
      case 'Tab':
        this.processBciCommand('CONCENTRATION');
        break;

      // 4. DIRECT LATERAL STEERING
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.processBciCommand('LEFT');
        break;

      case 'ArrowRight':
      case 'd':
      case 'D':
        this.processBciCommand('RIGHT');
        break;
    }
  }

  /**
   * Processes raw BCI command with debouncing & buffering
   */
  processBciCommand(cmd) {
    if (!this.enabled) return;
    this.commandHistory.push(cmd);
    if (this.commandHistory.length > 3) this.commandHistory.shift();

    const isStable = this.commandHistory.filter(c => c === cmd).length >= 1;

    if (isStable) {
      this.bufferedAction = cmd;
      this.bufferTimer = this.actionBufferWindow;
      this.executeAction(cmd);
    }
  }

  /**
   * Executes the decoded action
   */
  executeAction(cmd) {
    switch (cmd) {
      case 'JUMP':
        this.triggerJump();
        break;
      case 'CONCENTRATION':
        this.triggerConcentration();
        break;
      case 'LEFT':
        this.triggerMoveLeft();
        break;
      case 'RIGHT':
        this.triggerMoveRight();
        break;
    }
  }

  // =========================================================================
  // PUBLIC BCI COMMAND INTERFACE
  // External EEG decoders (e.g. via WebSockets or Python) call these directly.
  // =========================================================================

  /**
   * Triggers Blink -> Jump
   */
  triggerBlink() {
    this.triggerJump();
  }

  triggerJump() {
    if (this.onJump) this.onJump();
  }

  /**
   * Triggers Concentration (Beta Waves) -> Toggle between Left and Right lanes
   */
  triggerConcentration() {
    if (this.onSwitchLane) {
      this.onSwitchLane();
    } else if (this.onMoveRight) {
      this.onMoveRight();
    }
  }
  triggerMoveLeft() {
    if (this.onMoveLeft) this.onMoveLeft();
  }

  triggerMoveRight() {
    if (this.onMoveRight) this.onMoveRight();
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}
