import { mountExternalModel } from './modelAssets.js';

function createMonsterVariants(THREE) {
  return {
    runner: {
      label: 'Runner',
      healthScale: 0.78,
      speedScale: 1.32,
      damageScale: 0.86,
      scale: 0.92,
      color: new THREE.Color(0x5fa392),
      emissive: new THREE.Color(0x071f1a),
    },
    guard: {
      label: 'Guard',
      healthScale: 1,
      speedScale: 1,
      damageScale: 1,
      scale: 1,
      color: new THREE.Color(0x6ca35f),
      emissive: new THREE.Color(0x081908),
    },
    brute: {
      label: 'Brute',
      healthScale: 1.35,
      speedScale: 0.82,
      damageScale: 1.32,
      scale: 1.12,
      color: new THREE.Color(0x95a45d),
      emissive: new THREE.Color(0x1d1908),
    },
  };
}

export function createWorld({ scene, THREE }) {
  if (!scene || !THREE) {
    throw new Error('createWorld requires scene and THREE.');
  }

  const state = {
    score: 0,
    wave: 1,
    waveStatus: 'waiting',
    nextWaveAt: 0,
    nextWaveIn: 0,
    hostilesDefeatedThisWave: 0,
    waveHostilesTotal: 0,
    hits: 0,
    totalTargets: 0,
    monsterTotal: 0,
    monstersAlive: 0,
    clearedTargets: 0,
    progress: 0,
    activeTargets: 0,
    inactiveTargets: 0,
    combo: 0,
    comboTimer: 0,
    lastHitId: null,
    lastHitTime: 0,
    elapsed: 0,
    status: 'ready',
    groundY: 0,
    bounds: {
      minX: -13.8,
      maxX: 13.8,
      minZ: -61,
      maxZ: 9,
    },
    playerSpawn: [0, 0, 8],
    player: {
      position: null,
      health: 100,
      pointerLocked: false,
      hasEngaged: false,
    },
  };

  const targets = [];
  const effects = [];
  let pendingPlayerDamage = 0;
  const MONSTER_VARIANTS = createMonsterVariants(THREE);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const circleGeometry = new THREE.CircleGeometry(0.5, 48);
  const torusGeometry = new THREE.TorusGeometry(0.5, 0.018, 8, 48);

  const materials = createMaterials(THREE);
  const worldRoot = new THREE.Group();
  worldRoot.name = 'training-world';
  scene.add(worldRoot);

  buildLighting(scene, THREE);
  buildRange(worldRoot, THREE, {
    boxGeometry,
    planeGeometry,
    materials,
  });

  addTarget({
    id: 'lane-a-close',
    position: new THREE.Vector3(-6, 0, -18),
    yaw: 0,
    scoreValue: 100,
    respawnDelay: 1.25,
  });
  addTarget({
    id: 'lane-b-close',
    position: new THREE.Vector3(0, 0, -22),
    yaw: 0,
    scoreValue: 100,
    respawnDelay: 1.35,
  });
  addTarget({
    id: 'lane-c-close',
    position: new THREE.Vector3(6, 0, -18),
    yaw: 0,
    scoreValue: 100,
    respawnDelay: 1.25,
  });
  addTarget({
    id: 'catwalk-left',
    position: new THREE.Vector3(-9.5, 2.15, -35),
    yaw: 0.08,
    scoreValue: 150,
    respawnDelay: 1.8,
    moveAxis: 'x',
    moveAmount: 1.25,
    moveSpeed: 0.85,
  });
  addTarget({
    id: 'loading-bay',
    position: new THREE.Vector3(3.5, 0, -39),
    yaw: -0.08,
    scoreValue: 150,
    respawnDelay: 1.75,
  });
  addTarget({
    id: 'far-center',
    position: new THREE.Vector3(0, 0.35, -54),
    yaw: 0,
    scoreValue: 200,
    respawnDelay: 2.1,
    moveAxis: 'x',
    moveAmount: 2.4,
    moveSpeed: 0.55,
  });

  addMonster({
    id: 'cactoro-left',
    variant: 'brute',
    position: new THREE.Vector3(-10.8, 0, -47),
    patrolRadius: 4.2,
    speed: 2.2,
    health: 190,
    scoreValue: 260,
  });
  addMonster({
    id: 'cactoro-mid',
    variant: 'guard',
    position: new THREE.Vector3(8.8, 0, -42),
    patrolRadius: 3.4,
    speed: 2.6,
    health: 155,
    scoreValue: 220,
  });
  addMonster({
    id: 'cactoro-fast',
    variant: 'runner',
    position: new THREE.Vector3(0, 0, -33),
    patrolRadius: 5.4,
    speed: 3.1,
    health: 120,
    scoreValue: 180,
  });

  state.totalTargets = targets.length;
  updateTargetCounts();

  function addTarget(options) {
    const target = createTarget(THREE, {
      boxGeometry,
      circleGeometry,
      materials,
      ...options,
    });

    target.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData.target = target;
      }
    });

    worldRoot.add(target.group);
    targets.push(target);
    return target;
  }

  function addMonster(options) {
    const monster = createMonster(THREE, {
      boxGeometry,
      materials,
      monsterVariants: MONSTER_VARIANTS,
      ...options,
    });

    monster.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData.target = monster;
      }
    });

    worldRoot.add(monster.group);
    targets.push(monster);
    return monster;
  }

  function registerHit(targetLike, hitInfo = {}) {
    const target = resolveTarget(targetLike);

    if (!target || !target.active) {
      return {
        hit: false,
        target,
        score: state.score,
      };
    }

    if (target.kind === 'monster') {
      return registerMonsterHit(target, hitInfo);
    }

    target.active = false;
    target.cooldown = target.respawnDelay;
    target.hitFlash = 1;
    target.knock = 1;
    target.hits += 1;
    target.hitbox.userData.active = false;

    state.hits += 1;
    state.score += target.scoreValue;
    state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
    state.comboTimer = 2.2;
    state.lastHitId = target.id;
    state.lastHitTime = state.elapsed;
    state.status = 'hit';

    setTargetFace(target, false);
    spawnHitEffect(target);
    updateTargetCounts();

    return {
      hit: true,
      target,
      score: state.score,
      combo: state.combo,
      eliminated: true,
    };
  }

  function registerMonsterHit(monster, hitInfo = {}) {
    const damage = Math.max(1, hitInfo.damage ?? 35);
    monster.health = Math.max(0, monster.health - damage);
    monster.hitFlash = 1;
    monster.knock = 1;

    state.score += Math.round(18 + damage * 0.28);
    state.status = 'hostile_hit';
    state.lastHitId = monster.id;
    state.lastHitTime = state.elapsed;

    if (monster.health > 0) {
      updateTargetCounts();
      return {
        hit: true,
        target: monster,
        score: state.score,
        combo: state.combo,
        eliminated: false,
      };
    }

    monster.active = false;
    monster.cooldown = Infinity;
    monster.hitbox.userData.active = false;
    monster.group.visible = false;
    monster.health = 0;

    state.hits += 1;
    state.hostilesDefeatedThisWave += 1;
    state.score += monster.scoreValue;
    state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
    state.comboTimer = 2.2;
    state.status = 'hostile_down';

    spawnHitEffect(monster);
    updateTargetCounts();
    scheduleNextWaveIfCleared();

    return {
      hit: true,
      target: monster,
      score: state.score,
      combo: state.combo,
      eliminated: true,
    };
  }

  function update(delta, elapsed) {
    state.elapsed = elapsed;

    if (state.player.pointerLocked && state.player.health > 0) {
      const wasWaiting = !state.player.hasEngaged;
      state.player.hasEngaged = true;
      if (wasWaiting && state.waveStatus === 'waiting') {
        activateMonsterWave(1, elapsed);
      }
    }

    updateWaveTimer(elapsed);

    if (state.comboTimer > 0) {
      state.comboTimer = Math.max(0, state.comboTimer - delta);
      if (state.comboTimer === 0) {
        state.combo = 0;
      }
    }

    for (const target of targets) {
      if (target.kind === 'monster') {
        updateMonster(target, delta, elapsed);
      } else {
        updateTarget(target, delta, elapsed);
      }
    }

    updateEffects(delta);
    animateRangeDetails(elapsed);
    updateTargetCounts();
    scheduleNextWaveIfCleared();
  }

  function updateWaveTimer(elapsed) {
    if (state.waveStatus !== 'intermission') {
      state.nextWaveIn = 0;
      return;
    }

    state.nextWaveIn = Math.max(0, state.nextWaveAt - elapsed);
    if (state.nextWaveIn <= 0) {
      activateMonsterWave(state.wave + 1, elapsed);
    }
  }

  function scheduleNextWaveIfCleared() {
    if (!state.player.hasEngaged || state.waveStatus !== 'active') {
      return;
    }

    const monsters = targets.filter((target) => target.kind === 'monster');
    if (!monsters.length || monsters.some((monster) => monster.active)) {
      return;
    }

    state.waveStatus = 'intermission';
    state.nextWaveAt = state.elapsed + 3.2;
    state.nextWaveIn = Math.max(0, state.nextWaveAt - state.elapsed);
    state.score += 125 + state.wave * 35;
    state.status = 'wave_cleared';
  }

  function activateMonsterWave(wave, elapsed) {
    const monsters = targets.filter((target) => target.kind === 'monster');
    const waveScale = Math.max(0, wave - 1);
    state.wave = wave;
    state.waveStatus = 'active';
    state.nextWaveAt = 0;
    state.nextWaveIn = 0;
    state.hostilesDefeatedThisWave = 0;
    state.waveHostilesTotal = monsters.length;
    state.status = wave === 1 ? 'wave_start' : 'wave_escalated';
    state.objectiveName = wave === 1 ? 'Hostile Contact' : `Hostile Wave ${wave}`;

    for (const monster of monsters) {
      const variant = MONSTER_VARIANTS[monster.variant] ?? MONSTER_VARIANTS.guard;
      monster.active = true;
      monster.cooldown = 0;
      monster.maxHealth = Math.round(monster.baseMaxHealth * variant.healthScale * (1 + waveScale * 0.24));
      monster.health = monster.maxHealth;
      monster.speed = monster.baseSpeed * variant.speedScale * (1 + Math.min(waveScale * 0.07, 0.35));
      monster.attackDamage = Math.round(monster.baseAttackDamage * variant.damageScale * (1 + waveScale * 0.16));
      monster.attackInterval = Math.max(0.62, monster.baseAttackInterval - Math.min(waveScale * 0.04, 0.22));
      monster.aggroRange = monster.baseAggroRange + Math.min(waveScale * 1.8, 10);
      monster.scoreValue = Math.round(monster.baseScoreValue * (1 + waveScale * 0.12));
      monster.group.position.copy(monster.basePosition);
      monster.group.visible = true;
      monster.group.scale.setScalar(variant.scale * (1 + Math.min(waveScale * 0.035, 0.16)));
      monster.hitbox.userData.active = true;
      monster.nextAttackAt = elapsed + 0.65;
      monster.attackFlash = 0;
      monster.hitFlash = 0;
      monster.bodyBaseColor.copy(variant.color).lerp(monster.waveColor, Math.min(waveScale * 0.08, 0.38));
      monster.bodyMaterial.color.copy(monster.bodyBaseColor);
      monster.bodyMaterial.emissive.copy(variant.emissive).multiplyScalar(0.5 + Math.min(waveScale * 0.08, 0.35));
    }
  }

  function resolveTarget(targetLike) {
    if (!targetLike) {
      return null;
    }

    if (targets.includes(targetLike)) {
      return targetLike;
    }

    if (targetLike.target && targets.includes(targetLike.target)) {
      return targetLike.target;
    }

    const object = targetLike.object || targetLike.mesh || targetLike.hitbox || targetLike;
    let current = object;

    while (current) {
      if (current.userData && current.userData.target) {
        return current.userData.target;
      }

      current = current.parent;
    }

    return null;
  }

  function spawnHitEffect(target) {
    const effectMaterial = materials.hitEffect.clone();
    const ring = new THREE.Mesh(torusGeometry, effectMaterial);
    ring.name = `${target.id}-hit-ring`;
    ring.position.copy(target.group.position);
    ring.position.y += 1.65;
    ring.position.z += 0.08;
    ring.rotation.copy(target.group.rotation);
    ring.castShadow = false;
    ring.receiveShadow = false;
    worldRoot.add(ring);

    effects.push({
      mesh: ring,
      material: effectMaterial,
      age: 0,
      lifetime: 0.45,
    });
  }

  function updateEffects(delta) {
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      effect.age += delta;

      const progress = Math.min(effect.age / effect.lifetime, 1);
      const scale = 1 + progress * 1.85;
      effect.mesh.scale.setScalar(scale);
      effect.material.opacity = 1 - progress;

      if (progress >= 1) {
        worldRoot.remove(effect.mesh);
        effect.mesh.geometry = null;
        effect.material.dispose();
        effects.splice(index, 1);
      }
    }
  }

  function updateTarget(target, delta, elapsed) {
    if (!target.active) {
      target.cooldown -= delta;

      if (target.cooldown <= 0) {
        target.active = true;
        target.cooldown = 0;
        target.hitbox.userData.active = true;
        setTargetFace(target, true);
      }
    }

    const baseX = target.basePosition.x;
    const baseY = target.basePosition.y;
    const baseZ = target.basePosition.z;

    if (target.moveAxis === 'x') {
      target.group.position.x =
        baseX + Math.sin(elapsed * target.moveSpeed + target.phase) * target.moveAmount;
    } else {
      target.group.position.x = baseX;
    }

    target.group.position.y = baseY;
    target.group.position.z = baseZ;

    target.hitFlash = Math.max(0, target.hitFlash - delta * 3.8);
    target.knock = Math.max(0, target.knock - delta * 2.2);

    const idleSway = Math.sin(elapsed * 1.35 + target.phase) * 0.025;
    const desiredTilt = target.active ? idleSway : -0.95;
    target.face.rotation.x += (desiredTilt - target.face.rotation.x) * Math.min(delta * 12, 1);

    const flashMix = target.hitFlash;
    target.centerMaterial.color.copy(target.centerBaseColor).lerp(target.flashColor, flashMix);
    target.centerMaterial.emissive.copy(target.flashColor).multiplyScalar(flashMix * 0.65);

    const plateFlash = target.hitFlash * 0.55;
    target.plateMaterial.color.copy(target.plateBaseColor).lerp(target.flashColor, plateFlash);
    target.plateMaterial.emissive.copy(target.flashColor).multiplyScalar(plateFlash * 0.18);
  }

  function updateMonster(monster, delta, elapsed) {
    if (monster.waitForEngage && !state.player.hasEngaged) {
      monster.active = false;
      monster.group.visible = false;
      monster.hitbox.userData.active = false;
      return;
    }

    if (!monster.active) {
      monster.cooldown -= delta;

      if (monster.cooldown <= 0) {
        monster.active = true;
        monster.cooldown = 0;
        monster.health = monster.maxHealth;
        monster.group.visible = true;
        monster.group.position.copy(monster.basePosition);
        monster.hitbox.userData.active = true;
      }

      return;
    }

    const playerPosition = state.player.position;
    const playerVector = playerPosition?.isVector3 ? playerPosition : null;
    const desired = monster.tempVector;

    const playerEngaged = Boolean(state.player.pointerLocked && state.player.health > 0);

    if (playerVector && playerEngaged) {
      desired.subVectors(playerVector, monster.group.position);
      desired.y = 0;
    }

    const distanceToPlayer = playerVector && playerEngaged ? desired.length() : Infinity;

    if (distanceToPlayer < monster.aggroRange && distanceToPlayer > 0.001) {
      desired.normalize();
      monster.group.position.addScaledVector(desired, monster.speed * delta);
      monster.group.lookAt(playerVector.x, monster.group.position.y, playerVector.z);

      if (distanceToPlayer < monster.attackRange && elapsed >= monster.nextAttackAt) {
        pendingPlayerDamage += monster.attackDamage;
        monster.nextAttackAt = elapsed + monster.attackInterval;
        monster.attackFlash = 1;
        state.status = 'hostile_attack';
      }
    } else {
      const patrolX = monster.basePosition.x + Math.sin(elapsed * monster.patrolSpeed + monster.phase) * monster.patrolRadius;
      const patrolZ = monster.basePosition.z + Math.cos(elapsed * monster.patrolSpeed + monster.phase) * monster.patrolRadius * 0.45;
      desired.set(patrolX - monster.group.position.x, 0, patrolZ - monster.group.position.z);

      if (desired.lengthSq() > 0.01) {
        desired.normalize();
        monster.group.position.addScaledVector(desired, monster.speed * 0.38 * delta);
        monster.group.lookAt(monster.group.position.x + desired.x, monster.group.position.y, monster.group.position.z + desired.z);
      }
    }

    monster.group.position.y = monster.basePosition.y + Math.abs(Math.sin(elapsed * 4 + monster.phase)) * 0.08;
    monster.hitFlash = Math.max(0, monster.hitFlash - delta * 4.8);
    monster.knock = Math.max(0, monster.knock - delta * 3.2);
    monster.attackFlash = Math.max(0, monster.attackFlash - delta * 5);

    const healthRatio = monster.maxHealth > 0 ? monster.health / monster.maxHealth : 0;
    monster.healthBar.scale.x = Math.max(0.04, healthRatio);
    monster.healthBar.position.x = -0.5 + healthRatio * 0.5;

    const flashMix = Math.max(monster.hitFlash, monster.attackFlash * 0.65);
    monster.bodyMaterial.color.copy(monster.bodyBaseColor).lerp(monster.flashColor, flashMix);
    monster.bodyMaterial.emissive.copy(monster.flashColor).multiplyScalar(flashMix * 0.42);
  }

  function animateRangeDetails(elapsed) {
    const pulse = (Math.sin(elapsed * 4.5) + 1) * 0.5;

    for (const lamp of worldRoot.userData.warningLamps || []) {
      lamp.material.emissiveIntensity = 0.35 + pulse * 0.65;
    }

    for (const fan of worldRoot.userData.fans || []) {
      fan.rotation.z += 0.075;
    }
  }

  function updateTargetCounts() {
    let activeTargets = 0;
    let monsterTotal = 0;
    let monstersAlive = 0;
    let waveHostilesTotal = 0;

    for (const target of targets) {
      if (target.active) {
        activeTargets += 1;
      }

      if (target.kind === 'monster') {
        monsterTotal += 1;
        waveHostilesTotal += 1;
        if (target.active) {
          monstersAlive += 1;
        }
      }
    }

    state.totalTargets = targets.length;
    state.monsterTotal = monsterTotal;
    state.waveHostilesTotal = waveHostilesTotal;
    state.monstersAlive = monstersAlive;
    state.activeTargets = activeTargets;
    state.inactiveTargets = targets.length - activeTargets;
    state.clearedTargets = Math.min(state.hits, state.totalTargets);
    state.progress = waveHostilesTotal > 0
      ? Math.min(state.hostilesDefeatedThisWave / waveHostilesTotal, 1)
      : state.totalTargets > 0
        ? state.clearedTargets / state.totalTargets
        : 0;
  }

  return {
    scene,
    root: worldRoot,
    bounds: state.bounds,
    playerSpawn: state.playerSpawn,
    state,
    targets,
    update,
    registerHit,
    consumePlayerDamage() {
      const amount = pendingPlayerDamage;
      pendingPlayerDamage = 0;
      return amount;
    },
  };
}

