import * as THREE from "three";
import { sceneRegistry } from "../three/sceneRegistry";
import type { SceneCamera, SceneObject, Vec3 } from "./projectTypes";

function resolveObjectTargetCenter(objectId: string, fallback: Vec3): Vec3 {
  const sceneObject = sceneRegistry.getObject(objectId);
  if (!sceneObject) {
    return fallback;
  }

  const bounds = new THREE.Box3().setFromObject(sceneObject);
  if (bounds.isEmpty()) {
    return fallback;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  return [center.x, center.y, center.z];
}

export function resolveCameraTarget(
  camera: SceneCamera,
  objects: SceneObject[],
  cameras: SceneCamera[],
): Vec3 {
  if (camera.targetMode !== "asset" || !camera.targetRefId || !camera.targetRefType) {
    return camera.target;
  }

  if (camera.targetRefType === "object") {
    const object = objects.find((item) => item.id === camera.targetRefId);
    return object
      ? resolveObjectTargetCenter(camera.targetRefId, object.position)
      : camera.target;
  }

  const targetCamera = cameras.find(
    (item) => item.id === camera.targetRefId && item.id !== camera.id,
  );
  return targetCamera?.position ?? camera.target;
}
