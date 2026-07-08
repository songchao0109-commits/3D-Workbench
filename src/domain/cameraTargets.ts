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

function addTargetOffset(target: Vec3, offset: Vec3 = [0, 0, 0]): Vec3 {
  return [
    target[0] + offset[0],
    target[1] + offset[1],
    target[2] + offset[2],
  ];
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
    const target = object
      ? resolveObjectTargetCenter(camera.targetRefId, object.position)
      : camera.target;
    return addTargetOffset(target, camera.targetOffset);
  }

  const targetCamera = cameras.find(
    (item) => item.id === camera.targetRefId && item.id !== camera.id,
  );
  return addTargetOffset(targetCamera?.position ?? camera.target, camera.targetOffset);
}