function createMaterials(THREE) {
  return {
    asphalt: new THREE.MeshStandardMaterial({
      color: 0x262a2d,
      roughness: 0.95,
      metalness: 0.02,
    }),
    concrete: new THREE.MeshStandardMaterial({
      color: 0x777a75,
      roughness: 0.86,
      metalness: 0.02,
    }),
    darkConcrete: new THREE.MeshStandardMaterial({
      color: 0x3c4242,
      roughness: 0.9,
      metalness: 0.03,
    }),
    lanePaint: new THREE.MeshStandardMaterial({
      color: 0xd8b44a,
      roughness: 0.8,
      metalness: 0,
    }),
    whitePaint: new THREE.MeshStandardMaterial({
      color: 0xd8d3c4,
      roughness: 0.75,
      metalness: 0,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x657077,
      roughness: 0.58,
      metalness: 0.48,
    }),
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x1f262a,
      roughness: 0.62,
      metalness: 0.52,
    }),
    containerBlue: new THREE.MeshStandardMaterial({
      color: 0x304b5d,
      roughness: 0.72,
      metalness: 0.35,
    }),
    containerRed: new THREE.MeshStandardMaterial({
      color: 0x683c31,
      roughness: 0.78,
      metalness: 0.26,
    }),
    plywood: new THREE.MeshStandardMaterial({
      color: 0x8f734f,
      roughness: 0.9,
      metalness: 0.02,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x15191b,
      roughness: 0.82,
      metalness: 0.05,
    }),
    targetPlate: new THREE.MeshStandardMaterial({
      color: 0x22282a,
      roughness: 0.74,
      metalness: 0.16,
    }),
    targetRing: new THREE.MeshStandardMaterial({
      color: 0xe7e0ca,
      roughness: 0.68,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    targetCenter: new THREE.MeshStandardMaterial({
      color: 0xb63d32,
      roughness: 0.55,
      metalness: 0.05,
      emissive: 0x120202,
      side: THREE.DoubleSide,
    }),
    targetDisabled: new THREE.MeshStandardMaterial({
      color: 0x485052,
      roughness: 0.8,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    hitbox: new THREE.MeshBasicMaterial({
      color: 0x00ff99,
      transparent: true,
      opacity: 0.01,
      depthWrite: false,
    }),
    hitEffect: new THREE.MeshBasicMaterial({
      color: 0xffd15f,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xffb24b,
      emissive: 0xff8f1f,
      emissiveIntensity: 0.75,
      roughness: 0.35,
      metalness: 0.08,
    }),
    monsterBody: new THREE.MeshStandardMaterial({
      color: 0x6ca35f,
      emissive: 0x081908,
      emissiveIntensity: 0.12,
      roughness: 0.72,
      metalness: 0.03,
    }),
    monsterHat: new THREE.MeshStandardMaterial({
      color: 0x7f5834,
      roughness: 0.78,
      metalness: 0.04,
    }),
    monsterHealth: new THREE.MeshBasicMaterial({
      color: 0x58f2a0,
      transparent: true,
      opacity: 0.95,
    }),
  };
}

function buildLighting(scene, THREE) {
  const hemisphereLight = new THREE.HemisphereLight(0xcbd5dd, 0x24292e, 1.1);
  scene.add(hemisphereLight);

  const keyLight = new THREE.DirectionalLight(0xfff0d6, 3.1);
  keyLight.position.set(12, 18, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 80;
  keyLight.shadow.camera.left = -34;
  keyLight.shadow.camera.right = 34;
  keyLight.shadow.camera.top = 28;
  keyLight.shadow.camera.bottom = -48;
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x9fc6ff, 16, 36, 2);
  fillLight.position.set(-12, 7, -14);
  scene.add(fillLight);

  const bayLight = new THREE.PointLight(0xffcf8a, 18, 42, 2);
  bayLight.position.set(7, 8, -36);
  scene.add(bayLight);
}

function buildRange(root, THREE, context) {
  const { boxGeometry, planeGeometry, materials } = context;
  const warningLamps = [];
  const fans = [];
  root.userData.warningLamps = warningLamps;
  root.userData.fans = fans;

  const ground = addBox(root, THREE, boxGeometry, materials.asphalt, {
    name: 'asphalt-range-floor',
    position: [0, -0.08, -26],
    scale: [30, 0.16, 78],
    receiveShadow: true,
  });
  ground.receiveShadow = true;

  addBox(root, THREE, boxGeometry, materials.darkConcrete, {
    name: 'left-perimeter-wall',
    position: [-15.5, 2.1, -28],
    scale: [0.8, 4.2, 72],
  });
  addBox(root, THREE, boxGeometry, materials.darkConcrete, {
    name: 'right-perimeter-wall',
    position: [15.5, 2.1, -28],
    scale: [0.8, 4.2, 72],
  });
  addBox(root, THREE, boxGeometry, materials.darkConcrete, {
    name: 'back-stop-wall',
    position: [0, 3.1, -65],
    scale: [31, 6.2, 1.1],
  });

  addBox(root, THREE, boxGeometry, materials.concrete, {
    name: 'start-pad',
    position: [0, 0.04, 7.7],
    scale: [9.8, 0.08, 5.4],
  });

  for (const x of [-7.5, 0, 7.5]) {
    addBox(root, THREE, boxGeometry, materials.lanePaint, {
      name: 'lane-center-line',
      position: [x, 0.015, -24],
      scale: [0.08, 0.035, 57],
      receiveShadow: false,
    });
  }

  for (const z of [-8, -20, -32, -44, -56]) {
    addBox(root, THREE, boxGeometry, materials.whitePaint, {
      name: 'range-distance-marker',
      position: [0, 0.02, z],
      scale: [20.2, 0.035, 0.08],
      receiveShadow: false,
    });
  }

  addContainer(root, THREE, context, {
    name: 'left-stacked-container',
    position: [-12.1, 1.25, -36],
    scale: [4.1, 2.5, 13],
    material: materials.containerBlue,
  });
  addContainer(root, THREE, context, {
    name: 'right-service-container',
    position: [12.2, 1.25, -29],
    scale: [4.1, 2.5, 12],
    material: materials.containerRed,
  });
  addContainer(root, THREE, context, {
    name: 'back-loading-container',
    position: [-8.6, 1.25, -54],
    scale: [5.4, 2.5, 8.5],
    material: materials.containerBlue,
  });

  addCatwalk(root, THREE, context, {
    position: [-9.5, 3.15, -35],
    length: 15,
  });

  addCover(root, THREE, context, { position: [-5.3, 0, -9.8], rotationY: 0.08 });
  addCover(root, THREE, context, { position: [4.7, 0, -11.2], rotationY: -0.08 });
  addCover(root, THREE, context, { position: [-2.8, 0, -29], rotationY: -0.18 });
  addCover(root, THREE, context, { position: [7.4, 0, -31.5], rotationY: 0.12 });
  addCover(root, THREE, context, { position: [-7.8, 0, -45], rotationY: 0.18 });

  addBarricade(root, THREE, context, {
    position: [0, 0, -14.2],
    width: 9.5,
  });
  addBarricade(root, THREE, context, {
    position: [0, 0, -48.5],
    width: 12,
  });

  addBarrelStack(root, THREE, context, [-10.5, 0, -16]);
  addBarrelStack(root, THREE, context, [10.2, 0, -22]);
  addBarrelStack(root, THREE, context, [11.5, 0, -47]);

  for (const lampPosition of [
    [-14.8, 3.9, -12],
    [14.8, 3.9, -28],
    [-14.8, 3.9, -46],
    [14.8, 3.9, -58],
  ]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), materials.lamp.clone());
    lamp.name = 'amber-warning-lamp';
    lamp.position.set(...lampPosition);
    root.add(lamp);
    warningLamps.push(lamp);
  }

  const fan = new THREE.Group();
  fan.name = 'slow-vent-fan';
  fan.position.set(13.9, 3.8, -40);
  fan.rotation.y = Math.PI / 2;
  for (let index = 0; index < 4; index += 1) {
    const blade = addBox(fan, THREE, boxGeometry, materials.darkMetal, {
      name: 'fan-blade',
      position: [0.42, 0, 0],
      scale: [0.82, 0.05, 0.18],
    });
    blade.rotation.z = (Math.PI / 2) * index;
  }
  root.add(fan);
  fans.push(fan);

  const mural = new THREE.Mesh(planeGeometry, materials.whitePaint.clone());
  mural.name = 'plain-backstop-panel';
  mural.position.set(0, 3.4, -64.42);
  mural.scale.set(9, 2.4, 1);
  mural.receiveShadow = false;
  root.add(mural);
}

