import * as THREE from 'three';
import { LANES } from './player.js';

/**
 * Obstacles.js - Temple Run Hazards & Ancient Obstacle Generator
 * ==============================================================
 * Spawns Carved Stone Idols, Totem Pillars, Fallen Tree Hurdles, and Temple Archways
 * across 2 lanes (LEFT=-1.5, RIGHT=1.5) with safe distance guarantees.
 */

export class ObstacleItem {
  constructor(type, laneIndex, startZ) {
    this.type = type;
    this.laneIndex = laneIndex; // 0 = LEFT (-1.5), 1 = RIGHT (1.5)
    this.laneX = laneIndex === 0 ? LANES.LEFT : LANES.RIGHT;

    if (type === 'container' || type === 'express') {
      this.width = 1.6;
      this.height = 2.4;
      this.length = type === 'container' ? 12 : 9;
      this.isJumpable = true;
    } else if (type === 'barrier_high') {
      this.width = 1.6;
      this.height = 3.5;
      this.length = 0.8;
      this.isJumpable = false;
    } else if (type === 'hurdle_low') {
      this.width = 1.6;
      this.height = 1.0;
      this.length = 0.6;
      this.isJumpable = true;
    } else if (type === 'gantry_slide') {
      this.width = 1.6;
      this.height = 2.5;
      this.length = 0.8;
      this.isSlideable = true;
    }

    this.mesh = this.createObstacleMesh(type, this.width, this.height, this.length);
    this.mesh.position.set(this.laneX, 0, startZ);
  }

  createObstacleMesh(type, width, height, length) {
    const group = new THREE.Group();

    if (type === 'container' || type === 'express') {
      // Ancient Carved Stone Idol Monolith
      const isExpress = type === 'express';
      const stoneMat = new THREE.MeshStandardMaterial({
        color: isExpress ? 0x8b6508 : 0x384a3e,
        roughness: 0.75,
        metalness: 0.25
      });
      const goldRuneMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xd4af37,
        emissiveIntensity: 0.4,
        roughness: 0.3
      });

      // Main Stone Monolith Body
      const bodyGeo = new THREE.BoxGeometry(width, height - 0.4, length);
      const body = new THREE.Mesh(bodyGeo, stoneMat);
      body.position.y = (height - 0.4) / 2 + 0.3;
      body.castShadow = true;
      group.add(body);

      // Carved Temple Idol Head / Roof Crest
      const crestGeo = new THREE.BoxGeometry(width + 0.08, 0.35, length + 0.08);
      const crest = new THREE.Mesh(crestGeo, goldRuneMat);
      crest.position.y = height - 0.175;
      crest.castShadow = true;
      group.add(crest);

      // Idol Face Eye Inserts
      const eyeGeo = new THREE.BoxGeometry(0.3, 0.3, 0.1);
      const eyeL = new THREE.Mesh(eyeGeo, goldRuneMat);
      eyeL.position.set(-0.35, height * 0.6, length / 2 + 0.02);
      group.add(eyeL);

      const eyeR = new THREE.Mesh(eyeGeo, goldRuneMat);
      eyeR.position.set(0.35, height * 0.6, length / 2 + 0.02);
      group.add(eyeR);

    } else if (type === 'barrier_high') {
      // Carved Stone Totem Pillar
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2b382f, roughness: 0.8 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4 });

      const postGeo = new THREE.BoxGeometry(width, height, length);
      const post = new THREE.Mesh(postGeo, stoneMat);
      post.position.y = height / 2;
      post.castShadow = true;
      group.add(post);

      const bandGeo = new THREE.BoxGeometry(width + 0.04, 0.5, length + 0.04);
      const band = new THREE.Mesh(bandGeo, goldMat);
      band.position.y = height * 0.72;
      group.add(band);

    } else if (type === 'hurdle_low') {
      // Low Fallen Tree Root / Stone Slab Hurdle
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3219, roughness: 0.9 });
      const mossMat = new THREE.MeshStandardMaterial({ color: 0x1f3b25, roughness: 0.8 });

      const barGeo = new THREE.BoxGeometry(width, 0.3, length);
      const bar = new THREE.Mesh(barGeo, woodMat);
      bar.position.y = height - 0.15;
      bar.castShadow = true;
      group.add(bar);

      const mossTopGeo = new THREE.BoxGeometry(width + 0.02, 0.08, length + 0.02);
      const mossTop = new THREE.Mesh(mossTopGeo, mossMat);
      mossTop.position.y = height - 0.04;
      group.add(mossTop);

      const rootGeo = new THREE.CylinderGeometry(0.18, 0.22, height, 6);
      const rootL = new THREE.Mesh(rootGeo, woodMat);
      rootL.position.set(-width / 2 + 0.15, height / 2, 0);
      group.add(rootL);

      const rootR = new THREE.Mesh(rootGeo, woodMat);
      rootR.position.set(width / 2 - 0.15, height / 2, 0);
      group.add(rootR);

    } else if (type === 'gantry_slide') {
      // Ancient Stone Archway with Low Header
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x334438, roughness: 0.8 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0x735a13, emissiveIntensity: 0.5 });

      const archHeaderGeo = new THREE.BoxGeometry(width + 0.25, 1.2, length);
      const archHeader = new THREE.Mesh(archHeaderGeo, stoneMat);
      archHeader.position.y = height - 0.6;
      archHeader.castShadow = true;
      group.add(archHeader);

      const glyphGeo = new THREE.BoxGeometry(0.8, 0.6, length + 0.05);
      const glyph = new THREE.Mesh(glyphGeo, goldMat);
      glyph.position.y = height - 0.6;
      group.add(glyph);

      const pillarGeo = new THREE.CylinderGeometry(0.18, 0.22, height, 8);
      const pillarL = new THREE.Mesh(pillarGeo, stoneMat);
      pillarL.position.set(-width / 2 - 0.1, height / 2, 0);
      group.add(pillarL);

      const pillarR = new THREE.Mesh(pillarGeo, stoneMat);
      pillarR.position.set(width / 2 + 0.1, height / 2, 0);
      group.add(pillarR);
    }

    return group;
  }

  getAABB() {
    const center = new THREE.Vector3(
      this.laneX,
      this.height / 2,
      this.mesh.position.z
    );

    if (this.type === 'gantry_slide') {
      const halfSize = new THREE.Vector3(this.width / 2, 0.6, this.length / 2);
      center.y = this.height - 0.6;
      return new THREE.Box3(center.clone().sub(halfSize), center.clone().add(halfSize));
    }

    const halfSize = new THREE.Vector3(
      this.width / 2,
      this.height / 2,
      this.length / 2
    );

    return new THREE.Box3(
      center.clone().sub(halfSize),
      center.clone().add(halfSize)
    );
  }
}

