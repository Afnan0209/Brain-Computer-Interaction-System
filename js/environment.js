import * as THREE from 'three';
import { LANES } from './player.js';

/**
 * Environment.js - Temple Run Jungle Ruins & Ancient Stone Pathway
 * ===============================================================
 * Generates ancient carved stone slab pathways, mossy stone walls, flaming torches,
 * stone temple pillars, dense jungle trees, atmospheric jungle lighting and fog.
 */

const SEGMENT_LENGTH = 30;
const TOTAL_SEGMENTS = 10;

export class Environment {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.segments = [];

    this.setupLighting();

    this.materials = {
      stoneSlab: new THREE.MeshStandardMaterial({ color: 0x475549, roughness: 0.8, metalness: 0.1 }),
      mossEdge: new THREE.MeshStandardMaterial({ color: 0x1f3825, roughness: 0.9 }),
      stoneWall: new THREE.MeshStandardMaterial({ color: 0x2e3d33, roughness: 0.85 }),
      runeGold: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4, metalness: 0.6 }),
      pillarMat: new THREE.MeshStandardMaterial({ color: 0x3b4c40, roughness: 0.8 }),
      torchWood: new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.9 }),
      torchFlame: new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff5500, emissiveIntensity: 1.2 }),
      jungleTrunk: new THREE.MeshStandardMaterial({ color: 0x362312, roughness: 0.9 }),
      jungleLeaves: new THREE.MeshStandardMaterial({ color: 0x133d24, roughness: 0.7 }),
      canopyLeaves: new THREE.MeshStandardMaterial({ color: 0x0e2e1b, roughness: 0.8 })
    };

    this.initSegments();
    this.setupCamera();
  }

  setupLighting() {
    // Deep warm ambient illumination from jungle canopy
    const ambientLight = new THREE.AmbientLight(0x6e8b75, 0.9);
    this.scene.add(ambientLight);

    // Warm golden sunlight piercing through the jungle foliage
    const sunLight = new THREE.DirectionalLight(0xfff3cd, 1.4);
    sunLight.position.set(25, 45, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    this.scene.add(sunLight);

    // Deep mysterious jungle sky & dense green fog
    this.scene.background = new THREE.Color(0x0a1c11);
    this.scene.fog = new THREE.FogExp2(0x0e2417, 0.008);
  }

  setupCamera() {
    this.camera.position.set(0, 3.8, 6.5);
    this.camera.rotation.x = -0.22;
  }

  initSegments() {
    for (let i = 0; i < TOTAL_SEGMENTS; i++) {
      const zPos = -i * SEGMENT_LENGTH + 15;
      const segment = this.createSegmentGroup();
      segment.position.z = zPos;
      this.scene.add(segment);
      this.segments.push(segment);
    }
  }

  createSegmentGroup() {
    const group = new THREE.Group();

    // 1. Carved Ancient Stone Pathway (Width = 6.0 across 2 lanes)
    const pathwayGeo = new THREE.BoxGeometry(6.0, 0.3, SEGMENT_LENGTH);
    const pathway = new THREE.Mesh(pathwayGeo, this.materials.stoneSlab);
    pathway.position.set(0, -0.15, -SEGMENT_LENGTH / 2);
    pathway.receiveShadow = true;
    group.add(pathway);

    // Center Runic Inset Line
    const runeGeo = new THREE.BoxGeometry(0.12, 0.05, SEGMENT_LENGTH);
    const runeLine = new THREE.Mesh(runeGeo, this.materials.runeGold);
    runeLine.position.set(0, 0.02, -SEGMENT_LENGTH / 2);
    group.add(runeLine);

    // Mossy Floor Outer Borders
    const mossGeo = new THREE.BoxGeometry(18, 0.2, SEGMENT_LENGTH);
    const mossL = new THREE.Mesh(mossGeo, this.materials.mossEdge);
    mossL.position.set(-12.0, -0.2, -SEGMENT_LENGTH / 2);
    group.add(mossL);

    const mossR = new THREE.Mesh(mossGeo, this.materials.mossEdge);
    mossR.position.set(12.0, -0.2, -SEGMENT_LENGTH / 2);
    group.add(mossR);

    // 2. Carved Stone Retaining Walls on Path Margins
    const wallGeo = new THREE.BoxGeometry(0.5, 0.8, SEGMENT_LENGTH);
    const wallL = new THREE.Mesh(wallGeo, this.materials.stoneWall);
    wallL.position.set(-3.25, 0.4, -SEGMENT_LENGTH / 2);
    wallL.castShadow = true;
    wallL.receiveShadow = true;
    group.add(wallL);

    const wallR = new THREE.Mesh(wallGeo, this.materials.stoneWall);
    wallR.position.set(3.25, 0.4, -SEGMENT_LENGTH / 2);
    wallR.castShadow = true;
    wallR.receiveShadow = true;
    group.add(wallR);

    // 3. Side Scenery: Pillars, Torches & Jungle Foliage
    this.addSideScenery(group);

    return group;
  }

  addSideScenery(group) {
    // Add Ancient Stone Pillars along margins
    for (let z = -5; z >= -SEGMENT_LENGTH; z -= 15) {
      const pillarL = this.createTemplePillar();
      pillarL.position.set(-4.2, 0, z);
      group.add(pillarL);

      const pillarR = this.createTemplePillar();
      pillarR.position.set(4.2, 0, z);
      group.add(pillarR);

      // Add Flaming Torch
      const torchL = this.createTorch();
      torchL.position.set(-3.6, 2.2, z);
      group.add(torchL);

      const torchR = this.createTorch();
      torchR.position.set(3.6, 2.2, z);
      group.add(torchR);
    }

    // Add Dense Jungle Trees
    for (let i = 0; i < 3; i++) {
      const z = -Math.random() * SEGMENT_LENGTH;
      const treeL = this.createJungleTree();
      treeL.position.set(-7.0 - Math.random() * 5, 0, z);
      group.add(treeL);

      const treeR = this.createJungleTree();
      treeR.position.set(7.0 + Math.random() * 5, 0, z);
      group.add(treeR);
    }
  }

  createTemplePillar() {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(0.9, 0.5, 0.9);
    const base = new THREE.Mesh(baseGeo, this.materials.stoneWall);
    base.position.y = 0.25;
    group.add(base);

    const shaftGeo = new THREE.CylinderGeometry(0.35, 0.4, 4.0, 8);
    const shaft = new THREE.Mesh(shaftGeo, this.materials.pillarMat);
    shaft.position.y = 2.25;
    shaft.castShadow = true;
    group.add(shaft);

    const capGeo = new THREE.BoxGeometry(0.9, 0.4, 0.9);
    const cap = new THREE.Mesh(capGeo, this.materials.stoneWall);
    cap.position.y = 4.45;
    group.add(cap);

    return group;
  }

  createTorch() {
    const group = new THREE.Group();
    const holderGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
    const holder = new THREE.Mesh(holderGeo, this.materials.torchWood);
    holder.rotation.z = Math.PI * 0.15;
    holder.position.y = 0.6;
    group.add(holder);

    const flameGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const flame = new THREE.Mesh(flameGeo, this.materials.torchFlame);
    flame.position.set(0.15, 1.2, 0);
    group.add(flame);

    return group;
  }

  createJungleTree() {
    const group = new THREE.Group();
    const height = 8 + Math.random() * 6;

    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, height, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.materials.jungleTrunk);
    trunk.position.y = height / 2;
    trunk.castShadow = true;
    group.add(trunk);

    const canopyCount = 3;
    for (let i = 0; i < canopyCount; i++) {
      const radius = 2.5 - i * 0.4;
      const canopyGeo = new THREE.ConeGeometry(radius, 3.5, 6);
      const canopyMat = i % 2 === 0 ? this.materials.jungleLeaves : this.materials.canopyLeaves;
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.y = height - 1.0 + i * 2.0;
      canopy.castShadow = true;
      group.add(canopy);
    }

    return group;
  }

  update(speed, dt, player = null) {
    const moveZ = speed * dt;

    this.segments.forEach(segment => {
      segment.position.z += moveZ;

      if (segment.position.z > 25) {
        segment.position.z -= TOTAL_SEGMENTS * SEGMENT_LENGTH;
      }
    });

    if (player) {
      const targetCamX = player.currentX * 0.4;
      const targetCamY = 3.8 + player.posY * 0.5;

      this.camera.position.x += (targetCamX - this.camera.position.x) * Math.min(dt * 8.0, 1.0);
      this.camera.position.y += (targetCamY - this.camera.position.y) * Math.min(dt * 8.0, 1.0);
    }
  }

  reset() {
    for (let i = 0; i < TOTAL_SEGMENTS; i++) {
      this.segments[i].position.z = -i * SEGMENT_LENGTH + 15;
    }
  }
}