function addBox(root, THREE, geometry, material, options) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = options.name || 'box';
  mesh.position.set(...(options.position || [0, 0, 0]));
  mesh.scale.set(...(options.scale || [1, 1, 1]));

  if (options.rotationY) {
    mesh.rotation.y = options.rotationY;
  }

  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = options.receiveShadow !== false;
  root.add(mesh);
  return mesh;
}

function addContainer(root, THREE, context, options) {
  const { boxGeometry, materials } = context;
  const group = new THREE.Group();
  group.name = options.name;
  group.position.set(...options.position);

  addBox(group, THREE, boxGeometry, options.material, {
    name: 'container-shell',
    position: [0, 0, 0],
    scale: options.scale,
  });

  const ribCount = 6;
  for (let index = 0; index < ribCount; index += 1) {
    const z = -options.scale[2] * 0.43 + (index / (ribCount - 1)) * options.scale[2] * 0.86;
    addBox(group, THREE, boxGeometry, materials.darkMetal, {
      name: 'container-rib-left',
      position: [-options.scale[0] * 0.51, 0.02, z],
      scale: [0.08, options.scale[1] * 0.96, 0.08],
    });
    addBox(group, THREE, boxGeometry, materials.darkMetal, {
      name: 'container-rib-right',
      position: [options.scale[0] * 0.51, 0.02, z],
      scale: [0.08, options.scale[1] * 0.96, 0.08],
    });
  }

  root.add(group);
  return group;
}

