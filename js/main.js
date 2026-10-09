import { Game } from './game.js?v=2026';

/**
 * Main.js - Application Entry Point (Temple Explorer Edition)
 * ============================================================
 * Initializes the BCI Runner Game when DOM content is loaded.
 */

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game('game-container');

  // Make game instance available for debugging in developer console
  window.bciGame = game;
});
