import * as THREE from "three";

const objectMap = new Map<string, THREE.Object3D>();

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
    objectMap.set(objectId, object);
  },
  getObject(objectId: string) {
    return objectMap.get(objectId);
  },
  unregisterObject(objectId: string) {
    objectMap.delete(objectId);
  },
  removeObject(objectId: string) {
    const object = objectMap.get(objectId);
    if (!object) {
      return;
    }
    object.parent?.remove(object);
    disposeObject3D(object);
    objectMap.delete(objectId);
  },
  disposeAll() {
    Array.from(objectMap.keys()).forEach((objectId) => {
      sceneRegistry.removeObject(objectId);
    });
    objectMap.clear();
  },
};