function addCatwalk(root, THREE, context, options) {
  const { boxGeometry, materials } = context;
  const group = new THREE.Group();
  group.name = 'raised-catwalk';
  group.position.set(...options.position);

  addBox(group, THREE, boxGeometry, materials.metal, {
    name: 'catwalk-platform',
    position: [0, 0, 0],
    scale: [3.5, 0.16, options.length],
  });
  addBox(group, THREE, boxGeometry, materials.darkMetal, {
    name: 'catwalk-left-rail',
    position: [-1.9, 0.65, 0],
    scale: [0.09, 1.1, options.length],
  });
  addBox(group, THREE, boxGeometry, materials.darkMetal, {
    name: 'catwalk-right-rail',
    position: [1.9, 0.65, 0],
    scale: [0.09, 1.1, options.length],
  });

  for (const z of [-6, -3, 0, 3, 6]) {
    addBox(group, THREE, boxGeometry, materials.darkMetal, {
      name: 'catwalk-support',
      position: [-1.65, -1.6, z],
      scale: [0.14, 3.2, 0.14],
    });
    addBox(group, THREE, boxGeometry, materials.darkMetal, {
      name: 'catwalk-support',
      position: [1.65, -1.6, z],
      scale: [0.14, 3.2, 0.14],
    });
  }

  root.add(group);
  return group;
}

