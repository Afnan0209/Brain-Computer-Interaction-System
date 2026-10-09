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
 * CURRENT IMPLEMENTATION (SIMULATION STAGE):
 * - Maps physical keyboard keys to abstract BCI signal commands:
 *     - ArrowUp / KeyW / Space  => Blink Spike (Jump Command)
 *     - ArrowDown / KeyS        => Alpha / Down Intent (Slide Command)
 *     - ArrowLeft / KeyA        => Beta + Left Intent (Move Left Command)
 *     - ArrowRight / KeyD       => Beta + Right Intent (Move Right Command)
 * 
 * BCI ACCESSIBILITY FEATURES INCLUDED:
 * ------------------------------------
 * 1. Action Buffer (1-2s window): Incoming BCI commands are stored and remain valid
 *    for a configurable period so users with paralysis/latency don't miss windows.
 * 2. Command Debouncing / Confirmation: Rapidly fluctuating predictions are filtered
 *    until a stable command is detected.
 */

export class InputController {
  constructor() {
    // Registered action callbacks
    this.onJump = null;
    this.onSlide = null;
    this.onMoveLeft = null;
    this.onMoveRight = null;

    // Control flag: only active during PLAYING state
    this.enabled = false;

    // BCI Buffer & Debounce Settings
    this.actionBufferWindow = 1.5; // 1.5 seconds default buffer
    this.bufferedAction = null;
    this.bufferTimer = 0;

    // Debounce tracker for EEG prediction stability
    this.lastRawCommand = null;
    this.commandHistory = [];
    this.debounceThreshold = 2; // Require 2 identical signals for confirmation if debouncing active

    // Bind event handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
    
    // Initialize listener
    this.setupKeyboardListeners();
  }

  /**
   * Set callbacks for game actions
   */
  bindActions({ onJump, onSlide, onMoveLeft, onMoveRight }) {
    this.onJump = onJump;
    this.onSlide = onSlide;
    this.onMoveLeft = onMoveLeft;
    this.onMoveRight = onMoveRight;
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
  }

  /**
   * Keyboard event handler translating physical keys to abstract BCI commands.
   */
  handleKeyDown(event) {
    // Only process input if active during gameplay
    if (!this.enabled) return;

    // Prevent default browser scrolling behavior for game controls
    const keysToPrevent = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    if (keysToPrevent.includes(event.key)) {
      event.preventDefault();
    }

    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
        this.processBciCommand('JUMP');
        break;

      case 'ArrowDown':
      case 's':
      case 'S':
        this.processBciCommand('SLIDE');
        break;

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
    // Command Debouncing filter
    this.commandHistory.push(cmd);
    if (this.commandHistory.length > 3) this.commandHistory.shift();

    // Check if prediction is stable
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
      case 'SLIDE':
        this.triggerSlide();
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
  // External EEG decoders (e.g. via WebSockets) will call these directly.
  // =========================================================================

  triggerJump() {
    if (this.onJump) this.onJump();
  }

  triggerSlide() {
    if (this.onSlide) this.onSlide();
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
