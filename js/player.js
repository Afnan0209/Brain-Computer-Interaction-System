import * as THREE from 'three';

/**
 * Player.js - Human 3D Character Controller (2-Lane & Outfits)
 * ============================================================
 * Manages 2-lane smooth lateral interpolation (LEFT=-1.5, RIGHT=1.5),
 * jump & slide physics, 4 selectable character outfits, limb animations, and dynamic AABB bounds.
 */

export const LANES = {
  LEFT: -1.5,
  RIGHT: 1.5
};

export class Player {
  constructor(scene) {
    this.scene = scene;

    // 2-Lane State: 0 = LEFT (-1.5), 1 = RIGHT (1.5)
    this.currentLaneIndex = 0; // Default LEFT lane
    this.targetX = LANES.LEFT;
    this.currentX = LANES.LEFT;
    this.laneLerpSpeed = 16; // Smooth lateral transition speed

    // Physics & Vertical Position
    this.posY = 0;
    this.targetY = 0;
    this.velocityY = 0;
    this.gravity = -32.0;
    this.baseJumpForce = 12.0;
    this.jumpForce = 12.0;
    this.isAirborne = false;
    this.supportY = 0;

    // Slide state
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDuration = 0.65; // seconds

    // Current Selected Skin Index (0 to 3)
    this.selectedSkin = 0;

    // Bounding Box dimensions
    this.width = 0.8;
    this.normalHeight = 1.6;
    this.slideHeight = 0.7;
    this.height = this.normalHeight;
    this.depth = 0.8;

    // Animation ticker
    this.animTime = 0;

    // Root Group Mesh
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    this.rebuildCharacterMesh();
    this.reset();
  }

  setSkin(skinIndex) {
    this.selectedSkin = skinIndex;
    this.rebuildCharacterMesh();
  }

  rebuildCharacterMesh() {
    while (this.meshGroup.children.length > 0) {
      this.meshGroup.remove(this.meshGroup.children[0]);
    }

    this.mesh = this.createHumanMesh(this.selectedSkin);
    this.meshGroup.add(this.mesh);
  }