function addCover(root, THREE, context, options) {
  const { boxGeometry, materials } = context;
  const group = new THREE.Group();
  group.name = 'cover-stack';
  group.position.set(...options.position);
  group.rotation.y = options.rotationY || 0;

  addBox(group, THREE, boxGeometry, materials.concrete, {
    name: 'low-concrete-cover',
    position: [0, 0.45, 0],
    scale: [3.6, 0.9, 0.55],
  });
  addBox(group, THREE, boxGeometry, materials.plywood, {
    name: 'plywood-screen',
    position: [1.15, 1.55, -0.08],
    scale: [1.1, 2.2, 0.18],
  });
  addBox(group, THREE, boxGeometry, materials.darkMetal, {
    name: 'cover-brace',
    position: [1.15, 2.7, -0.08],
    scale: [1.25, 0.12, 0.22],
  });

  root.add(group);
  return group;
}

function addBarricade(root, THREE, context, options) {
  const { boxGeometry, materials } = context;
  const group = new THREE.Group();
  group.name = 'jersey-barrier-row';
  group.position.set(...options.position);

  const blockCount = Math.max(2, Math.floor(options.width / 2.2));
  const start = -((blockCount - 1) * 2.15) / 2;

  for (let index = 0; index < blockCount; index += 1) {
    addBox(group, THREE, boxGeometry, materials.concrete, {
      name: 'jersey-barrier-base',
      position: [start + index * 2.15, 0.38, 0],
      scale: [1.95, 0.76, 0.55],
    });
    addBox(group, THREE, boxGeometry, materials.darkConcrete, {
      name: 'jersey-barrier-cap',
      position: [start + index * 2.15, 0.9, 0],
      scale: [1.55, 0.28, 0.42],
    });
  }

  root.add(group);
  return group;
}