export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];

    this.spawnDistanceTimer = 0;
    this.lastSpawnLane = -1;
    this.bciObstacleSpacing = 50.0;
  }

  setBciSpacing(spacing) {
    this.bciObstacleSpacing = spacing;
  }

  getOccupiedAABBs() {
    return this.obstacles.map(o => ({
      aabb: o.getAABB(),
      type: o.type,
      laneIndex: o.laneIndex,
      isTrain: o.type === 'container' || o.type === 'express',
      isHurdle: o.type === 'hurdle_low',
      height: o.height
    }));
  }

  update(speed, dt, totalDistance, densityMultiplier = 1.0) {
    const moveZ = speed * dt;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.mesh.position.z += moveZ;

      if (obs.mesh.position.z > 20) {
        this.scene.remove(obs.mesh);
        this.obstacles.splice(i, 1);
      }
    }

    this.spawnDistanceTimer += speed * dt;
    const interval = Math.max(35, (this.bciObstacleSpacing / densityMultiplier) - speed * 0.3);

    if (this.spawnDistanceTimer >= interval) {
      this.spawnDistanceTimer = 0;
      this.spawnFair2LaneWave(speed);
    }
  }

  /**
   * 2-Lane Fair Spawner: Leaves 1 lane 100% open or staggers obstacles safely
   */
  spawnFair2LaneWave(speed) {
    const spawnZ = -140;
    const types = ['container', 'express', 'barrier_high', 'hurdle_low', 'gantry_slide'];

    let chosenLane = Math.floor(Math.random() * 2);
    if (chosenLane === this.lastSpawnLane && Math.random() < 0.7) {
      chosenLane = 1 - chosenLane;
    }
    this.lastSpawnLane = chosenLane;

    const t1 = types[Math.floor(Math.random() * types.length)];
    const obs1 = new ObstacleItem(t1, chosenLane, spawnZ);
    this.scene.add(obs1.mesh);
    this.obstacles.push(obs1);

    // 35% chance to spawn staggered obstacle in opposite lane behind
    if (speed > 16 && Math.random() < 0.35) {
      const t2 = types[Math.floor(Math.random() * types.length)];
      const altLane = 1 - chosenLane;
      const staggeredZ = spawnZ - 30;

      const obs2 = new ObstacleItem(t2, altLane, staggeredZ);
      this.scene.add(obs2.mesh);
      this.obstacles.push(obs2);
    }
  }

  checkCollisions(player) {
    const playerBox = player.getAABB();
    let highestRoofY = 0;
    let collided = false;

    for (const obs of this.obstacles) {
      const obsBox = obs.getAABB();

      if (playerBox.intersectsBox(obsBox)) {
        if (obs.type === 'container' || obs.type === 'express') {
          if (player.posY >= obs.height - 0.25) {
            if (obs.height > highestRoofY) highestRoofY = obs.height;
          } else {
            collided = true;
          }
        } else if (obs.type === 'hurdle_low') {
          if (player.posY >= obs.height - 0.1) {
            // Safe jump
          } else {
            collided = true;
          }
        } else if (obs.type === 'gantry_slide') {
          if (player.isSliding) {
            // Safe slide under!
          } else {
            collided = true;
          }
        } else {
          collided = true;
        }
      }
    }

    return { collided, roofY: highestRoofY };
  }

  reset() {
    this.obstacles.forEach(o => this.scene.remove(o.mesh));
    this.obstacles = [];
    this.spawnDistanceTimer = 0;
  }
}
