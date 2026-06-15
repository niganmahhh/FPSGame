import { mountExternalModel } from './modelAssets.js';

export const LOADOUT = [
  {
    id: 'ak-classic',
    type: 'rifle',
    name: 'AK-47 Classic',
    shortName: 'AK',
    hotkey: '1',
    magazineSize: 30,
    reserveAmmo: 90,
    fireInterval: 0.115,
    reloadTime: 1.35,
    damage: 36,
    range: 88,
    recoil: 0.032,
    asset: {
      file: 'cc0-ak47.glb',
      maxSize: 2.15,
      rotation: [0, Math.PI, 0],
    },
    palette: {
      body: 0x3a2d23,
      metal: 0x20272b,
      accent: 0xb07a38,
      glow: 0xffc15a,
    },
  },
  {
    id: 'm4-tactical',
    type: 'rifle',
    name: 'M4A1 Tactical',
    shortName: 'M4',
    hotkey: '2',
    magazineSize: 30,
    reserveAmmo: 120,
    fireInterval: 0.095,
    reloadTime: 1.2,
    damage: 31,
    range: 94,
    recoil: 0.022,
    asset: {
      file: 'cc0-m4a1.glb',
      maxSize: 2.12,
      rotation: [0, Math.PI, 0],
    },
    palette: {
      body: 0x263540,
      metal: 0x11191f,
      accent: 0x7b8c95,
      glow: 0x70c7ff,
    },
  },
  {
    id: 'blackout-sniper',
    type: 'sniper',
    name: 'Blackout Heavy Sniper',
    shortName: 'SNIPER',
    hotkey: '4',
    magazineSize: 5,
    reserveAmmo: 25,
    fireInterval: 1.05,
    reloadTime: 1.75,
    damage: 135,
    range: 145,
    recoil: 0.075,
    adsFov: 38,
    scopedFov: 17,
    asset: {
      file: 'cc0-sniper.glb',
      maxSize: 2.45,
      rotation: [0, Math.PI, 0],
    },
    palette: {
      body: 0x141a20,
      metal: 0x0d1013,
      accent: 0xd2b166,
      glow: 0xffcf66,
    },
  },
  {
    id: 'storm-m4',
    type: 'rifle',
    name: 'Thunder M4 Prototype',
    shortName: 'STORM',
    hotkey: '5',
    magazineSize: 30,
    reserveAmmo: 120,
    fireInterval: 0.088,
    reloadTime: 1.15,
    damage: 32,
    range: 96,
    recoil: 0.018,
    asset: {
      file: 'cc0-m4a1.glb',
      maxSize: 2.16,
      rotation: [0, Math.PI, 0],
    },
    palette: {
      body: 0x182237,
      metal: 0x0a111a,
      accent: 0x45d7ff,
      glow: 0x7df2ff,
    },
  },
  {
    id: 'ember-ak',
    type: 'rifle',
    name: 'Ember Beast AK',
    shortName: 'EMBER',
    hotkey: '6',
    magazineSize: 35,
    reserveAmmo: 105,
    fireInterval: 0.108,
    reloadTime: 1.35,
    damage: 34,
    range: 86,
    recoil: 0.03,
    asset: {
      file: 'cc0-ak47.glb',
      maxSize: 2.18,
      rotation: [0, Math.PI, 0],
    },
    palette: {
      body: 0x3b1510,
      metal: 0x1a1614,
      accent: 0xff6b35,
      glow: 0xffb000,
    },
  },
  {
    id: 'dragon-blade',
    type: 'knife',
    name: 'Dragon Blade',
    shortName: 'DRAGON',
    hotkey: '3',
    fireInterval: 0.52,
    damage: 120,
    range: 4.2,
    recoil: 0.018,
    asset: {
      file: 'butcher-knife.glb',
      maxSize: 1.45,
      rotation: [-0.15, 0, -0.62],
    },
    palette: {
      body: 0x312018,
      metal: 0xd7b66a,
      accent: 0xff4d2e,
      glow: 0xff8f2f,
    },
  },
  {
    id: 'butterfly-knife',
    type: 'knife',
    name: 'Butterfly Knife',
    shortName: 'BUTTER',
    hotkey: 'Q',
    fireInterval: 0.42,
    damage: 95,
    range: 3.7,
    recoil: 0.014,
    palette: {
      body: 0x1d2631,
      metal: 0xcbd7df,
      accent: 0x9b7cff,
      glow: 0xb5a1ff,
    },
  },
];

export function isFirearm(item) {
  return item?.type !== 'knife';
}