function addBarrelStack(root, THREE, context, position) {
  const { materials } = context;
  const group = new THREE.Group();
  group.name = 'barrel-stack';
  group.position.set(...position);

  const barrelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.92, 24);

  for (const barrel of [
    [-0.4, 0.46, 0],
    [0.4, 0.46, 0.05],
    [0, 1.38, -0.02],
  ]) {
    const mesh = new THREE.Mesh(barrelGeometry, materials.metal);
    mesh.name = 'training-barrel';
    mesh.position.set(...barrel);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  root.add(group);
  return group;
}

function createMonster(THREE, options) {
  const {
    boxGeometry,
    materials,
    monsterVariants,
    id,
    variant: variantKey = 'guard',
    position,
    speed = 2.4,
    health = 150,
    scoreValue = 200,
    attackDamage = 9,
    attackInterval = 1.05,
    aggroRange = 24,
    respawnDelay = 4.5,
    patrolRadius = 4,
  } = options;
  const variant = monsterVariants?.[variantKey] ?? monsterVariants?.guard;

  const group = new THREE.Group();
  group.name = `hostile-${id}`;
  group.position.copy(position);
  group.visible = false;

  const fallback = new THREE.Group();
  fallback.name = `${id}-fallback-body`;
  group.add(fallback);

  const bodyMaterial = materials.monsterBody.clone();
  const hatMaterial = materials.monsterHat.clone();
  if (variant) {
    bodyMaterial.color.copy(variant.color);
    bodyMaterial.emissive.copy(variant.emissive);
    hatMaterial.color.copy(variant.color).multiplyScalar(0.72);
  }
  const bodyGeometry =
    typeof THREE.CapsuleGeometry === 'function'
      ? new THREE.CapsuleGeometry(0.44, 0.95, 6, 12)
      : new THREE.CylinderGeometry(0.42, 0.5, 1.45, 12);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = `${id}-body`;
  body.position.set(0, 0.9, 0);
  body.castShadow = true;
  fallback.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), bodyMaterial);
  head.name = `${id}-head`;
  head.position.set(0, 1.72, -0.02);
  head.castShadow = true;
  fallback.add(head);

  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.64, 0.16, 18), hatMaterial);
  hat.name = `${id}-hat`;
  hat.position.set(0, 2.04, -0.02);
  hat.castShadow = true;
  fallback.add(hat);

  for (const x of [-0.54, 0.54]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), bodyMaterial);
    arm.name = `${id}-arm`;
    arm.position.set(x, 1.06, 0.02);
    arm.rotation.z = -x * 0.42;
    arm.castShadow = true;
    fallback.add(arm);
  }

  const modelSocket = new THREE.Group();
  modelSocket.name = `${id}-external-model`;
  group.add(modelSocket);
  mountExternalModel(
    THREE,
    modelSocket,
    {
      overrideGroup: 'monsters',
      overrideKey: 'cactoro',
      file: 'cactoro.glb',
      maxSize: 1.86,
      alignBottom: true,
      rotation: [0, Math.PI, 0],
    },
    fallback,
  );

  const hitbox = new THREE.Mesh(boxGeometry, materials.hitbox.clone());
  hitbox.name = `hitbox-${id}`;
  hitbox.position.set(0, 1.1, 0);
  hitbox.scale.set(1.18, 2.25, 1.05);
  hitbox.castShadow = false;
  hitbox.receiveShadow = false;
  hitbox.userData.active = false;
  group.add(hitbox);

  const healthBack = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({
    color: 0x15191b,
    transparent: true,
    opacity: 0.86,
  }));
  healthBack.name = `${id}-health-back`;
  healthBack.position.set(0, 2.35, 0);
  healthBack.scale.set(1.18, 0.07, 0.04);
  group.add(healthBack);

  const healthBar = new THREE.Mesh(boxGeometry, materials.monsterHealth.clone());
  healthBar.name = `${id}-health-bar`;
  healthBar.position.set(0, 2.36, -0.035);
  healthBar.scale.set(1, 0.06, 0.04);
  group.add(healthBar);

  const monster = {
    id,
    kind: 'monster',
    group,
    mesh: hitbox,
    hitbox,
    active: false,
    cooldown: Infinity,
    respawnDelay,
    waitForEngage: options.waitForEngage !== false,
    variant: variantKey,
    variantLabel: variant?.label ?? 'Hostile',
    scoreValue,
    baseScoreValue: scoreValue,
    baseMaxHealth: health,
    maxHealth: health,
    health,
    speed,
    baseSpeed: speed,
    patrolRadius,
    patrolSpeed: 0.58 + Math.random() * 0.25,
    aggroRange,
    baseAggroRange: aggroRange,
    attackRange: 1.65,
    attackDamage,
    baseAttackDamage: attackDamage,
    attackInterval,
    baseAttackInterval: attackInterval,
    nextAttackAt: 0,
    hitFlash: 0,
    knock: 0,
    attackFlash: 0,
    phase: Math.random() * Math.PI * 2,
    basePosition: position.clone(),
    tempVector: new THREE.Vector3(),
    bodyMaterial,
    bodyBaseColor: bodyMaterial.color.clone(),
    waveColor: new THREE.Color(0xffd35f),
    flashColor: new THREE.Color(0xffd35f),
    healthBar,
  };

  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.target = monster;
    }
  });

  return monster;
}

