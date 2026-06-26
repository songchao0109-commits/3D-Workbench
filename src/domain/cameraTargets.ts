import type { SceneCamera, SceneObject, Vec3 } from "./projectTypes";

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
    return object?.position ?? camera.target;
  }

  const targetCamera = cameras.find(
    (item) => item.id === camera.targetRefId && item.id !== camera.id,
  );
  return targetCamera?.position ?? camera.target;
}
