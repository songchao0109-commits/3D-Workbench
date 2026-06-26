import * as THREE from "three";
import type { SceneCamera } from "../domain/projectTypes";
import { createCameraMarker } from "./sceneObjects";

const targetSphereName = "camera-look-at-target";
const aimLineName = "camera-aim-line";

function setLinePoints(line: THREE.Line, camera: SceneCamera) {
  const targetLocal = new THREE.Vector3(...camera.target).sub(
    new THREE.Vector3(...camera.position),
  );
  const positions = line.geometry.getAttribute("position");
  positions.setXYZ(0, 0, 0, 0);
  positions.setXYZ(1, targetLocal.x, targetLocal.y, targetLocal.z);
  positions.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

export function getLookAtRotation(position: THREE.Vector3, target: THREE.Vector3) {
  const rig = new THREE.Object3D();
  rig.position.copy(position);
  if (position.distanceToSquared(target) > 0.000001) {
    rig.lookAt(target);
  }
  return rig.rotation;
}

export function applyCameraStateToRig(rig: THREE.Object3D, camera: SceneCamera) {
  rig.name = camera.name;
  rig.visible = camera.visible;
  rig.position.set(...camera.position);
  if (camera.mode === "lookAt") {
    const target = new THREE.Vector3(...camera.target);
    if (rig.position.distanceToSquared(target) > 0.000001) {
      rig.lookAt(target);
    }
  } else {
    rig.rotation.set(...camera.rotation);
  }

  const targetSphere = rig.getObjectByName(targetSphereName);
  const line = rig.getObjectByName(aimLineName);
  if (targetSphere) {
    targetSphere.visible = camera.mode === "lookAt";
    targetSphere.position.copy(
      new THREE.Vector3(...camera.target).sub(new THREE.Vector3(...camera.position)),
    );
  }
  if (line instanceof THREE.Line) {
    line.visible = camera.mode === "lookAt";
    setLinePoints(line, camera);
  }
}

export function applyCameraStateToPerspectiveCamera(
  targetCamera: THREE.PerspectiveCamera,
  camera: SceneCamera,
) {
  targetCamera.position.set(...camera.position);
  targetCamera.fov = camera.fov;
  if (camera.mode === "lookAt") {
    const target = new THREE.Vector3(...camera.target);
    if (targetCamera.position.distanceToSquared(target) > 0.000001) {
      targetCamera.lookAt(target);
    }
  } else {
    targetCamera.rotation.set(...camera.rotation);
  }
  targetCamera.updateProjectionMatrix();
}

export function createCameraRig(camera: SceneCamera) {
  const group = new THREE.Group();
  group.name = camera.name;
  group.userData.workbenchCameraId = camera.id;

  const marker = createCameraMarker();
  const targetGeometry = new THREE.SphereGeometry(0.06, 12, 12);
  const targetMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const target = new THREE.Mesh(targetGeometry, targetMaterial);
  target.name = targetSphereName;
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xd8c600 });
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(6), 3),
  );
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.name = aimLineName;

  group.add(marker, target, line);
  applyCameraStateToRig(group, camera);
  return group;
}
