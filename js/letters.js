import * as THREE from 'three';
import { LANES } from './player.js';

/**
 * Creates a dynamic 2D canvas texture displaying the uppercase letter on a badge
 */
function createLetterTexture(char) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Background Violet fill
  ctx.fillStyle = '#8b5cf6';
  ctx.fillRect(0, 0, 256, 256);

  // Inner Cyan Border
  ctx.strokeStyle = '#3de0d0';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 236, 236);

  // Bold White Letter with Glow
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 150px "Chakra Petch", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 18;
  ctx.fillText(char, 128, 134);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class LetterItem {
  constructor(char, laneIndex, y, z) {
    this.char = char;
    this.laneIndex = laneIndex; // 0 = LEFT (-1.5), 1 = RIGHT (1.5)
    this.laneX = laneIndex === 0 ? LANES.LEFT : LANES.RIGHT;
    this.collected = false;

    this.mesh = this.createLetterMesh(char);
    this.mesh.position.set(this.laneX, y, z);
  }

  createLetterMesh(char) {
    const group = new THREE.Group();

    const letterTexture = createLetterTexture(char);
    const badgeMat = new THREE.MeshStandardMaterial({
      map: letterTexture,
      metalness: 0.5,
      roughness: 0.2,
      emissive: 0x6d28d9,
      emissiveIntensity: 0.3
    });

    const badgeGeo = new THREE.BoxGeometry(0.7, 0.7, 0.15);
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.castShadow = true;
    group.add(badge);

    const borderGeo = new THREE.BoxGeometry(0.75, 0.75, 0.05);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
    const border = new THREE.Mesh(borderGeo, borderMat);
    group.add(border);

    return group;
  }

  update(dt) {
    this.mesh.rotation.y += dt * 2.5;
  }
}

export class LetterManager {
  constructor(scene) {
    this.scene = scene;
    this.targetWord = 'SUBWAY';
    this.collectedFlags = [false, false, false, false, false, false];
    this.nextLetterIndex = 0;

    this.items = [];
    this.spawnDistanceTimer = 0;
  }

  setTargetWord(word) {
    this.targetWord = word.toUpperCase();
    this.collectedFlags = new Array(this.targetWord.length).fill(false);
    this.nextLetterIndex = 0;
  }

  getWordProgress() {
    return {
      word: this.targetWord,
      flags: this.collectedFlags,
      isComplete: this.collectedFlags.every(f => f === true)
    };
  }

  update(speed, dt, player, onCollectLetter, onWordComplete) {
    const moveZ = speed * dt;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.mesh.position.z += moveZ;
      item.update(dt);

      const playerPos = new THREE.Vector3(player.currentX, player.posY + 1.0, 0);
      const itemPos = item.mesh.position;

      if (playerPos.distanceTo(itemPos) < 1.3 && !item.collected) {
        item.collected = true;

        const charIdx = this.targetWord.indexOf(item.char);
        if (charIdx !== -1 && !this.collectedFlags[charIdx]) {
          this.collectedFlags[charIdx] = true;
          this.nextLetterIndex++;

          if (onCollectLetter) onCollectLetter(item.char);

          if (this.collectedFlags.every(f => f === true)) {
            if (onWordComplete) onWordComplete(this.targetWord);
          }
        }

        this.scene.remove(item.mesh);
        this.items.splice(i, 1);
        continue;
      }

      if (item.mesh.position.z > 15) {
        this.scene.remove(item.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  spawnNextLetter(laneIndex, y, z) {
    if (this.nextLetterIndex < this.targetWord.length) {
      const charToSpawn = this.targetWord[this.nextLetterIndex];
      const item = new LetterItem(charToSpawn, laneIndex, y, z);
      this.scene.add(item.mesh);
      this.items.push(item);
    }
  }

  reset() {
    this.items.forEach(item => this.scene.remove(item.mesh));
    this.items = [];
    this.collectedFlags = new Array(this.targetWord.length).fill(false);
    this.nextLetterIndex = 0;
    this.spawnDistanceTimer = 0;
  }
}
