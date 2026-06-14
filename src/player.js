const MOVE_SPEED = 5.4;
const SPRINT_SPEED = 8.2;
const ACCELERATION = 18;
const FRICTION = 16;
const MOUSE_SENSITIVITY = 0.0022;
const MIN_PITCH = -0.92;
const MAX_PITCH = 0.72;

const MAGAZINE_SIZE = 30;
const RESERVE_AMMO = 90;
const RELOAD_TIME = 1.35;
const FIRE_INTERVAL = 0.11;
const WEAPON_DAMAGE = 34;
const RANGE = 85;

const CAMERA_DISTANCE = 5.8;
const CAMERA_HEIGHT = 1.55;
const SHOULDER_OFFSET = 0.72;
const CAMERA_SMOOTHING = 16;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function expDamp(rate, delta) {
  return 1 - Math.exp(-rate * delta);
}

function getScene(world) {
  return world?.scene ?? world?.root?.parent ?? world?.group?.parent ?? null;
}

function getSpawnPoint(world, THREE) {
  const spawn = world?.playerSpawn ?? world?.spawnPoint ?? world?.state?.playerSpawn;
  if (spawn?.isVector3) {
    return spawn.clone();
  }

  if (Array.isArray(spawn)) {
    return new THREE.Vector3(spawn[0] ?? 0, spawn[1] ?? 0, spawn[2] ?? 8);
  }

  if (spawn && typeof spawn === 'object') {
    return new THREE.Vector3(spawn.x ?? 0, spawn.y ?? 0, spawn.z ?? 8);
  }

  return new THREE.Vector3(0, 0, 8);
}

function getArenaBounds(world) {
  return world?.bounds ?? world?.arenaBounds ?? world?.state?.bounds ?? null;
}

function applyGroundAndBounds(position, world) {
  const groundHeight =
    world?.getGroundHeight?.(position.x, position.z) ??
    world?.getHeightAt?.(position.x, position.z) ??
    world?.state?.groundY ??
    0;

  position.y = groundHeight;

  const bounds = getArenaBounds(world);
  if (!bounds) {
    return;
  }

  const minX = bounds.minX ?? bounds.min?.x ?? -Infinity;
  const maxX = bounds.maxX ?? bounds.max?.x ?? Infinity;
  const minZ = bounds.minZ ?? bounds.min?.z ?? -Infinity;
  const maxZ = bounds.maxZ ?? bounds.max?.z ?? Infinity;

  position.x = clamp(position.x, minX, maxX);
  position.z = clamp(position.z, minZ, maxZ);
}

function normalizeTargets(world) {
  const source = world?.targets ?? world?.targetMeshes ?? world?.state?.targets ?? [];

  if (Array.isArray(source)) {
    return source
      .map((target) => target?.isObject3D ? target : target?.hitbox ?? target?.mesh ?? target?.group)
      .filter(Boolean);
  }

  if (source?.isObject3D) {
    return source.children?.length ? source.children : [source];
  }

  return [];
}

function findTargetRoot(object, targets) {
  let current = object;

  while (current) {
    if (current.userData?.target) {
      return current.userData.target;
    }

    if (targets.includes(current) || current.userData?.isTarget) {
      return current;
    }

    current = current.parent;
  }

  return object;
}

function targetIsActive(target) {
  const targetState = target?.userData?.target ?? target?.target ?? target;
  const data = target?.userData ?? targetState?.userData ?? {};

  if (targetState?.active === false || data.active === false) {
    return false;
  }

  return !data.disabled && !data.destroyed && target.visible !== false;
}

function materialList(material) {
  return Array.isArray(material) ? material : [material].filter(Boolean);
}