  createHumanMesh(skinIndex) {
    const group = new THREE.Group();

    const outfits = [
      { primary: 0x00f0ff, secondary: 0x1e293b, accent: 0xff0077, shoe: 0xffd700, headType: 'visor' },
      { primary: 0xef4444, secondary: 0x334155, accent: 0xffffff, shoe: 0xffffff, headType: 'cap' },
      { primary: 0xeab308, secondary: 0x0f172a, accent: 0x3b82f6, shoe: 0xeab308, headType: 'hair' },
      { primary: 0x8b5cf6, secondary: 0x475569, accent: 0x00f0ff, shoe: 0x8b5cf6, headType: 'helmet' }
    ];

    const palette = outfits[skinIndex % outfits.length];

    const mainMat = new THREE.MeshStandardMaterial({ color: palette.primary, roughness: 0.3, metalness: 0.5 });
    const secondaryMat = new THREE.MeshStandardMaterial({ color: palette.secondary, roughness: 0.6 });
    const accentMat = new THREE.MeshStandardMaterial({ color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.4 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: palette.shoe, roughness: 0.3, metalness: 0.7 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.8 });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.65, 0.75, 0.38);
    const torso = new THREE.Mesh(torsoGeo, mainMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    group.add(torso);

    const beltGeo = new THREE.BoxGeometry(0.67, 0.12, 0.4);
    const belt = new THREE.Mesh(beltGeo, secondaryMat);
    belt.position.y = 0.56;
    group.add(belt);

    const emblemGeo = new THREE.BoxGeometry(0.3, 0.3, 0.41);
    const emblem = new THREE.Mesh(emblemGeo, accentMat);
    emblem.position.set(0, 1.0, 0);
    group.add(emblem);

    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    if (palette.headType === 'visor' || palette.headType === 'helmet') {
      const visorGeo = new THREE.BoxGeometry(0.42, 0.18, 0.22);
      const visor = new THREE.Mesh(visorGeo, accentMat);
      visor.position.set(0, 1.58, 0.12);
      group.add(visor);
    } else if (palette.headType === 'cap') {
      const capGeo = new THREE.BoxGeometry(0.44, 0.15, 0.55);
      const cap = new THREE.Mesh(capGeo, mainMat);
      cap.position.set(0, 1.76, 0.05);
      group.add(cap);
    }

    // Limbs
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.42, 1.25, 0);
    const armGeo = new THREE.BoxGeometry(0.18, 0.55, 0.18);
    const leftArm = new THREE.Mesh(armGeo, mainMat);
    leftArm.position.y = -0.25;
    leftArm.castShadow = true;
    this.leftArmPivot.add(leftArm);
    group.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.42, 1.25, 0);
    const rightArm = new THREE.Mesh(armGeo, mainMat);
    rightArm.position.y = -0.25;
    rightArm.castShadow = true;
    this.rightArmPivot.add(rightArm);
    group.add(this.rightArmPivot);

    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.18, 0.5, 0);
    const legGeo = new THREE.BoxGeometry(0.22, 0.55, 0.22);
    const leftLeg = new THREE.Mesh(legGeo, secondaryMat);
    leftLeg.position.y = -0.25;
    leftLeg.castShadow = true;
    this.leftLegPivot.add(leftLeg);

    const shoeGeo = new THREE.BoxGeometry(0.24, 0.15, 0.35);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.52, 0.06);
    this.leftLegPivot.add(leftShoe);
    group.add(this.leftLegPivot);

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.18, 0.5, 0);
    const rightLeg = new THREE.Mesh(legGeo, secondaryMat);
    rightLeg.position.y = -0.25;
    rightLeg.castShadow = true;
    this.rightLegPivot.add(rightLeg);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.52, 0.06);
    this.rightLegPivot.add(rightShoe);
    group.add(this.rightLegPivot);

    return group;
  }

  reset() {
    this.currentLaneIndex = 0; // Starts in LEFT lane
    this.targetX = LANES.LEFT;
    this.currentX = LANES.LEFT;
    this.posY = 0;
    this.targetY = 0;
    this.velocityY = 0;
    this.isAirborne = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.supportY = 0;
    this.height = this.normalHeight;

    this.meshGroup.position.set(this.currentX, this.posY, 0);
    this.meshGroup.rotation.set(0, 0, 0);
  }

  /**
   * Action: Move Left (2 Lanes)
   */
  moveLeft() {
    if (this.currentLaneIndex > 0) {
      this.currentLaneIndex = 0;
      this.targetX = LANES.LEFT;
    }
  }

  /**
   * Action: Move Right (2 Lanes)
   */
  moveRight() {
    if (this.currentLaneIndex < 1) {
      this.currentLaneIndex = 1;
      this.targetX = LANES.RIGHT;
    }
  }

  jump() {
    if (!this.isAirborne && !this.isSliding) {
      this.velocityY = this.jumpForce;
      this.isAirborne = true;
      return true;
    }
    return false;
  }

  slide() {
    if (!this.isSliding && !this.isAirborne) {
      this.isSliding = true;
      this.slideTimer = this.slideDuration;
      this.height = this.slideHeight;
      return true;
    }
    return false;
  }

  update(dt, trainTopHeight = 0, powerUpManager = null) {
    this.currentX += (this.targetX - this.currentX) * Math.min(dt * this.laneLerpSpeed, 1.0);

    if (powerUpManager && powerUpManager.isSneakersActive()) {
      this.jumpForce = this.baseJumpForce * 1.4;
    } else {
      this.jumpForce = this.baseJumpForce;
    }

    if (powerUpManager && powerUpManager.isJetpackActive()) {
      this.supportY = 5.8;
      this.posY += (this.supportY - this.posY) * Math.min(dt * 6.0, 1.0);
      this.velocityY = 0;
      this.isAirborne = false;
    } else {
      this.supportY = trainTopHeight;

      if (this.isAirborne || this.posY > this.supportY) {
        this.velocityY += this.gravity * dt;
        this.posY += this.velocityY * dt;

        if (this.posY <= this.supportY) {
          this.posY = this.supportY;
          this.velocityY = 0;
          this.isAirborne = false;
        } else {
          this.isAirborne = true;
        }
      } else {
        this.posY = this.supportY;
        this.velocityY = 0;
        this.isAirborne = false;
      }
    }

    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        this.height = this.normalHeight;
      }
    }

    this.meshGroup.position.x = this.currentX;
    this.meshGroup.position.y = this.posY;

    this.animTime += dt * 16;

    if (this.isSliding) {
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, Math.PI / 2.5, 0.3);
      this.mesh.position.y = -0.3;
    } else if (this.isAirborne) {
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, 0.2);
      this.mesh.position.y = 0;
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, -0.8, 0.2);
      this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, -0.8, 0.2);
      this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, 0.6, 0.2);
      this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, -0.4, 0.2);
    } else {
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, 0.2);
      this.mesh.position.y = 0;
      const swing = Math.sin(this.animTime);
      this.leftArmPivot.rotation.x = swing * 0.7;
      this.rightArmPivot.rotation.x = -swing * 0.7;
      this.leftLegPivot.rotation.x = -swing * 0.8;
      this.rightLegPivot.rotation.x = swing * 0.8;
    }
  }

  getAABB() {
    const center = new THREE.Vector3(
      this.currentX,
      this.posY + this.height / 2,
      0
    );
    const halfSize = new THREE.Vector3(
      this.width / 2,
      this.height / 2,
      this.depth / 2
    );

    return new THREE.Box3(
      center.clone().sub(halfSize),
      center.clone().add(halfSize)
    );
  }
}
