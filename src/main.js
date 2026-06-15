import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayerController } from './player.js';
import { createHud } from './ui.js';
import './styles.css';

const canvas = document.querySelector('#game');
const startButton = document.querySelector('#startButton');
const cameraToggleButton = document.querySelector('#cameraToggleButton');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11161c);
scene.fog = new THREE.Fog(0x11161c, 32, 92);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 180);
scene.add(camera);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const hud = createHud(document.querySelector('#hud'));
const world = createWorld({ scene, THREE });
const player = createPlayerController({
  camera,
  canvas,
  hud,
  raycaster,
  world,
  THREE,
});

startButton.addEventListener('click', () => {
  player.requestPointerLock();
  startButton.classList.add('hidden');
});

cameraToggleButton.addEventListener('click', () => {
  const mode = player.toggleCameraMode();
  cameraToggleButton.textContent = mode === 'first' ? '第一人称' : '第三人称';
});

document.addEventListener('pointerlockchange', () => {
  startButton.classList.toggle('hidden', document.pointerLockElement === canvas);
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.045);
  const elapsed = clock.elapsedTime;

  world.update(delta, elapsed);
  player.update(delta, elapsed);
  hud.update(player.state, world.state);
  cameraToggleButton.textContent = player.state.cameraMode === 'first' ? '第一人称' : '第三人称';

  renderer.render(scene, camera);
}

animate();