function makeMaterial(THREE, color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.58,
    metalness: options.metalness ?? 0.22,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function addBox(THREE, root, material, position, scale, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addCylinder(THREE, root, material, position, radius, depth, name) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 18), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addBlade(THREE, root, material, position, scale, name) {
  const geometry = new THREE.ConeGeometry(0.18, 1.25, 4);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.x = Math.PI / 2;
  mesh.rotation.z = Math.PI / 4;
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  root.add(mesh);
  return mesh;
}

function createRifleModel(THREE, item) {
  const group = new THREE.Group();
  const palette = item.palette;
  const body = makeMaterial(THREE, palette.body, { roughness: 0.66, metalness: 0.18 });
  const metal = makeMaterial(THREE, palette.metal, { roughness: 0.48, metalness: 0.62 });
  const accent = makeMaterial(THREE, palette.accent, {
    roughness: 0.38,
    metalness: 0.36,
    emissive: palette.glow,
    emissiveIntensity: item.id.includes('storm') || item.id.includes('ember') || item.type === 'sniper' ? 0.35 : 0.08,
  });

  const barrelLength = item.type === 'sniper' ? 1.15 : 0.78;
  const receiverLength = item.type === 'sniper' ? 1.22 : 1.05;
  addBox(THREE, group, body, [0, 0, -0.15], [0.34, 0.22, receiverLength], 'receiver');
  addBox(THREE, group, metal, [0, 0.01, -0.84], [0.16, 0.14, 0.72], 'barrel-shroud');
  addCylinder(THREE, group, metal, [0, 0.02, -1.26], 0.045, barrelLength, 'barrel');
  addBox(THREE, group, body, [0, -0.22, 0.18], [0.18, 0.48, 0.26], 'magazine');
  addBox(THREE, group, metal, [0.02, -0.17, 0.58], [0.16, 0.16, 0.35], 'grip');
  addBox(THREE, group, body, [0, 0.03, 0.78], [0.26, 0.19, 0.58], 'stock');
  addBox(THREE, group, accent, [0, 0.16, -0.36], [0.42, 0.055, 0.36], 'top-rail');
  addBox(THREE, group, accent, [0, -0.12, -0.68], [0.22, 0.055, 0.42], 'foregrip-light');

  if (item.type === 'sniper') {
    addCylinder(THREE, group, metal, [0, 0.26, -0.24], 0.12, 0.54, 'scope-body');
    addCylinder(THREE, group, accent, [0, 0.26, -0.55], 0.08, 0.26, 'scope-front');
    addBox(THREE, group, body, [0, 0.02, 1.04], [0.28, 0.18, 0.78], 'sniper-stock');
  }

  if (item.id.includes('storm')) {
    addCylinder(THREE, group, accent, [-0.18, 0.04, -0.45], 0.025, 1.3, 'storm-coil-left');
    addCylinder(THREE, group, accent, [0.18, 0.04, -0.45], 0.025, 1.3, 'storm-coil-right');
  }

  if (item.id.includes('ember')) {
    for (const offset of [-0.18, 0, 0.18]) {
      const fin = addBox(THREE, group, accent, [offset, 0.2, -0.16], [0.055, 0.24, 0.5], 'ember-fin');
      fin.rotation.z = offset * 0.8;
    }
  }

  return group;
}

function createKnifeModel(THREE, item) {
  const group = new THREE.Group();
  const palette = item.palette;
  const handle = makeMaterial(THREE, palette.body, { roughness: 0.72, metalness: 0.18 });
  const metal = makeMaterial(THREE, palette.metal, { roughness: 0.34, metalness: 0.72 });
  const accent = makeMaterial(THREE, palette.accent, {
    roughness: 0.42,
    metalness: 0.28,
    emissive: palette.glow,
    emissiveIntensity: 0.28,
  });

  if (item.id === 'butterfly-knife') {
    addBox(THREE, group, handle, [-0.12, -0.05, 0.3], [0.09, 0.14, 0.9], 'butterfly-handle-left');
    addBox(THREE, group, handle, [0.12, -0.05, 0.3], [0.09, 0.14, 0.9], 'butterfly-handle-right');
    addBlade(THREE, group, metal, [0, 0.02, -0.44], [0.72, 1, 1.2], 'butterfly-blade');
    addBox(THREE, group, accent, [0, 0.08, 0.82], [0.3, 0.08, 0.12], 'butterfly-latch');
    return group;
  }

  addBox(THREE, group, handle, [0, -0.05, 0.42], [0.22, 0.18, 0.86], 'dragon-handle');
  addBox(THREE, group, accent, [0, 0.07, 0.08], [0.48, 0.12, 0.18], 'dragon-guard');
  const blade = addBlade(THREE, group, metal, [0, 0.04, -0.62], [1.1, 1.32, 1.45], 'dragon-blade');
  blade.rotation.z += 0.12;
  addBox(THREE, group, accent, [0, 0.18, -0.46], [0.08, 0.08, 0.68], 'dragon-spine');
  return group;
}

export function createEquipmentModel(THREE, item, mode = 'third') {
  const group = new THREE.Group();
  const fallback = item.type === 'knife' ? createKnifeModel(THREE, item) : createRifleModel(THREE, item);
  group.name = `${item.id}-${mode}-model`;
  group.add(fallback);

  if (item.asset) {
    mountExternalModel(THREE, group, {
      overrideGroup: 'weapons',
      overrideKey: item.id,
      ...item.asset,
    }, fallback);
  }

  if (mode === 'first') {
    group.position.set(item.type === 'knife' ? 0.48 : 0.42, item.type === 'knife' ? -0.34 : -0.42, -0.92);
    group.rotation.set(item.type === 'knife' ? -0.35 : -0.08, item.type === 'knife' ? -0.28 : -0.16, item.type === 'knife' ? -0.4 : 0.02);
    group.scale.setScalar(item.type === 'knife' ? 0.72 : item.type === 'sniper' ? 0.72 : 0.82);
  } else {
    group.position.set(0.32, 1.23, -0.42);
    group.rotation.set(0.05, -0.06, 0);
    group.scale.setScalar(item.type === 'knife' ? 0.55 : item.type === 'sniper' ? 0.55 : 0.62);
  }

  return group;
}
