import { LOADOUT, createEquipmentModel, isFirearm } from './arsenal.js';
import { mountExternalModel } from './modelAssets.js';
import { createAudioKit, createAudioSampler } from './audio.js';

const MOVE_SPEED = 5.4;
const SPRINT_SPEED = 8.2;
const CROUCH_SPEED = 3.1;
const ACCELERATION = 18;
const FRICTION = 16;
const AIR_ACCELERATION = 7;
const AIR_CONTROL = 0.58;
const GRAVITY = 24;
const JUMP_SPEED = 8.4;
const MOUSE_SENSITIVITY = 0.0022;
const MIN_PITCH = -0.92;
const MAX_PITCH = 0.72;

const MAGAZINE_SIZE = 30;
const RESERVE_AMMO = 90;
const RELOAD_TIME = 1.35;
const FIRE_INTERVAL = 0.11;
const WEAPON_DAMAGE = 34;
const RANGE = 85;

const CAMERA_FOV = 58;
const ADS_FOV = 42;
const CAMERA_DISTANCE = 5.8;
const CAMERA_HEIGHT = 1.55;
const SHOULDER_OFFSET = 0.72;
const CAMERA_SMOOTHING = 16;
const INSPECT_DURATION = 2.6;

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

function getGroundHeight(position, world) {
  return (
    world?.getGroundHeight?.(position.x, position.z) ??
    world?.getHeightAt?.(position.x, position.z) ??
    world?.state?.groundY ??
    0
  );
}

