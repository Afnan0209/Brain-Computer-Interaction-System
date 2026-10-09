import * as THREE from 'three';
import { LANES } from './player.js';

/**
 * Coins.js - Safe 2-Lane Coin Generator & Collection System
 * ==========================================================
 * Spawns collectible 3D gold coins using a Safe Spawning System across 2 lanes.
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

  update(dt) {
    this.mesh.rotation.y += dt * 3.5;
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

  update(speed, dt, player, onCollect) {
    const moveZ = speed * dt;

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.mesh.position.z += moveZ;
      coin.update(dt);

      const playerPos = new THREE.Vector3(player.currentX, player.posY + 0.8, 0);
      const coinPos = coin.mesh.position;

      const dist = playerPos.distanceTo(coinPos);
      if (dist < 1.2 && !coin.collected) {
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
   * SAFE SPAWNING ENGINE FOR 2 LANES
   */
  spawnSafePattern(obstacleManager, powerUpManager, letterManager) {
    const spawnZ = -130;
    const occupiedObstacles = obstacleManager.getOccupiedAABBs();

    const occupiedLanes = new Set();
    occupiedObstacles.forEach(o => {
      const obsZ = o.aabb.min.z;
      if (Math.abs(obsZ - spawnZ) < 15) {
        occupiedLanes.add(o.laneIndex);
      }
    });

    const safeLanes = [0, 1].filter(l => !occupiedLanes.has(l));
    const chosenLane = safeLanes.length > 0
      ? safeLanes[Math.floor(Math.random() * safeLanes.length)]
      : Math.floor(Math.random() * 2);

    const coinCount = 5;
    const spacing = 2.5;

    const trainInLane = occupiedObstacles.find(o => o.laneIndex === chosenLane && o.isTrain);
    const hurdleInLane = occupiedObstacles.find(o => o.laneIndex === chosenLane && o.isHurdle);

    let patternType = 'line';
    let baseHeight = 0.8;

    if (trainInLane) {
      patternType = 'roof';
      baseHeight = trainInLane.height + 0.8;
    } else if (hurdleInLane) {
      patternType = 'arch';
    }

    if (Math.random() < 0.25) {
      const pTypes = ['JETPACK', 'SNEAKERS', 'MAGNET', 'MULTIPLIER'];
      const pType = pTypes[Math.floor(Math.random() * pTypes.length)];
      powerUpManager.spawnPowerUp(pType, chosenLane, baseHeight, spawnZ);
    } else if (Math.random() < 0.3) {
      letterManager.spawnNextLetter(chosenLane, baseHeight, spawnZ);
    }

    for (let i = 0; i < coinCount; i++) {
      const z = spawnZ - i * spacing;
      let y = baseHeight;

      if (patternType === 'arch') {
        y = 0.8 + Math.sin((i / (coinCount - 1)) * Math.PI) * 2.2;
      }

      const proposedCoin = new Coin(chosenLane, y, z);
      const proposedBox = proposedCoin.getAABB();

      let isInsideObstacle = false;
      for (const obs of occupiedObstacles) {
        if (proposedBox.intersectsBox(obs.aabb) && patternType !== 'roof') {
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
