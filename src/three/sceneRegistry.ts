import * as THREE from "three";

const objectMap = new Map<string, THREE.Object3D>();
const resourceRefs = new Map<THREE.BufferGeometry | THREE.Material | THREE.Texture, number>();

function getMaterialTextures(material: THREE.Material) {
  const materialWithMaps = material as THREE.Material & {
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
  };
  return [
    materialWithMaps.map,
    materialWithMaps.normalMap,
    materialWithMaps.roughnessMap,
    materialWithMaps.metalnessMap,
    materialWithMaps.alphaMap,
  ].filter((texture): texture is THREE.Texture => Boolean(texture));
}

function getObjectResources(object: THREE.Object3D) {
  const resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    if (child.geometry) {
      resources.push(child.geometry);
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      resources.push(material, ...getMaterialTextures(material));
    });
  });
  return resources;
}

function retainObjectResources(object: THREE.Object3D) {
  getObjectResources(object).forEach((resource) => {
    resourceRefs.set(resource, (resourceRefs.get(resource) ?? 0) + 1);
  });
}

function releaseObjectResources(object: THREE.Object3D) {
  getObjectResources(object).forEach((resource) => {
    const nextCount = (resourceRefs.get(resource) ?? 1) - 1;
    if (nextCount > 0) {
      resourceRefs.set(resource, nextCount);
      return;
    }
    resourceRefs.delete(resource);
    resource.dispose();
  });
}

function disposeMaterial(material: THREE.Material) {
  const materialWithMaps = material as THREE.Material & {
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
  };

  [
    materialWithMaps.map,
    materialWithMaps.normalMap,
    materialWithMaps.roughnessMap,
    materialWithMaps.metalnessMap,
    materialWithMaps.alphaMap,
  ].forEach((texture) => texture?.dispose());
  material.dispose();
}

export function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    child.geometry?.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach(disposeMaterial);
  });
}

export const sceneRegistry = {
  registerObject(objectId: string, object: THREE.Object3D) {
    const existing = objectMap.get(objectId);
    if (existing === object) {
      return;
    }
    if (existing && existing !== object) {
      releaseObjectResources(existing);
    }
    retainObjectResources(object);
    objectMap.set(objectId, object);
  },
  getObject(objectId: string) {
    return objectMap.get(objectId);
  },
  getObjectIds() {
    return Array.from(objectMap.keys());
  },
  unregisterObject(objectId: string) {
    const object = objectMap.get(objectId);
    if (object) {
      releaseObjectResources(object);
    }
    objectMap.delete(objectId);
  },
  removeObject(objectId: string) {
    const object = objectMap.get(objectId);
    if (!object) {
      return;
    }
    object.parent?.remove(object);
    releaseObjectResources(object);
    objectMap.delete(objectId);
  },
  disposeAll() {
    Array.from(objectMap.keys()).forEach((objectId) => {
      sceneRegistry.removeObject(objectId);
    });
    objectMap.clear();
    resourceRefs.clear();
  },
};