function createAvatar(THREE) {
  const rig = new THREE.Group();
  rig.name = 'PlayerRig';

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x42566a,
    roughness: 0.72,
    metalness: 0.08,
  });
  const armorMaterial = new THREE.MeshStandardMaterial({
    color: 0x182129,
    roughness: 0.84,
    metalness: 0.12,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2c94c,
    roughness: 0.48,
    metalness: 0.18,
  });

  const torsoGeometry =
    typeof THREE.CapsuleGeometry === 'function'
      ? new THREE.CapsuleGeometry(0.35, 0.92, 6, 12)
      : new THREE.CylinderGeometry(0.34, 0.38, 1.48, 12);
  const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
  torso.name = 'PlayerTorso';
  torso.position.y = 0.95;
  torso.castShadow = true;
  rig.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), armorMaterial);
  head.name = 'PlayerHead';
  head.position.set(0, 1.78, -0.03);
  head.castShadow = true;
  rig.add(head);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.18), armorMaterial);
  pack.name = 'PlayerPack';
  pack.position.set(0, 1.03, 0.36);
  pack.castShadow = true;
  rig.add(pack);

  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.86), accentMaterial);
  rifle.name = 'PlayerRifle';
  rifle.position.set(0.32, 1.24, -0.4);
  rifle.castShadow = true;
  rig.add(rifle);

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.44), armorMaterial);
  barrel.name = 'PlayerBarrel';
  barrel.position.set(0.32, 1.25, -1.05);
  barrel.castShadow = true;
  rig.add(barrel);

  return rig;
}

function callOptional(fn, payload) {
  if (typeof fn === 'function') {
    fn(payload);
  }
}

