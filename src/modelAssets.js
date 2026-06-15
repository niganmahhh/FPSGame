import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();
const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
let privateModsPromise = null;

export function modelUrl(file, folder = 'models') {
  if (!file) {
    return '';
  }

  if (/^(https?:|data:|blob:)/.test(file)) {
    return file;
  }

  const cleanFile = file.replace(/^\/+/, '');
  if (cleanFile.startsWith('models/') || cleanFile.startsWith('private-mods/')) {
    return `${baseUrl}${cleanFile}`;
  }

  return `${baseUrl}${folder.replace(/^\/+|\/+$/g, '')}/${cleanFile}`;
}

export function privateModUrl(file) {
  return modelUrl(file, 'private-mods');
}

export function loadModel(file, options = {}) {
  const url = modelUrl(file, options.folder);

  if (!url) {
    return Promise.reject(new Error('Missing model file.'));
  }

  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => resolve(gltf.scene),
          undefined,
          (error) => reject(error),
        );
      }),
    );
  }

  return cache.get(url).then((scene) => scene.clone(true));
}

export function loadPrivateModsManifest() {
  if (!privateModsPromise) {
    privateModsPromise = fetch(privateModUrl('mods.json'), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }

  return privateModsPromise;
}

function normalizePrivateOverride(override) {
  if (!override) {
    return null;
  }

  if (typeof override === 'string') {
    return { file: override, folder: 'private-mods' };
  }

  if (typeof override === 'object' && override.file) {
    return {
      ...override,
      folder: override.folder ?? 'private-mods',
    };
  }

  return null;
}

export async function resolveAsset(asset) {
  if (!asset?.overrideKey) {
    return asset;
  }

  const manifest = await loadPrivateModsManifest();
  const groupOverride = manifest?.[asset.overrideGroup]?.[asset.overrideKey];
  const directOverride = manifest?.assets?.[asset.overrideKey] ?? manifest?.[asset.overrideKey];
  const override = normalizePrivateOverride(groupOverride ?? directOverride);

  if (!override) {
    return asset;
  }

  return {
    ...asset,
    ...override,
    privateOverride: true,
  };
}

export function prepareModel(THREE, model, options = {}) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = options.castShadow !== false;
    child.receiveShadow = options.receiveShadow !== false;

    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.needsUpdate = true;
        if (material.roughness !== undefined) {
          material.roughness = Math.max(material.roughness, 0.48);
        }
      }
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  if (!Number.isFinite(box.min.x)) {
    return model;
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = options.maxSize ?? 1;
  model.scale.multiplyScalar(targetSize / maxDimension);

  const scaledBox = new THREE.Box3().setFromObject(model);
  scaledBox.getCenter(center);
  model.position.sub(center);

  if (options.alignBottom) {
    const bottomBox = new THREE.Box3().setFromObject(model);
    model.position.y -= bottomBox.min.y;
  }

  return model;
}

export function mountExternalModel(THREE, parent, asset, fallback = null, callbacks = {}) {
  if (!asset?.file) {
    return null;
  }

  const holder = new THREE.Group();
  holder.name = `external-${asset.file.replace(/[^a-z0-9]+/gi, '-')}`;
  holder.visible = false;
  parent.add(holder);

  resolveAsset(asset)
    .then((resolvedAsset) => loadModel(resolvedAsset.file, resolvedAsset).then((model) => ({ model, resolvedAsset })))
    .then(({ model, resolvedAsset }) => {
      prepareModel(THREE, model, resolvedAsset);
      holder.add(model);
      holder.position.set(...(resolvedAsset.position ?? [0, 0, 0]));
      holder.rotation.set(...(resolvedAsset.rotation ?? [0, 0, 0]));
      holder.scale.setScalar(resolvedAsset.scale ?? 1);
      holder.visible = true;
      holder.userData.asset = resolvedAsset;

      if (fallback) {
        fallback.visible = false;
      }

      callbacks.onLoaded?.(holder, model);
    })
    .catch((error) => {
      parent.userData.assetError = error;
      callbacks.onError?.(error);
    });

  return holder;
}
