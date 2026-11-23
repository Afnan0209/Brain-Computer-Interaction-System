import * as THREE from 'three';
import { LANES } from './player.js';

/**
 * Coins.js - Floor & Sky Rocket Coin Generator & Collection System
 * =================================================================
 * - Normal Running: Coins spawn strictly ON THE FLOOR (Y = 0.8).
 * - Rocket (Jetpack) Active: Coins elevate and spawn UP in the sky (Y = 6.0).
 * - Rocket Descent: Coins smoothly glide back down to the floor.
 */

export class Coin {
  constructor(laneIndex, y, z) {
    this.laneIndex = laneIndex; // 0 = LEFT (-1.5), 1 = RIGHT (1.5)
    this.laneX = laneIndex === 0 ? LANES.LEFT : LANES.RIGHT;
    this.collected = false;

    this.mesh = this.createCoinMesh();
    this.mesh.position.set(this.laneX, y, z);
  }

  createCoinMesh() {
    const group = new THREE.Group();

    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xb58900,
      emissiveIntensity: 0.3
    });

    const coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16);
    coinGeo.rotateX(Math.PI / 2);
    const coinMesh = new THREE.Mesh(coinGeo, coinMat);
    group.add(coinMesh);

    const rimMat = new THREE.MeshStandardMaterial({ color: 0xffe866, metalness: 1.0 });
    const rimGeo = new THREE.TorusGeometry(0.3, 0.03, 8, 16);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    group.add(rim);

    return group;
  }

  update(dt, isRocketActive, floorTargetY = 0.8) {
    this.mesh.rotation.y += dt * 3.5;

    // Rocket Active: Rise up to sky height (6.0)
    // Rocket Down / Inactive: Glide down to floor height (0.8)
    const targetY = isRocketActive ? 6.0 : floorTargetY;
    this.mesh.position.y += (targetY - this.mesh.position.y) * Math.min(dt * 5.0, 1.0);
  }

  getAABB() {
    const size = 0.7;
    return new THREE.Box3(
      this.mesh.position.clone().subScalar(size / 2),
      this.mesh.position.clone().addScalar(size / 2)
    );
  }
}

export class ParticleBurst {
  constructor(scene, position) {
    this.scene = scene;
    this.particles = [];
    this.alive = true;
    this.life = 0.35;

    const particleCount = 12;
    const geo = new THREE.SphereGeometry(0.06, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

    for (let i = 0; i < particleCount; i++) {
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(position);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5 + 1,
        (Math.random() - 0.5) * 6
      );

      this.scene.add(p);
      this.particles.push({ mesh: p, vel });
    }
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      this.particles.forEach(p => this.scene.remove(p.mesh));
      return;
    }

    const gravity = -15;
    this.particles.forEach(p => {
      p.vel.y += gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.multiplyScalar(0.92);
    });
  }
}

export class CoinManager {
  constructor(scene) {
    this.scene = scene;
    this.coins = [];
    this.bursts = [];
    this.spawnDistanceTimer = 0;
  }

  update(speed, dt, player, powerUpManager, obstacleManager, onCollect) {
    // Support backward-compatible 4-argument call
    if (typeof powerUpManager === 'function') {
      onCollect = powerUpManager;
      powerUpManager = null;
      obstacleManager = null;
    }

    const isRocketActive = powerUpManager ? powerUpManager.isJetpackActive() : false;
    const occupiedObstacles = obstacleManager ? obstacleManager.getOccupiedAABBs() : [];
    const moveZ = speed * dt;

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.mesh.position.z += moveZ;

      // Determine appropriate floor height if not in rocket mode
      let floorY = 0.8;
      if (!isRocketActive && occupiedObstacles.length > 0) {
        for (const obs of occupiedObstacles) {
          if (obs.laneIndex === coin.laneIndex) {
            const obsMinZ = obs.aabb.min.z;
            const obsMaxZ = obs.aabb.max.z;
            const coinZ = coin.mesh.position.z;
            if (coinZ >= obsMinZ - 1.0 && coinZ <= obsMaxZ + 1.0) {
              if (obs.isTrain) {
                floorY = obs.height + 0.8;
              }
            }
          }
        }
      }

      coin.update(dt, isRocketActive, floorY);

      // Collection hit detection
      const playerPos = new THREE.Vector3(player.currentX, player.posY + 0.8, 0);
      const coinPos = coin.mesh.position;

      const dist = playerPos.distanceTo(coinPos);
      if (dist < 1.4 && !coin.collected) {
        coin.collected = true;

        this.bursts.push(new ParticleBurst(this.scene, coinPos.clone()));

        this.scene.remove(coin.mesh);
        this.coins.splice(i, 1);

        if (onCollect) onCollect();
        continue;
      }

      if (coin.mesh.position.z > 15) {
        this.scene.remove(coin.mesh);
        this.coins.splice(i, 1);
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.update(dt);
      if (!burst.alive) {
        this.bursts.splice(i, 1);
      }
    }
  }