export function createPlayerController({ camera, canvas, hud, raycaster, world, THREE }) {
  const keys = new Set();
  const moveInput = new THREE.Vector3();
  const desiredVelocity = new THREE.Vector3();
  const horizontalForward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const cameraFocus = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const aimTarget = new THREE.Vector3();
  const shotPoint = new THREE.Vector3();
  const cameraJitter = new THREE.Vector3();
  const pointer = new THREE.Vector2(0, 0);
  const targetFlashes = [];
  const originalMaterials = new WeakMap();

  const scene = getScene(world);
  const avatar = createAvatar(THREE);
  const spawnPoint = getSpawnPoint(world, THREE);

  if (scene?.add) {
    scene.add(avatar);
  }

  const state = {
    position: spawnPoint.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: -0.12,
    pointerLocked: false,
    moving: false,
    sprinting: false,
    alive: true,
    maxHealth: 100,
    health: 100,
    magazineSize: MAGAZINE_SIZE,
    ammo: MAGAZINE_SIZE,
    reserveAmmo: RESERVE_AMMO,
    isReloading: false,
    reloadProgress: 0,
    shots: 0,
    hits: 0,
    misses: 0,
    accuracy: 1,
    combo: 0,
    bestCombo: 0,
    kills: 0,
    score: 0,
    hitMarker: 0,
    hitFeedback: 0,
    damageFeedback: 0,
    recoil: 0,
    lastShotAt: -Infinity,
    lastHitAt: -Infinity,
    lastHit: null,
    message: 'ready',
  };

  avatar.position.copy(state.position);
  applyGroundAndBounds(state.position, world);
  avatar.position.copy(state.position);

  let fireHeld = false;
  let reloadQueued = false;
  let nextShotAt = 0;
  let reloadEndsAt = 0;
  let recoilYaw = 0;
  let currentElapsed = 0;

  function requestPointerLock() {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  }

  function startReload(elapsed) {
    if (state.isReloading || state.ammo >= state.magazineSize || state.reserveAmmo <= 0) {
      return;
    }

    state.isReloading = true;
    state.reloadProgress = 0;
    state.message = 'reloading';
    reloadEndsAt = elapsed + RELOAD_TIME;
    callOptional(hud?.onReloadStart, state);
  }

  function finishReload() {
    const needed = state.magazineSize - state.ammo;
    const loaded = Math.min(needed, state.reserveAmmo);

    state.ammo += loaded;
    state.reserveAmmo -= loaded;
    state.isReloading = false;
    state.reloadProgress = 0;
    state.message = 'ready';
    callOptional(hud?.onReloadEnd, state);
  }

  function updateAccuracy() {
    state.accuracy = state.shots > 0 ? state.hits / state.shots : 1;
  }

  function queueTargetFlash(target, elapsed) {
    const flashRoot = target?.isObject3D ? target : target?.group ?? target?.mesh ?? target?.hitbox;

    flashRoot?.traverse?.((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }

      for (const material of materialList(child.material)) {
        if (!material || !material.emissive) {
          continue;
        }

        if (!originalMaterials.has(material)) {
          originalMaterials.set(material, {
            color: material.emissive.clone(),
            intensity: material.emissiveIntensity ?? 0,
          });
        }

        material.emissive.set(0xfff1a6);
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 0.9);
        targetFlashes.push({ material, expiresAt: elapsed + 0.08 });
      }
    });
  }

  function restoreTargetFlashes(elapsed) {
    for (let index = targetFlashes.length - 1; index >= 0; index -= 1) {
      const flash = targetFlashes[index];
      if (flash.expiresAt > elapsed) {
        continue;
      }

      const original = originalMaterials.get(flash.material);
      if (original) {
        flash.material.emissive.copy(original.color);
        flash.material.emissiveIntensity = original.intensity;
      }

      targetFlashes.splice(index, 1);
    }
  }

  function applyTargetDamage(target, hit, elapsed) {
    const worldHit = world?.registerHit?.(target) ?? world?.registerHit?.(hit.object);
    if (worldHit && typeof worldHit === 'object') {
      const accepted = worldHit.hit !== false;

      if (accepted) {
        state.kills += 1;
        state.score = worldHit.score ?? world?.state?.score ?? state.score + 100;
      }

      return {
        accepted,
        eliminated: accepted,
        handledByWorld: true,
      };
    }

    const dataOwner = target?.userData
      ? target
      : target?.group?.userData
        ? target.group
        : target?.hitbox?.userData
          ? target.hitbox
          : target;
    dataOwner.userData ??= {};
    const data = dataOwner.userData;
    const maxHealth = data.maxHealth ?? data.health ?? 100;

    if (data.health === undefined) {
      data.health = maxHealth;
    }

    data.health = Math.max(0, data.health - WEAPON_DAMAGE);
    data.lastHitAt = elapsed;

    const eliminated = data.health <= 0 && !data.destroyed;
    if (eliminated) {
      data.destroyed = true;
      const visibleTarget = target?.isObject3D ? target : target?.group ?? target?.mesh ?? target?.hitbox;
      if (visibleTarget && data.hideOnDestroyed !== false) {
        visibleTarget.visible = false;
      }
      state.kills += 1;
      state.score += 150 + state.combo * 15;
    } else {
      state.score += 25 + state.combo * 5;
    }

    callOptional(data.onHit, {
      damage: WEAPON_DAMAGE,
      health: data.health,
      eliminated,
      point: hit.point,
      object: hit.object,
      target,
      player: state,
    });
    callOptional(world?.onTargetHit, {
      damage: WEAPON_DAMAGE,
      health: data.health,
      eliminated,
      point: hit.point,
      object: hit.object,
      target,
      player: state,
    });

    return {
      accepted: true,
      eliminated,
      handledByWorld: false,
    };
  }

  function registerHit(hit, targets, elapsed) {
    const target = findTargetRoot(hit.object, targets);
    const hitResult = applyTargetDamage(target, hit, elapsed);

    if (!hitResult.accepted) {
      registerMiss();
      return;
    }

    const { eliminated } = hitResult;

    state.hits += 1;
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.hitMarker = 1;
    state.hitFeedback = 1;
    state.lastHitAt = elapsed;
    state.lastHit = {
      point: hit.point.clone(),
      distance: hit.distance,
      eliminated,
      targetName: target.name || hit.object.name || 'target',
    };
    state.message = eliminated ? 'target_down' : 'hit';

    if (!hitResult.handledByWorld) {
      queueTargetFlash(target, elapsed);
    }
    callOptional(hud?.onHit, state.lastHit);
    callOptional(hud?.showHit, eliminated ? 'DOWN' : 'HIT');
  }

  function registerMiss() {
    state.misses += 1;
    state.combo = 0;
    state.lastHit = null;
    state.message = 'miss';
    callOptional(hud?.onMiss, state);
  }

  function fire(elapsed) {
    if (!state.alive || state.isReloading || elapsed < nextShotAt) {
      return;
    }

    if (state.ammo <= 0) {
      state.message = state.reserveAmmo > 0 ? 'reload_needed' : 'out_of_ammo';
      startReload(elapsed);
      return;
    }

    state.ammo -= 1;
    state.shots += 1;
    state.lastShotAt = elapsed;
    state.message = 'firing';
    nextShotAt = elapsed + FIRE_INTERVAL;

    recoilYaw += (Math.random() - 0.5) * 0.006;
    state.recoil = Math.min(state.recoil + 0.026, 0.09);

    raycaster.setFromCamera?.(pointer, camera);
    raycaster.far = RANGE;

    const targets = normalizeTargets(world).filter(targetIsActive);
    const hits = targets.length ? raycaster.intersectObjects(targets, true) : [];
    const firstHit = hits.find((hit) => targetIsActive(findTargetRoot(hit.object, targets)));

    if (firstHit) {
      registerHit(firstHit, targets, elapsed);
    } else {
      registerMiss();
    }

    updateAccuracy();
    callOptional(hud?.onShot, state);
  }

  function handlePointerLockChange() {
    state.pointerLocked = document.pointerLockElement === canvas;

    if (!state.pointerLocked) {
      fireHeld = false;
      state.sprinting = false;
    }
  }

  function handleMouseMove(event) {
    if (document.pointerLockElement !== canvas || !state.alive) {
      return;
    }

    state.yaw -= event.movementX * MOUSE_SENSITIVITY;
    state.pitch = clamp(state.pitch - event.movementY * MOUSE_SENSITIVITY, MIN_PITCH, MAX_PITCH);
  }

  function handleMouseDown(event) {
    if (event.button !== 0 || document.pointerLockElement !== canvas) {
      return;
    }

    event.preventDefault();
    fireHeld = true;
    fire(currentElapsed);
  }

  function handleMouseUp(event) {
    if (event.button === 0) {
      fireHeld = false;
    }
  }

  function handleKeyDown(event) {
    if (event.repeat && event.code !== 'KeyR') {
      return;
    }

    keys.add(event.code);

    if (event.code === 'KeyR') {
      reloadQueued = true;
    }
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
  }

  function clearInput() {
    keys.clear();
    fireHeld = false;
    reloadQueued = false;
    state.sprinting = false;
  }

  function updateMovement(delta) {
    const forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafeAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);

    horizontalForward.set(Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize();
    right.set(horizontalForward.z * -1, 0, horizontalForward.x).normalize();

    moveInput
      .copy(horizontalForward)
      .multiplyScalar(forwardAmount)
      .addScaledVector(right, strafeAmount);

    state.moving = moveInput.lengthSq() > 0.0001;

    if (state.moving) {
      moveInput.normalize();
    }

    const wantsSprint =
      keys.has('ShiftLeft') || keys.has('ShiftRight');
    state.sprinting = wantsSprint && forwardAmount > 0 && state.moving && !state.isReloading;

    const speed = state.sprinting ? SPRINT_SPEED : MOVE_SPEED;
    const movementPenalty = forwardAmount < 0 ? 0.72 : strafeAmount !== 0 && forwardAmount === 0 ? 0.88 : 1;

    desiredVelocity.copy(moveInput).multiplyScalar(speed * movementPenalty);

    const blend = expDamp(state.moving ? ACCELERATION : FRICTION, delta);
    state.velocity.lerp(desiredVelocity, blend);
    state.position.addScaledVector(state.velocity, delta);

    const constrained = world?.constrainPlayerPosition?.(state.position, state.velocity);
    if (constrained?.isVector3) {
      state.position.copy(constrained);
    }

    applyGroundAndBounds(state.position, world);

    avatar.position.copy(state.position);
    avatar.rotation.y = state.yaw;
  }

  function updateCamera(delta, elapsed) {
    const visualPitch = clamp(state.pitch + state.recoil, MIN_PITCH, MAX_PITCH);
    aimDirection.set(
      Math.sin(state.yaw + recoilYaw) * Math.cos(visualPitch),
      Math.sin(visualPitch),
      -Math.cos(state.yaw + recoilYaw) * Math.cos(visualPitch),
    );

    horizontalForward.set(Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize();
    right.set(horizontalForward.z * -1, 0, horizontalForward.x).normalize();
    cameraFocus.copy(state.position).add(new THREE.Vector3(0, 1.35, 0));

    desiredCameraPosition
      .copy(cameraFocus)
      .addScaledVector(horizontalForward, -CAMERA_DISTANCE)
      .addScaledVector(right, SHOULDER_OFFSET);
    desiredCameraPosition.y += CAMERA_HEIGHT - state.pitch * 0.8;

    const cameraBlend = expDamp(CAMERA_SMOOTHING, delta);
    if (camera.position.lengthSq() === 0) {
      camera.position.copy(desiredCameraPosition);
    } else {
      camera.position.lerp(desiredCameraPosition, cameraBlend);
    }

    cameraJitter.set(
      Math.sin(elapsed * 85) * state.recoil * 0.05,
      Math.cos(elapsed * 97) * state.recoil * 0.035,
      0,
    );
    camera.position.add(cameraJitter);

    aimTarget.copy(cameraFocus).addScaledVector(aimDirection, 18);
    camera.lookAt(aimTarget);
  }

  function updateTimers(delta, elapsed) {
    if (state.isReloading) {
      state.reloadProgress = clamp(1 - (reloadEndsAt - elapsed) / RELOAD_TIME, 0, 1);

      if (elapsed >= reloadEndsAt) {
        finishReload();
      }
    }

    if (reloadQueued) {
      startReload(elapsed);
      reloadQueued = false;
    }

    if (fireHeld) {
      fire(elapsed);
    }

    state.hitMarker = Math.max(0, state.hitMarker - delta * 7);
    state.hitFeedback = Math.max(0, state.hitFeedback - delta * 5);
    state.damageFeedback = Math.max(0, state.damageFeedback - delta * 3);
    state.recoil *= Math.exp(-delta * 12);
    recoilYaw *= Math.exp(-delta * 14);

    restoreTargetFlashes(elapsed);
  }

  function takeDamage(amount) {
    if (!state.alive || amount <= 0) {
      return;
    }

    state.health = Math.max(0, state.health - amount);
    state.damageFeedback = 1;
    state.message = state.health > 0 ? 'damaged' : 'down';

    if (state.health <= 0) {
      state.alive = false;
      state.sprinting = false;
      fireHeld = false;
    }
  }

  function update(delta, elapsed) {
    currentElapsed = elapsed;
    state.pointerLocked = document.pointerLockElement === canvas;

    const incomingDamage = world?.consumePlayerDamage?.() ?? world?.getPlayerDamage?.(state.position) ?? 0;
    takeDamage(incomingDamage);

    if (state.alive) {
      updateMovement(delta);
      updateTimers(delta, elapsed);
    } else {
      state.velocity.multiplyScalar(Math.exp(-delta * FRICTION));
      restoreTargetFlashes(elapsed);
    }

    updateCamera(delta, elapsed);

    shotPoint.copy(camera.position);
    if (world?.state?.player) {
      world.state.player.position = state.position;
      world.state.player.health = state.health;
      world.state.player.ammo = state.ammo;
      world.state.player.combo = state.combo;
    }
  }

  document.addEventListener('pointerlockchange', handlePointerLockChange);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', clearInput);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    state,
    requestPointerLock,
    update,
    takeDamage,
  };
}