function applyGroundAndBounds(position, world, options = {}) {
  const groundHeight = getGroundHeight(position, world);

  if (options.snapToGround !== false) {
    position.y = groundHeight;
  }

  const bounds = getArenaBounds(world);
  if (!bounds) {
    return groundHeight;
  }

  const minX = bounds.minX ?? bounds.min?.x ?? -Infinity;
  const maxX = bounds.maxX ?? bounds.max?.x ?? Infinity;
  const minZ = bounds.minZ ?? bounds.min?.z ?? -Infinity;
  const maxZ = bounds.maxZ ?? bounds.max?.z ?? Infinity;

  position.x = clamp(position.x, minX, maxX);
  position.z = clamp(position.z, minZ, maxZ);
  return groundHeight;
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

function callOptional(fn, payload) {
  if (typeof fn === 'function') {
    fn(payload);
  }
}

function hotkeyForSlot(index, item) {
  if (item.hotkey) {
    return item.hotkey;
  }
  if (index === 0) return '1';
  if (index === 1) return '2';
  if (item.type === 'knife') return index === 5 ? '3' : 'Q';
  return String(index + 2);
}

function createAudioKitInstance() {
  const sampler = createAudioSampler();
  return createAudioKit({ sampler });
}

function createAvatar(THREE) {
  const rig = new THREE.Group();
  rig.name = 'PlayerRig';

  const fallback = new THREE.Group();
  fallback.name = 'PlayerFallbackAvatar';
  rig.add(fallback);

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
  const torsoGeometry =
    typeof THREE.CapsuleGeometry === 'function'
      ? new THREE.CapsuleGeometry(0.35, 0.92, 6, 12)
      : new THREE.CylinderGeometry(0.34, 0.38, 1.48, 12);
  const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
  torso.name = 'PlayerTorso';
  torso.position.y = 0.95;
  torso.castShadow = true;
  fallback.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), armorMaterial);
  head.name = 'PlayerHead';
  head.position.set(0, 1.78, -0.03);
  head.castShadow = true;
  fallback.add(head);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.18), armorMaterial);
  pack.name = 'PlayerPack';
  pack.position.set(0, 1.03, 0.36);
  pack.castShadow = true;
  fallback.add(pack);

  const avatarModel = new THREE.Group();
  avatarModel.name = 'PlayerExternalAvatar';
  rig.add(avatarModel);
  mountExternalModel(
    THREE,
    avatarModel,
    {
      overrideGroup: 'avatar',
      overrideKey: 'player',
      file: 'female-fighter.glb',
      maxSize: 1.82,
      alignBottom: true,
      rotation: [0, Math.PI, 0],
    },
    fallback,
  );

  const weaponSocket = new THREE.Group();
  weaponSocket.name = 'PlayerWeaponSocket';
  rig.userData.weaponSocket = weaponSocket;
  rig.add(weaponSocket);

  return rig;
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
  const cameraJitter = new THREE.Vector3();
  const pointer = new THREE.Vector2(0, 0);
  const targetFlashes = [];
  const originalMaterials = new WeakMap();
  const audio = createAudioKitInstance();
  const loadout = LOADOUT.map((item) => ({
    ...item,
    ammo: isFirearm(item) ? item.magazineSize : 0,
    reserve: isFirearm(item) ? item.reserveAmmo : 0,
  }));
  let activeEquipmentIndex = 0;

  const scene = getScene(world);
  const avatar = createAvatar(THREE);
  const spawnPoint = getSpawnPoint(world, THREE);
  const firstPersonSocket = new THREE.Group();
  firstPersonSocket.name = 'FirstPersonEquipmentSocket';
  camera.add(firstPersonSocket);

  if (scene?.add) {
    scene.add(avatar);
  }

  const state = {
    position: spawnPoint.clone(),
    velocity: new THREE.Vector3(),
    verticalVelocity: 0,
    yaw: 0,
    pitch: -0.12,
    pointerLocked: false,
    moving: false,
    sprinting: false,
    crouching: false,
    grounded: true,
    aiming: false,
    scoped: false,
    cameraMode: 'third',
    alive: true,
    maxHealth: 100,
    health: 100,
    magazineSize: loadout[0].magazineSize ?? MAGAZINE_SIZE,
    ammo: loadout[0].ammo,
    reserveAmmo: loadout[0].reserve,
    weaponName: loadout[0].name,
    equipmentType: loadout[0].type,
    activeEquipmentIndex: 0,
    equipmentSlots: loadout.map((item, index) => ({
      id: item.id,
      name: item.name,
      shortName: item.shortName,
      type: item.type,
      hotkey: hotkeyForSlot(index, item),
    })),
    isMelee: false,
    isReloading: false,
    reloadProgress: 0,
    reloadDuration: RELOAD_TIME,
    damage: loadout[0].damage ?? WEAPON_DAMAGE,
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
    fov: CAMERA_FOV,
    lastShotAt: -Infinity,
    lastHitAt: -Infinity,
    lastHit: null,
    message: 'ready',
    isInspecting: false,
    inspectProgress: 0,
    inspectDuration: 2.6,
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
  let lastWheelSwitchAt = 0;
  let inspectEndsAt = 0;

  function activeEquipment() {
    return loadout[activeEquipmentIndex];
  }

  function clearGroup(group) {
    while (group.children.length) {
      group.remove(group.children[0]);
    }
  }

  function syncStateFromEquipment() {
    const item = activeEquipment();
    state.magazineSize = item.magazineSize ?? 1;
    state.ammo = item.ammo ?? 0;
    state.reserveAmmo = item.reserve ?? 0;
    state.weaponName = item.name;
    state.equipmentType = item.type;
    state.isMelee = item.type === 'knife';
    state.damage = item.damage ?? WEAPON_DAMAGE;
    state.activeEquipmentIndex = activeEquipmentIndex;
    state.equipmentSlots = loadout.map((entry, index) => ({
      id: entry.id,
      name: entry.name,
      shortName: entry.shortName,
      type: entry.type,
      hotkey: hotkeyForSlot(index, entry),
    }));
  }

  function saveEquipmentAmmo() {
    const item = activeEquipment();
    if (!isFirearm(item)) {
      return;
    }

    item.ammo = state.ammo;
    item.reserve = state.reserveAmmo;
  }

  function refreshEquipmentModels() {
    const item = activeEquipment();
    const thirdSocket = avatar.userData.weaponSocket ?? avatar;
    clearGroup(firstPersonSocket);
    clearGroup(thirdSocket);
    firstPersonSocket.add(createEquipmentModel(THREE, item, 'first'));
    thirdSocket.add(createEquipmentModel(THREE, item, 'third'));
    updateViewVisibility();
  }

  function requestInspect(elapsed) {
    if (!state.alive || state.isInspecting) {
      return;
    }
    state.isInspecting = true;
    state.inspectProgress = 0;
    state.inspectDuration = INSPECT_DURATION;
    inspectEndsAt = elapsed + INSPECT_DURATION;
    audio.inspect(activeEquipment().id);
    state.message = 'inspecting';
    callOptional(hud?.flashMessage, 'Inspecting weapon');
  }

  // Drives the procedural inspect animation on the first-person weapon socket.
  // Firearms get a full Y-axis turn + lift toward center; knives spin around
  // the blade axis. All easing is sine-based so the start/end are gentle.
  function updateInspect(delta, elapsed) {
    if (!state.isInspecting) {
      return;
    }

    if (elapsed >= inspectEndsAt) {
      state.isInspecting = false;
      state.inspectProgress = 0;
      state.message = 'ready';
      return;
    }

    const progress = clamp(1 - (inspectEndsAt - elapsed) / state.inspectDuration, 0, 1);
    state.inspectProgress = progress;

    const item = activeEquipment();
    const isKnife = item.type === 'knife';

    if (isKnife) {
      // Spin the blade around its long (Y) axis so the edge faces the player.
      const spin = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
      firstPersonSocket.rotation.x = spin * Math.PI * 2;
      firstPersonSocket.rotation.y = -0.28 + spin * 0.5;
      firstPersonSocket.position.z = spin * 0.12;
    } else {
      // Firearm: one full Y turn + slight lift and centre pull.
      const lift = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
      const turn = progress * Math.PI * 2;
      firstPersonSocket.rotation.y = -0.16 + turn;
      firstPersonSocket.rotation.z = 0.02 + Math.sin(progress * Math.PI * 2) * 0.06;
      firstPersonSocket.position.x = lift * -0.18; // pull toward centre
      firstPersonSocket.position.y = lift * 0.12; // raise slightly
      firstPersonSocket.position.z = lift * 0.08; // bring closer to face
    }
  }

  function updateViewVisibility() {
    const firstPerson = state.cameraMode === 'first';
    avatar.visible = !firstPerson;
    firstPersonSocket.visible = firstPerson;
  }

  function setAiming(active) {
    const item = activeEquipment();
    const nextAiming = Boolean(active && isFirearm(item) && state.alive);
    state.aiming = nextAiming;
    state.scoped = nextAiming && item.type === 'sniper';

    if (state.scoped) {
      state.message = 'scope_in';
    } else if (state.aiming) {
      state.message = 'aim_down_sights';
    }
  }

  function switchEquipment(index) {
    const nextIndex = ((index % loadout.length) + loadout.length) % loadout.length;
    if (nextIndex === activeEquipmentIndex) {
      return;
    }

    if (state.isInspecting) {
      state.isInspecting = false;
      state.inspectProgress = 0;
    }

    saveEquipmentAmmo();
    setAiming(false);
    activeEquipmentIndex = nextIndex;
    state.isReloading = false;
    state.reloadProgress = 0;
    syncStateFromEquipment();
    refreshEquipmentModels();
    audio.equip(state.isMelee);
    state.message = state.isMelee ? 'knife_ready' : 'weapon_ready';
    callOptional(hud?.flashMessage, `${state.weaponName} ready`);
  }

  function switchToKnife() {
    const knifeIndexes = loadout
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === 'knife')
      .map(({ index }) => index);

    if (!knifeIndexes.length) {
      return;
    }

    if (!knifeIndexes.includes(activeEquipmentIndex)) {
      switchEquipment(knifeIndexes[0]);
      return;
    }

    const currentKnife = knifeIndexes.indexOf(activeEquipmentIndex);
    switchEquipment(knifeIndexes[(currentKnife + 1) % knifeIndexes.length]);
  }

  function switchEquipmentRelative(direction) {
    if (!direction) {
      return;
    }

    switchEquipment(activeEquipmentIndex + (direction > 0 ? 1 : -1));
  }

  function toggleCameraMode() {
    state.cameraMode = state.cameraMode === 'first' ? 'third' : 'first';
    updateViewVisibility();
    callOptional(hud?.flashMessage, state.cameraMode === 'first' ? 'First person' : 'Third person');
    return state.cameraMode;
  }

  syncStateFromEquipment();
  refreshEquipmentModels();

  function requestPointerLock() {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  }

  function startReload(elapsed) {
    const item = activeEquipment();
    if (!isFirearm(item) || state.isReloading || state.ammo >= state.magazineSize || state.reserveAmmo <= 0) {
      return;
    }

    state.isReloading = true;
    state.reloadProgress = 0;
    state.reloadDuration = item.reloadTime ?? RELOAD_TIME;
    state.message = 'reloading';
    reloadEndsAt = elapsed + state.reloadDuration;
    audio.reload();
    callOptional(hud?.onReloadStart, state);
  }

  function finishReload() {
    const item = activeEquipment();
    const needed = state.magazineSize - state.ammo;
    const loaded = Math.min(needed, state.reserveAmmo);

    state.ammo += loaded;
    state.reserveAmmo -= loaded;
    item.ammo = state.ammo;
    item.reserve = state.reserveAmmo;
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
    const item = activeEquipment();
    const damage = item.damage ?? WEAPON_DAMAGE;
    const worldHit = world?.registerHit?.(target, {
      damage,
      point: hit.point,
      object: hit.object,
      weapon: item,
      player: state,
    });

    if (worldHit && typeof worldHit === 'object') {
      const accepted = worldHit.hit !== false;
      const eliminated = accepted && worldHit.eliminated !== false;

      if (accepted) {
        if (eliminated) {
          state.kills += 1;
        }
        state.score = worldHit.score ?? world?.state?.score ?? state.score + (eliminated ? 100 : 25);
      }

      return {
        accepted,
        eliminated,
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

    data.health = Math.max(0, data.health - damage);
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
      damage,
      health: data.health,
      eliminated,
      point: hit.point,
      object: hit.object,
      target,
      player: state,
    });
    callOptional(world?.onTargetHit, {
      damage,
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
      return hitResult;
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
      targetName: target.name || target.id || hit.object.name || 'target',
    };
    state.message = eliminated ? 'target_down' : 'hit';

    if (!hitResult.handledByWorld) {
      queueTargetFlash(target, elapsed);
    }

    audio.hit(eliminated);
    callOptional(hud?.onHit, state.lastHit);
    callOptional(hud?.showHit, eliminated ? 'DOWN' : 'HIT');
    return hitResult;
  }

  function registerMiss() {
    state.misses += 1;
    state.combo = 0;
    state.lastHit = null;
    state.message = 'miss';
    callOptional(hud?.onMiss, state);
  }

  function fire(elapsed) {
    const item = activeEquipment();
    if (!state.alive || state.isReloading || state.isInspecting || elapsed < nextShotAt) {
      return;
    }

    if (item.type === 'knife') {
      state.shots += 1;
      state.lastShotAt = elapsed;
      state.message = 'knife_swing';
      nextShotAt = elapsed + (item.fireInterval ?? 0.45);
      state.recoil = Math.min(state.recoil + (item.recoil ?? 0.014), 0.06);
      audio.knife();

      raycaster.setFromCamera?.(pointer, camera);
      raycaster.far = item.range ?? 3.8;

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
      return;
    }

    if (state.ammo <= 0) {
      state.message = state.reserveAmmo > 0 ? 'reload_needed' : 'out_of_ammo';
      startReload(elapsed);
      return;
    }

    state.ammo -= 1;
    item.ammo = state.ammo;
    state.shots += 1;
    state.lastShotAt = elapsed;
    state.message = item.id === 'destroyer-sniper' ? 'destroyer_fire' : item.type === 'sniper' ? 'sniper_fire' : 'firing';
    nextShotAt = elapsed + (item.fireInterval ?? FIRE_INTERVAL);

    recoilYaw += (Math.random() - 0.5) * (item.id === 'destroyer-sniper' ? 0.02 : item.type === 'sniper' ? 0.012 : 0.006);
    state.recoil = Math.min(state.recoil + (item.recoil ?? 0.026), item.id === 'destroyer-sniper' ? 0.22 : item.type === 'sniper' ? 0.16 : 0.1);
    audio.shot(item);

    raycaster.setFromCamera?.(pointer, camera);
    raycaster.far = item.range ?? RANGE;

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
      setAiming(false);
    }
  }

  function handleMouseMove(event) {
    if (document.pointerLockElement !== canvas || !state.alive) {
      return;
    }

    state.yaw += event.movementX * MOUSE_SENSITIVITY;
    state.pitch = clamp(state.pitch - event.movementY * MOUSE_SENSITIVITY, MIN_PITCH, MAX_PITCH);
  }

  function handleMouseDown(event) {
    if (document.pointerLockElement !== canvas) {
      return;
    }

    event.preventDefault();

    if (event.button === 0) {
      fireHeld = true;
      fire(currentElapsed);
    }

    if (event.button === 2) {
      setAiming(true);
    }
  }

  function handleMouseUp(event) {
    if (event.button === 0) {
      fireHeld = false;
    }

    if (event.button === 2) {
      setAiming(false);
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

    if (event.code === 'KeyV') {
      toggleCameraMode();
    }

    if (event.code === 'KeyF') {
      requestInspect(currentElapsed);
    }

    if (event.code === 'KeyQ' || event.code === 'Digit3') {
      switchToKnife();
      return;
    }

    const digitMap = {
      Digit1: 0,
      Digit2: 1,
      Digit4: 2,
      Digit5: 3,
      Digit6: 4,
      Digit7: 5,
    };

    if (digitMap[event.code] !== undefined) {
      switchEquipment(digitMap[event.code]);
    }
  }

  function handleWheel(event) {
    if (document.pointerLockElement !== canvas || !state.alive) {
      return;
    }

    const now = performance.now();
    if (now - lastWheelSwitchAt < 120 || Math.abs(event.deltaY) < 1) {
      return;
    }

    event.preventDefault();
    lastWheelSwitchAt = now;
    switchEquipmentRelative(event.deltaY > 0 ? 1 : -1);
  }

  function handleEquipmentSelect(event) {
    const index = Number(event.detail?.index);
    if (!Number.isInteger(index)) {
      return;
    }

    switchEquipment(index);
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
  }

  function clearInput() {
    keys.clear();
    fireHeld = false;
    reloadQueued = false;
    state.sprinting = false;
    setAiming(false);
    if (state.isInspecting) {
      state.isInspecting = false;
      state.inspectProgress = 0;
    }
  }

  function updateMovement(delta) {
    const forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafeAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const groundY = getGroundHeight(state.position, world);

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

    const wantsSprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    state.crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    state.sprinting = wantsSprint && forwardAmount > 0 && state.moving && state.grounded && !state.crouching && !state.isReloading && !state.aiming;

    const baseSpeed = state.crouching ? CROUCH_SPEED : state.sprinting ? SPRINT_SPEED : MOVE_SPEED;
    const aimPenalty = state.aiming ? 0.54 : 1;
    const movementPenalty = forwardAmount < 0 ? 0.72 : strafeAmount !== 0 && forwardAmount === 0 ? 0.88 : 1;
    const airbornePenalty = state.grounded ? 1 : AIR_CONTROL;
    const speed = baseSpeed * movementPenalty * airbornePenalty * aimPenalty;

    desiredVelocity.copy(moveInput).multiplyScalar(speed);

    if ((keys.has('Space') || keys.has('KeyX')) && state.grounded && !state.crouching) {
      state.verticalVelocity = JUMP_SPEED;
      state.grounded = false;
      state.message = 'jump';
    }

    const blend = expDamp(state.grounded ? (state.moving ? ACCELERATION : FRICTION) : AIR_ACCELERATION, delta);
    state.velocity.lerp(desiredVelocity, blend);
    state.position.addScaledVector(state.velocity, delta);
    state.verticalVelocity -= GRAVITY * delta;
    state.position.y += state.verticalVelocity * delta;

    const constrained = world?.constrainPlayerPosition?.(state.position, state.velocity);
    if (constrained?.isVector3) {
      state.position.copy(constrained);
    }

    applyGroundAndBounds(state.position, world, { snapToGround: false });

    if (state.position.y <= groundY) {
      state.position.y = groundY;
      state.verticalVelocity = 0;
      state.grounded = true;
    } else {
      state.grounded = false;
    }

    avatar.position.copy(state.position);
    avatar.rotation.y = state.yaw;
  }

  function updateCamera(delta, elapsed) {
    const item = activeEquipment();
    const visualPitch = clamp(state.pitch + state.recoil, MIN_PITCH, MAX_PITCH);
    aimDirection.set(
      Math.sin(state.yaw + recoilYaw) * Math.cos(visualPitch),
      Math.sin(visualPitch),
      -Math.cos(state.yaw + recoilYaw) * Math.cos(visualPitch),
    );

    horizontalForward.set(Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize();
    right.set(horizontalForward.z * -1, 0, horizontalForward.x).normalize();
    const eyeHeight = state.crouching ? 1.05 : 1.52;
    cameraFocus.copy(state.position).add(new THREE.Vector3(0, eyeHeight, 0));

    if (state.cameraMode === 'first') {
      desiredCameraPosition.copy(cameraFocus).addScaledVector(horizontalForward, 0.12);
    } else {
      const thirdPersonDistance = state.aiming ? CAMERA_DISTANCE * 0.78 : CAMERA_DISTANCE;
      desiredCameraPosition
        .copy(cameraFocus)
        .addScaledVector(horizontalForward, -thirdPersonDistance)
        .addScaledVector(right, state.aiming ? SHOULDER_OFFSET * 0.72 : SHOULDER_OFFSET);
      desiredCameraPosition.y += CAMERA_HEIGHT - state.pitch * 0.8;
    }

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

    const bobAmount = state.moving ? 1 : 0.35;
    const adsBlend = state.aiming ? 1 : 0;
    firstPersonSocket.position.x = Math.sin(elapsed * 7.5) * 0.012 * bobAmount - adsBlend * 0.2;
    firstPersonSocket.position.y = Math.abs(Math.cos(elapsed * 7.5)) * 0.018 * bobAmount - state.recoil * 0.55 + adsBlend * 0.07;
    firstPersonSocket.rotation.z = Math.sin(elapsed * 5.2) * 0.018 * bobAmount;
    updateViewVisibility();

    const targetFov = state.scoped
      ? item.scopedFov ?? 18
      : state.aiming
        ? item.adsFov ?? ADS_FOV
        : CAMERA_FOV;
    camera.fov += (targetFov - camera.fov) * expDamp(18, delta);
    camera.updateProjectionMatrix();
    state.fov = camera.fov;

    aimTarget.copy(cameraFocus).addScaledVector(aimDirection, 18);
    camera.lookAt(aimTarget);
  }

  function updateTimers(delta, elapsed) {
    if (state.isReloading) {
      state.reloadProgress = clamp(1 - (reloadEndsAt - elapsed) / state.reloadDuration, 0, 1);

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
    audio.damage();

    if (state.health <= 0) {
      state.alive = false;
      state.sprinting = false;
      fireHeld = false;
      setAiming(false);
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
    updateInspect(delta, elapsed);

    if (world?.state?.player) {
      world.state.player.position = state.position;
      world.state.player.health = state.health;
      world.state.player.pointerLocked = state.pointerLocked;
      world.state.player.ammo = state.ammo;
      world.state.player.combo = state.combo;
      world.state.player.cameraMode = state.cameraMode;
      world.state.player.weaponName = state.weaponName;
      world.state.player.grounded = state.grounded;
      world.state.player.aiming = state.aiming;
      world.state.player.scoped = state.scoped;
    }
  }

  document.addEventListener('pointerlockchange', handlePointerLockChange);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', clearInput);
  document.addEventListener('fpsgame:equip', handleEquipmentSelect);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    state,
    requestPointerLock,
    toggleCameraMode,
    switchEquipment,
    update,
    takeDamage,
  };
}