  /**
   * Safe Pattern Spawner:
   * - In Rocket mode: Spawns high sky coin formations at Y = 6.0
   * - In Normal mode: Spawns coins strictly on the floor at Y = 0.8 in safe lanes
   */
  spawnSafePattern(obstacleManager, powerUpManager, letterManager) {
    const isRocket = powerUpManager && powerUpManager.isJetpackActive();
    const spawnZ = -130;
    const occupiedObstacles = obstacleManager ? obstacleManager.getOccupiedAABBs() : [];

    if (isRocket) {
      // ROCKET MODE: Sky coins at Y = 6.0
      const coinCount = 7;
      const spacing = 2.4;
      const skyY = 6.0;

      const chosenLane = Math.random() < 0.5 ? 0 : 1;
      const isAlternating = Math.random() < 0.4;

      for (let i = 0; i < coinCount; i++) {
        const lane = isAlternating ? (i % 2 === 0 ? chosenLane : 1 - chosenLane) : chosenLane;
        const z = spawnZ - i * spacing;
        const proposedCoin = new Coin(lane, skyY, z);
        this.scene.add(proposedCoin.mesh);
        this.coins.push(proposedCoin);
      }
      return;
    }

    // NORMAL MODE: Coins strictly on the floor at Y = 0.8
    const occupiedLanes = new Set();
    occupiedObstacles.forEach(o => {
      const obsZ = o.aabb.min.z;
      if (Math.abs(obsZ - spawnZ) < 20) {
        occupiedLanes.add(o.laneIndex);
      }
    });

    const safeLanes = [0, 1].filter(l => !occupiedLanes.has(l));
    const chosenLane = safeLanes.length > 0
      ? safeLanes[Math.floor(Math.random() * safeLanes.length)]
      : Math.floor(Math.random() * 2);

    const coinCount = 5;
    const spacing = 2.5;
    const floorY = 0.8;

    // Spawn power-ups or letters on the floor in clear lanes
    if (Math.random() < 0.22 && powerUpManager) {
      const pTypes = ['JETPACK', 'SNEAKERS', 'MAGNET', 'MULTIPLIER'];
      const pType = pTypes[Math.floor(Math.random() * pTypes.length)];
      powerUpManager.spawnPowerUp(pType, chosenLane, floorY, spawnZ);
    } else if (Math.random() < 0.28 && letterManager) {
      letterManager.spawnNextLetter(chosenLane, floorY, spawnZ);
    }

    for (let i = 0; i < coinCount; i++) {
      const z = spawnZ - i * spacing;
      const proposedCoin = new Coin(chosenLane, floorY, z);
      const proposedBox = proposedCoin.getAABB();

      let isInsideObstacle = false;
      for (const obs of occupiedObstacles) {
        if (proposedBox.intersectsBox(obs.aabb)) {
          isInsideObstacle = true;
          break;
        }
      }

      if (!isInsideObstacle) {
        this.scene.add(proposedCoin.mesh);
        this.coins.push(proposedCoin);
      }
    }
  }

  reset() {
    this.coins.forEach(c => this.scene.remove(c.mesh));
    this.coins = [];
    this.bursts.forEach(b => b.particles.forEach(p => this.scene.remove(p.mesh)));
    this.bursts = [];
  }
}
