import * as THREE from 'three';
import { LANES } from './player.js';

export const POWERUP_TYPES = {
  JETPACK: 'JETPACK',
  SNEAKERS: 'SNEAKERS',
  MAGNET: 'MAGNET',
  MULTIPLIER: 'MULTIPLIER'
};

export class PowerUpItem {
  constructor(type, laneIndex, y, z) {
    this.type = type;
    this.laneIndex = laneIndex; // 0 = LEFT (-1.5), 1 = RIGHT (1.5)
    this.laneX = laneIndex === 0 ? LANES.LEFT : LANES.RIGHT;
    this.collected = false;

    this.mesh = this.createPowerUpMesh(type);
    this.mesh.position.set(this.laneX, y, z);
  }

  createPowerUpMesh(type) {
    const group = new THREE.Group();
    let matColor, coreGeo;

    switch (type) {
      case POWERUP_TYPES.JETPACK:
        matColor = 0xef4444;
        coreGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.7, 12);
        break;
      case POWERUP_TYPES.SNEAKERS:
        matColor = 0x10b981;
        coreGeo = new THREE.BoxGeometry(0.5, 0.3, 0.6);
        break;
      case POWERUP_TYPES.MAGNET:
        matColor = 0x3b82f6;
        coreGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
        break;
      case POWERUP_TYPES.MULTIPLIER:
        matColor = 0xf59e0b;
        coreGeo = new THREE.OctahedronGeometry(0.4, 0);
        break;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: matColor,
      metalness: 0.7,
      roughness: 0.2,
      emissive: matColor,
      emissiveIntensity: 0.4
    });

    const mesh = new THREE.Mesh(coreGeo, mat);
    mesh.castShadow = true;
    group.add(mesh);

    const ringGeo = new THREE.TorusGeometry(0.55, 0.04, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    return group;
  }

  update(dt) {
    this.mesh.rotation.y += dt * 3.0;
    this.mesh.position.y += Math.sin(Date.now() * 0.005) * 0.003;
  }
}

export class PowerUpManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];

    this.active = {
      [POWERUP_TYPES.JETPACK]: 0,
      [POWERUP_TYPES.SNEAKERS]: 0,
      [POWERUP_TYPES.MAGNET]: 0,
      [POWERUP_TYPES.MULTIPLIER]: 0
    };

    this.flameParticles = [];
  }

  activate(type) {
    const durations = {
      [POWERUP_TYPES.JETPACK]: 8.0,
      [POWERUP_TYPES.SNEAKERS]: 10.0,
      [POWERUP_TYPES.MAGNET]: 10.0,
      [POWERUP_TYPES.MULTIPLIER]: 12.0
    };

    this.active[type] = durations[type];
  }

  isJetpackActive() { return this.active[POWERUP_TYPES.JETPACK] > 0; }
  isSneakersActive() { return this.active[POWERUP_TYPES.SNEAKERS] > 0; }
  isMagnetActive() { return this.active[POWERUP_TYPES.MAGNET] > 0; }
  isMultiplierActive() { return this.active[POWERUP_TYPES.MULTIPLIER] > 0; }

  update(speed, dt, player, coinManager, onPickup) {
    const moveZ = speed * dt;

    Object.keys(this.active).forEach(type => {
      if (this.active[type] > 0) {
        this.active[type] -= dt;
        if (this.active[type] <= 0) {
          this.active[type] = 0;
        }
      }
    });

    if (this.isJetpackActive()) {
      player.targetY = 5.8;
      this.createJetpackFlames(player.meshGroup.position);
    } else {
      player.targetY = 0;
    }

    if (this.isMagnetActive()) {
      const playerPos = new THREE.Vector3(player.currentX, player.posY + 1.0, 0);
      const magnetRadius = 14.0;

      coinManager.coins.forEach(coin => {
        const coinPos = coin.mesh.position;
        const dist = playerPos.distanceTo(coinPos);
        if (dist < magnetRadius && !coin.collected) {
          coinPos.lerp(playerPos, dt * 12.0);
        }
      });
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.mesh.position.z += moveZ;
      item.update(dt);

      const playerPos = new THREE.Vector3(player.currentX, player.posY + 1.0, 0);
      const itemPos = item.mesh.position;

      if (playerPos.distanceTo(itemPos) < 1.4 && !item.collected) {
        item.collected = true;
        this.activate(item.type);
        this.scene.remove(item.mesh);
        this.items.splice(i, 1);

        if (onPickup) onPickup(item.type);
        continue;
      }

      if (item.mesh.position.z > 15) {
        this.scene.remove(item.mesh);
        this.items.splice(i, 1);
      }
    }

    this.updateFlames(dt);
  }

  createJetpackFlames(pos) {
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
    const p = new THREE.Mesh(geo, mat);

    p.position.set(
      pos.x + (Math.random() - 0.5) * 0.4,
      pos.y + 0.8,
      pos.z + 0.4
    );

    this.scene.add(p);
    this.flameParticles.push({ mesh: p, life: 0.2 });
  }

  updateFlames(dt) {
    for (let i = this.flameParticles.length - 1; i >= 0; i--) {
      const p = this.flameParticles[i];
      p.life -= dt;
      p.mesh.position.y -= dt * 6;
      p.mesh.scale.multiplyScalar(0.9);

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.flameParticles.splice(i, 1);
      }
    }
  }

  spawnPowerUp(type, laneIndex, y, z) {
    const item = new PowerUpItem(type, laneIndex, y, z);
    this.scene.add(item.mesh);
    this.items.push(item);
  }

  reset() {
    this.items.forEach(item => this.scene.remove(item.mesh));
    this.items = [];
    this.flameParticles.forEach(p => this.scene.remove(p.mesh));
    this.flameParticles = [];

    Object.keys(this.active).forEach(type => {
      this.active[type] = 0;
    });
  }
}