function createTarget(THREE, options) {
  const {
    boxGeometry,
    circleGeometry,
    materials,
    id,
    position,
    yaw = 0,
    scoreValue = 100,
    respawnDelay = 1.5,
    moveAxis = null,
    moveAmount = 0,
    moveSpeed = 0,
  } = options;

  const group = new THREE.Group();
  group.name = `target-${id}`;
  group.position.copy(position);
  group.rotation.y = yaw;

  const standMaterial = materials.darkMetal;
  addBox(group, THREE, boxGeometry, standMaterial, {
    name: 'target-post',
    position: [0, 0.8, -0.06],
    scale: [0.14, 1.6, 0.14],
  });
  addBox(group, THREE, boxGeometry, standMaterial, {
    name: 'target-foot',
    position: [0, 0.08, -0.05],
    scale: [1.4, 0.16, 0.55],
  });

  const face = new THREE.Group();
  face.name = 'target-face';
  face.position.set(0, 1.65, 0);
  group.add(face);

  const plateMaterial = materials.targetPlate.clone();
  const plate = new THREE.Mesh(boxGeometry, plateMaterial);
  plate.name = 'target-armor-plate';
  plate.scale.set(1.35, 1.82, 0.08);
  plate.castShadow = true;
  plate.receiveShadow = true;
  face.add(plate);

  const outerMaterial = materials.targetRing.clone();
  const outerRing = new THREE.Mesh(circleGeometry, outerMaterial);
  outerRing.name = 'target-outer-ring';
  outerRing.position.set(0, 0.08, 0.055);
  outerRing.scale.set(1.05, 1.05, 1);
  face.add(outerRing);

  const midMaterial = materials.targetRing.clone();
  midMaterial.color.setHex(0x252b2c);
  const midRing = new THREE.Mesh(circleGeometry, midMaterial);
  midRing.name = 'target-mid-ring';
  midRing.position.set(0, 0.08, 0.06);
  midRing.scale.set(0.68, 0.68, 1);
  face.add(midRing);

  const centerMaterial = materials.targetCenter.clone();
  const center = new THREE.Mesh(circleGeometry, centerMaterial);
  center.name = 'target-center-ring';
  center.position.set(0, 0.08, 0.065);
  center.scale.set(0.34, 0.34, 1);
  face.add(center);

  const headMaterial = materials.targetRing.clone();
  const head = new THREE.Mesh(circleGeometry, headMaterial);
  head.name = 'target-head-plate';
  head.position.set(0, 0.9, 0.06);
  head.scale.set(0.32, 0.32, 1);
  face.add(head);

  const hitbox = new THREE.Mesh(boxGeometry, materials.hitbox.clone());
  hitbox.name = `hitbox-${id}`;
  hitbox.position.set(0, 1.66, 0.08);
  hitbox.scale.set(1.5, 1.95, 0.22);
  hitbox.castShadow = false;
  hitbox.receiveShadow = false;
  hitbox.userData.active = true;
  group.add(hitbox);

  const target = {
    id,
    group,
    face,
    mesh: hitbox,
    hitbox,
    plate,
    center,
    plateMaterial,
    centerMaterial,
    plateBaseColor: plateMaterial.color.clone(),
    centerBaseColor: centerMaterial.color.clone(),
    flashColor: new THREE.Color(0xffd35f),
    basePosition: position.clone(),
    active: true,
    cooldown: 0,
    respawnDelay,
    scoreValue,
    hitFlash: 0,
    knock: 0,
    hits: 0,
    phase: Math.random() * Math.PI * 2,
    moveAxis,
    moveAmount,
    moveSpeed,
  };

  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.target = target;
    }
  });

  return target;
}

function setTargetFace(target, active) {
  const opacity = active ? 1 : 0.5;
  const ringColor = active ? 0xe7e0ca : 0x586164;
  const centerColor = active ? 0xb63d32 : 0x51595b;

  for (const child of target.face.children) {
    if (child.material && child.material.color) {
      child.material.opacity = opacity;
      child.material.transparent = !active;
    }
  }

  target.centerBaseColor.setHex(centerColor);
  target.centerMaterial.color.setHex(centerColor);
  target.centerMaterial.emissive.setHex(active ? 0x120202 : 0x000000);

  for (const child of target.face.children) {
    if (child.name.includes('ring') || child.name.includes('head')) {
      child.material.color.setHex(ringColor);
    }
  }
}
