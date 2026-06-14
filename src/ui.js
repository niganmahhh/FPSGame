const DEFAULT_MESSAGE = 'Acquire targets, keep moving, and clear the lane.';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function pick(source, paths, fallback) {
  for (const path of paths) {
    const value = path.split('.').reduce((target, key) => target?.[key], source);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return fallback;
}

function numberFrom(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function percent(value, maxValue) {
  if (maxValue <= 0) {
    return 0;
  }

  return clamp((value / maxValue) * 100, 0, 100);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return '--:--';
  }

  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function buildMeter(labelText) {
  const element = make('div', 'hud-meter');
  const header = make('div', 'hud-meter__header');
  const label = make('span', 'hud-meter__label', labelText);
  const value = make('span', 'hud-meter__value', '100');
  const track = make('div', 'hud-meter__track');
  const fill = make('div', 'hud-meter__fill');

  header.append(label, value);
  track.append(fill);
  element.append(header, track);

  return { element, fill, value };
}

function readHudState(playerState = {}, worldState = {}) {
  const health = numberFrom(pick(playerState, ['health', 'hp', 'vitals.health'], 100), 100);
  const maxHealth = numberFrom(pick(playerState, ['maxHealth', 'maxHp', 'vitals.maxHealth'], 100), 100);
  const armor = numberFrom(pick(playerState, ['armor', 'shield', 'vitals.armor'], 0), 0);
  const maxArmor = numberFrom(pick(playerState, ['maxArmor', 'maxShield', 'vitals.maxArmor'], 100), 100);
  const ammo = numberFrom(pick(playerState, ['ammo', 'magAmmo', 'currentAmmo', 'weapon.ammo'], 30), 30);
  const magSize = numberFrom(pick(playerState, ['magazineSize', 'magSize', 'weapon.magazineSize', 'weapon.magSize'], 30), 30);
  const reserve = numberFrom(pick(playerState, ['reserveAmmo', 'ammoReserve', 'weapon.reserveAmmo'], 90), 90);
  const score = numberFrom(pick(worldState, ['score', 'points'], pick(playerState, ['score'], 0)), 0);
  const wave = numberFrom(pick(worldState, ['wave', 'stage', 'round'], 1), 1);
  const elapsed = numberFrom(pick(worldState, ['elapsed', 'time', 'elapsedTime'], NaN), NaN);
  const timeRemaining = numberFrom(pick(worldState, ['timeRemaining', 'remainingTime', 'timer'], NaN), NaN);
  const rawTotal = pick(worldState, ['totalTargets', 'targetTotal', 'targetsTotal', 'objective.total'], undefined);
  const rawCleared = pick(
    worldState,
    ['clearedTargets', 'targetsCleared', 'hitTargets', 'targetsHit', 'hits', 'inactiveTargets', 'objective.cleared'],
    undefined,
  );
  const totalTargets = numberFrom(rawTotal, numberFrom(pick(playerState, ['totalTargets'], 0), 0));
  const clearedTargets = numberFrom(rawCleared, numberFrom(pick(playerState, ['targetsHit', 'kills'], 0), 0));
  const progressValue = pick(worldState, ['progress', 'targetProgress', 'objective.progress'], undefined);
  const progress = progressValue !== undefined
    ? clamp(numberFrom(progressValue, 0) <= 1 ? numberFrom(progressValue, 0) * 100 : numberFrom(progressValue, 0), 0, 100)
    : percent(clearedTargets, totalTargets || 1);
  const pointerLocked = Boolean(
    pick(playerState, ['pointerLocked', 'isPointerLocked', 'mouseLocked', 'controlsLocked'], document.pointerLockElement),
  );
  const paused = Boolean(pick(playerState, ['paused', 'isPaused'], pick(worldState, ['paused', 'isPaused'], false)));
  const isAlive = pick(playerState, ['alive', 'isAlive'], health > 0) !== false && health > 0;

  return {
    health,
    maxHealth,
    armor,
    maxArmor,
    ammo,
    magSize,
    reserve,
    score,
    wave,
    elapsed,
    timeRemaining,
    totalTargets,
    clearedTargets,
    progress,
    pointerLocked,
    paused,
    isAlive,
    objective: pick(worldState, ['objectiveName', 'objective.title', 'mission'], 'Killhouse Training'),
    weaponName: pick(playerState, ['weaponName', 'weapon.name', 'loadout.primary'], 'CARBINE'),
  };
}

export function createHud(root) {
  if (!root) {
    throw new Error('createHud requires a root element.');
  }

  root.textContent = '';
  root.classList.add('hud-root');

  const shell = make('div', 'hud-shell');
  const vignette = make('div', 'hud-vignette');
  const firstScreen = make('section', 'hud-first-screen');
  const firstContent = make('div', 'hud-first-screen__content');
  const firstKicker = make('p', 'hud-kicker', 'LIVE FIRE MODULE');
  const firstTitle = make('h1', 'hud-title', 'Dynamic Entry Range');
  const firstCopy = make('p', 'hud-copy', 'Lock mouse control, clear all marked targets, and keep your vitals above zero.');
  const firstStats = make('div', 'hud-first-screen__stats');

  [
    ['MODE', 'TRAINING'],
    ['LOADOUT', 'CARBINE'],
    ['OBJECTIVE', 'CLEAR LANE'],
  ].forEach(([label, value]) => {
    const stat = make('div', 'hud-stat');
    stat.append(make('span', 'hud-stat__label', label), make('strong', 'hud-stat__value', value));
    firstStats.append(stat);
  });

  firstContent.append(firstKicker, firstTitle, firstCopy, firstStats);
  firstScreen.append(firstContent);

  const topBar = make('div', 'hud-topbar');
  const objective = make('section', 'hud-objective');
  const objectiveLabel = make('span', 'hud-panel-label', 'OBJECTIVE');
  const objectiveTitle = make('strong', 'hud-objective__title', 'Killhouse Training');
  const objectiveMeta = make('span', 'hud-objective__meta', '0 / 0 targets');
  const objectiveTrack = make('div', 'hud-objective__track');
  const objectiveFill = make('div', 'hud-objective__fill');
  objectiveTrack.append(objectiveFill);
  objective.append(objectiveLabel, objectiveTitle, objectiveMeta, objectiveTrack);

  const missionStats = make('section', 'hud-mission-stats');
  const scoreValue = make('strong', 'hud-mission-stats__value', '0');
  const waveValue = make('strong', 'hud-mission-stats__value', '1');
  const timerValue = make('strong', 'hud-mission-stats__value', '--:--');

  [
    ['SCORE', scoreValue],
    ['WAVE', waveValue],
    ['TIME', timerValue],
  ].forEach(([label, value]) => {
    const item = make('div', 'hud-mission-stats__item');
    item.append(make('span', 'hud-panel-label', label), value);
    missionStats.append(item);
  });

  topBar.append(objective, missionStats);

  const crosshair = make('div', 'hud-crosshair');
  ['top', 'right', 'bottom', 'left'].forEach((part) => {
    crosshair.append(make('span', `hud-crosshair__line hud-crosshair__line--${part}`));
  });
  crosshair.append(make('span', 'hud-crosshair__dot'));

  const message = make('div', 'hud-message', DEFAULT_MESSAGE);
  const hitMarker = make('div', 'hud-hit-marker');
  hitMarker.append(make('span', 'hud-hit-marker__text', 'HIT'));
  const eventFeed = make('div', 'hud-event-feed');

  const bottomBar = make('div', 'hud-bottombar');
  const vitals = make('section', 'hud-vitals');
  const healthMeter = buildMeter('HEALTH');
  const armorMeter = buildMeter('ARMOR');
  vitals.append(healthMeter.element, armorMeter.element);

  const ammoPanel = make('section', 'hud-ammo');
  const weaponName = make('span', 'hud-panel-label', 'CARBINE');
  const ammoWrap = make('div', 'hud-ammo__count');
  const ammoValue = make('strong', 'hud-ammo__mag', '30');
  const reserveValue = make('span', 'hud-ammo__reserve', '/ 90');
  ammoWrap.append(ammoValue, reserveValue);
  const ammoTrack = make('div', 'hud-ammo__track');
  const ammoFill = make('div', 'hud-ammo__fill');
  ammoTrack.append(ammoFill);
  ammoPanel.append(weaponName, ammoWrap, ammoTrack);

  bottomBar.append(vitals, ammoPanel);

  const lockPanel = make('section', 'hud-lock-panel');
  const lockTitle = make('strong', 'hud-lock-panel__title', 'MOUSE UNLOCKED');
  const lockText = make('span', 'hud-lock-panel__text', 'Use the entry control to resume weapon handling.');
  lockPanel.append(lockTitle, lockText);

  shell.append(
    vignette,
    firstScreen,
    topBar,
    crosshair,
    message,
    hitMarker,
    eventFeed,
    bottomBar,
    lockPanel,
  );
  root.append(shell);

  let manualMessage = '';
  let transientMessage = '';
  let hasStarted = Boolean(document.pointerLockElement);
  let hitTimer = 0;
  let messageTimer = 0;
  let shotTimer = 0;
  let lastState = readHudState();

  function render(state) {
    lastState = state;
    if (state.pointerLocked) {
      hasStarted = true;
    }

    const locked = state.pointerLocked && state.isAlive && !state.paused;
    root.dataset.locked = String(locked);
    root.dataset.paused = String(state.paused || !state.isAlive);
    root.dataset.started = String(hasStarted);

    objectiveTitle.textContent = state.objective;
    objectiveMeta.textContent = `${state.clearedTargets} / ${state.totalTargets || 0} targets`;
    objectiveFill.style.width = `${state.progress}%`;
    scoreValue.textContent = String(Math.round(state.score));
    waveValue.textContent = String(Math.max(1, Math.round(state.wave)));
    timerValue.textContent = Number.isFinite(state.timeRemaining) ? formatTime(state.timeRemaining) : formatTime(state.elapsed);

    healthMeter.value.textContent = `${Math.round(state.health)}`;
    healthMeter.fill.style.width = `${percent(state.health, state.maxHealth)}%`;
    armorMeter.value.textContent = `${Math.round(state.armor)}`;
    armorMeter.fill.style.width = `${percent(state.armor, state.maxArmor)}%`;
    weaponName.textContent = state.weaponName;
    ammoValue.textContent = String(Math.max(0, Math.round(state.ammo)));
    reserveValue.textContent = `/ ${Math.max(0, Math.round(state.reserve))}`;
    ammoFill.style.width = `${percent(state.ammo, state.magSize)}%`;

    const criticalHealth = state.health <= state.maxHealth * 0.3;
    vitals.dataset.critical = String(criticalHealth);
    ammoPanel.dataset.low = String(state.ammo <= Math.max(1, state.magSize * 0.25));
    firstScreen.dataset.visible = String(!hasStarted && !state.pointerLocked);
    lockPanel.dataset.visible = String(hasStarted && (!state.pointerLocked || state.paused || !state.isAlive));

    if (!state.isAlive) {
      lockTitle.textContent = 'OPERATOR DOWN';
      lockText.textContent = 'Await reset or respawn to continue the drill.';
    } else if (state.paused) {
      lockTitle.textContent = 'PAUSED';
      lockText.textContent = 'Resume to continue the training run.';
    } else {
      lockTitle.textContent = 'MOUSE UNLOCKED';
      lockText.textContent = 'Use the entry control to resume weapon handling.';
    }

    if (manualMessage) {
      message.textContent = manualMessage;
    } else if (transientMessage) {
      message.textContent = transientMessage;
    } else if (!hasStarted && !state.pointerLocked) {
      message.textContent = 'Press the entry control to begin.';
    } else if (!state.pointerLocked) {
      message.textContent = 'Mouse control released.';
    } else if (state.progress >= 100 && state.totalTargets > 0) {
      message.textContent = 'Course clear. Stand by for the next lane.';
    } else if (criticalHealth) {
      message.textContent = 'Critical health. Break line of sight and recover.';
    } else {
      message.textContent = DEFAULT_MESSAGE;
    }
  }

  function showHit(text = 'HIT') {
    const label = String(text || 'HIT').toUpperCase();
    const isDown = label.includes('DOWN') || label.includes('KILL') || label.includes('ELIM');
    const line = make('div', isDown ? 'hud-event-line hud-event-line--down' : 'hud-event-line', label);

    hitMarker.querySelector('.hud-hit-marker__text').textContent = label;
    hitMarker.dataset.active = 'false';
    hitMarker.dataset.down = String(isDown);
    window.clearTimeout(hitTimer);

    requestAnimationFrame(() => {
      hitMarker.dataset.active = 'true';
    });

    hitTimer = window.setTimeout(() => {
      hitMarker.dataset.active = 'false';
    }, 360);

    eventFeed.prepend(line);
    window.setTimeout(() => line.remove(), isDown ? 2200 : 1500);

    while (eventFeed.children.length > 5) {
      eventFeed.lastElementChild?.remove();
    }
  }

  function setMessage(text = '') {
    manualMessage = String(text || '');
    render(lastState);
  }

  function flashMessage(text, duration = 900) {
    transientMessage = String(text || '');
    window.clearTimeout(messageTimer);
    render(lastState);

    if (transientMessage) {
      messageTimer = window.setTimeout(() => {
        transientMessage = '';
        render(lastState);
      }, duration);
    }
  }

  function update(playerState = {}, worldState = {}) {
    render(readHudState(playerState, worldState));
  }

  function handlePointerLockChange() {
    render({ ...lastState, pointerLocked: Boolean(document.pointerLockElement) });
  }

  document.addEventListener('pointerlockchange', handlePointerLockChange);
  render(lastState);

  return {
    update,
    showHit,
    setMessage,
    onShot() {
      root.dataset.shot = 'true';
      window.clearTimeout(shotTimer);
      shotTimer = window.setTimeout(() => {
        root.dataset.shot = 'false';
      }, 85);
    },
    onMiss() {
      flashMessage('Miss. Re-center and fire controlled pairs.', 650);
    },
    onHit(hit) {
      if (hit?.targetName) {
        flashMessage(`${hit.targetName} tagged.`, 700);
      }
    },
    onReloadStart() {
      ammoPanel.dataset.reloading = 'true';
      flashMessage('Reloading...', 1200);
    },
    onReloadEnd() {
      ammoPanel.dataset.reloading = 'false';
      flashMessage('Weapon ready.', 850);
    },
    setPaused(paused) {
      render({ ...lastState, paused: Boolean(paused) });
    },
    destroy() {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.clearTimeout(hitTimer);
      window.clearTimeout(messageTimer);
      window.clearTimeout(shotTimer);
      root.textContent = '';
      root.classList.remove('hud-root');
    },
  };
}
