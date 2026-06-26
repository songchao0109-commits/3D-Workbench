import * as THREE from "three";
import { SkeletonHelper } from "three/src/helpers/SkeletonHelper.js";
import { isIkControlBoneName } from "../domain/rigUtils";
import type { IkChainRecord, ObjectRig } from "../domain/projectTypes";

type SkeletonRuntime = {
  boneHandles: Map<string, THREE.Mesh>;
  bones: Map<string, THREE.Bone>;
  helper: SkeletonHelper;
  ikControlTargets: Map<string, THREE.Mesh>;
  ikTargets: Map<string, THREE.Mesh>;
  root: THREE.Object3D;
  skinnedMesh: THREE.SkinnedMesh;
};

const runtimeMap = new Map<string, SkeletonRuntime>();

const targetPos = new THREE.Vector3();
const targetVec = new THREE.Vector3();
const effectorPos = new THREE.Vector3();
const effectorVec = new THREE.Vector3();
const linkPos = new THREE.Vector3();
const invLinkQ = new THREE.Quaternion();
const linkScale = new THREE.Vector3();
const axis = new THREE.Vector3();
const rotationQuat = new THREE.Quaternion();

function createBoneHandle(objectId: string, boneId: string) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.048, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      depthTest: false,
      toneMapped: false,
    }),
  );
  mesh.renderOrder = 2;
  mesh.userData.workbenchObjectId = objectId;
  mesh.userData.workbenchBoneId = boneId;
  return mesh;
}

function createIkTarget(objectId: string, chainId: string) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 14, 14),
    new THREE.MeshBasicMaterial({
      color: 0x59d8ff,
      depthTest: false,
      toneMapped: false,
    }),
  );
  mesh.renderOrder = 3;
  mesh.userData.workbenchObjectId = objectId;
  mesh.userData.workbenchIkChainId = chainId;
  return mesh;
}

function createIkControlTarget(objectId: string, boneId: string) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 14),
    new THREE.MeshBasicMaterial({
      color: 0x59d8ff,
      depthTest: false,
      toneMapped: false,
    }),
  );
  mesh.renderOrder = 4;
  mesh.userData.workbenchObjectId = objectId;
  mesh.userData.workbenchBoneId = boneId;
  mesh.userData.workbenchIkControlBone = true;
  return mesh;
}

function getFirstSkinnedMesh(root: THREE.Object3D) {
  let skinnedMesh: THREE.SkinnedMesh | undefined;
  root.traverse((child) => {
    if (!skinnedMesh && child instanceof THREE.SkinnedMesh) {
      skinnedMesh = child;
    }
  });
  return skinnedMesh;
}

function solveIkChain(runtime: SkeletonRuntime, chain: IkChainRecord) {
  const effector = runtime.bones.get(chain.effectorBoneId);
  const target = runtime.ikTargets.get(chain.id);
  if (!effector || !target) {
    return;
  }

  runtime.root.updateMatrixWorld(true);
  targetPos.copy(target.position);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    let rotated = false;

    for (const linkId of chain.linkBoneIds) {
      const link = runtime.bones.get(linkId);
      if (!link) {
        continue;
      }

      link.matrixWorld.decompose(linkPos, invLinkQ, linkScale);
      invLinkQ.invert();
      effectorPos.setFromMatrixPosition(effector.matrixWorld);

      effectorVec.subVectors(effectorPos, linkPos).applyQuaternion(invLinkQ).normalize();
      targetVec.subVectors(targetPos, linkPos).applyQuaternion(invLinkQ).normalize();

      let angle = targetVec.dot(effectorVec);
      angle = Math.min(1, Math.max(-1, angle));
      angle = Math.acos(angle);

      if (angle < 0.00001) {
        continue;
      }

      axis.crossVectors(effectorVec, targetVec).normalize();
      rotationQuat.setFromAxisAngle(axis, angle);
      link.quaternion.multiply(rotationQuat);
      link.updateMatrixWorld(true);
      rotated = true;
    }

    if (!rotated) {
      break;
    }
  }
}

function updateHandleColors(runtime: SkeletonRuntime, rig: ObjectRig) {
  const rootVisible = runtime.root.visible;
  runtime.boneHandles.forEach((handle, boneId) => {
    const material = handle.material as THREE.MeshBasicMaterial;
    material.color.set(boneId === rig.activeBoneId ? 0xfff15c : 0xffb347);
    const boneRecord = rig.bones.find((bone) => bone.id === boneId);
    const isIkControl = boneRecord ? isIkControlBoneName(boneRecord.name) : false;
    handle.visible = rig.showSkeleton && rootVisible && rig.mode !== "ik";
    if (isIkControl) {
      material.color.set(boneId === rig.activeBoneId ? 0x9bf0ff : 0x59d8ff);
    }
  });

  runtime.ikControlTargets.forEach((target, boneId) => {
    const material = target.material as THREE.MeshBasicMaterial;
    material.color.set(boneId === rig.activeBoneId ? 0x9bf0ff : 0x59d8ff);
    target.visible = rig.showSkeleton && rootVisible && rig.mode === "ik";
  });

  runtime.ikTargets.forEach((target, chainId) => {
    const material = target.material as THREE.MeshBasicMaterial;
    material.color.set(chainId === rig.activeIkChainId ? 0x9bf0ff : 0x59d8ff);
    target.visible = rig.showSkeleton && rootVisible && rig.mode === "ik";
  });
}

function ensureIkControlTargets(objectId: string, runtime: SkeletonRuntime, rig: ObjectRig) {
  const parent = runtime.root.parent;
  if (!parent) {
    return;
  }

  const controlBoneIds = new Set(
    rig.bones.filter((bone) => isIkControlBoneName(bone.name)).map((bone) => bone.id),
  );

  Array.from(runtime.ikControlTargets.entries()).forEach(([boneId, target]) => {
    if (!controlBoneIds.has(boneId)) {
      target.parent?.remove(target);
      target.geometry.dispose();
      (target.material as THREE.Material).dispose();
      runtime.ikControlTargets.delete(boneId);
    }
  });

  const worldPosition = new THREE.Vector3();
  controlBoneIds.forEach((boneId) => {
    const bone = runtime.bones.get(boneId);
    if (!bone) {
      return;
    }
    let target = runtime.ikControlTargets.get(boneId);
    if (!target) {
      target = createIkControlTarget(objectId, boneId);
      parent.add(target);
      runtime.ikControlTargets.set(boneId, target);
    }
    bone.updateMatrixWorld(true);
    target.position.copy(bone.getWorldPosition(worldPosition));
  });
}

function ensureIkTargets(objectId: string, runtime: SkeletonRuntime, rig: ObjectRig) {
  const parent = runtime.root.parent;
  if (!parent) {
    return;
  }

  const chainIds = new Set(rig.ikChains.map((chain) => chain.id));
  Array.from(runtime.ikTargets.entries()).forEach(([chainId, target]) => {
    if (!chainIds.has(chainId)) {
      target.parent?.remove(target);
      target.geometry.dispose();
      (target.material as THREE.Material).dispose();
      runtime.ikTargets.delete(chainId);
    }
  });

  rig.ikChains.forEach((chain) => {
    let target = runtime.ikTargets.get(chain.id);
    if (!target) {
      target = createIkTarget(objectId, chain.id);
      target.position.set(...chain.targetPosition);
      parent.add(target);
      runtime.ikTargets.set(chain.id, target);
    } else {
      target.position.set(...chain.targetPosition);
    }
  });
}

export const skeletonRegistry = {
  register(objectId: string, root: THREE.Object3D) {
    const skinnedMesh = getFirstSkinnedMesh(root);
    if (!skinnedMesh?.skeleton?.bones.length || runtimeMap.has(objectId)) {
      return;
    }

    const helper = new SkeletonHelper(skinnedMesh);
    helper.visible = false;
    root.parent?.add(helper);

    const bones = new Map<string, THREE.Bone>();
    const boneHandles = new Map<string, THREE.Mesh>();
    skinnedMesh.skeleton.bones.forEach((bone) => {
      bone.userData.workbenchObjectId = objectId;
      bone.userData.workbenchBoneId = bone.uuid;
      bones.set(bone.uuid, bone);
      const handle = createBoneHandle(objectId, bone.uuid);
      bone.add(handle);
      boneHandles.set(bone.uuid, handle);
    });

    runtimeMap.set(objectId, {
      boneHandles,
      bones,
      helper,
      ikControlTargets: new Map(),
      ikTargets: new Map(),
      root,
      skinnedMesh,
    });
  },
  getBone(objectId: string, boneId: string) {
    return runtimeMap.get(objectId)?.bones.get(boneId);
  },
  getIkTarget(objectId: string, chainId: string) {
    return runtimeMap.get(objectId)?.ikTargets.get(chainId);
  },
  getIkControlTarget(objectId: string, boneId: string) {
    return runtimeMap.get(objectId)?.ikControlTargets.get(boneId);
  },
  setBoneRotation(objectId: string, boneId: string, rotation: [number, number, number]) {
    const bone = runtimeMap.get(objectId)?.bones.get(boneId);
    if (!bone) {
      return;
    }
    bone.rotation.set(...rotation);
    bone.updateMatrixWorld(true);
  },
  setBonePosition(objectId: string, boneId: string, position: [number, number, number]) {
    const bone = runtimeMap.get(objectId)?.bones.get(boneId);
    if (!bone) {
      return;
    }
    bone.position.set(...position);
    bone.updateMatrixWorld(true);
  },
  setBoneWorldPosition(objectId: string, boneId: string, position: [number, number, number]) {
    const runtime = runtimeMap.get(objectId);
    const bone = runtime?.bones.get(boneId);
    if (!runtime || !bone) {
      return undefined;
    }
    const nextPosition = new THREE.Vector3(...position);
    const localPosition = nextPosition.clone();
    bone.parent?.worldToLocal(localPosition);
    bone.position.copy(localPosition);
    bone.updateMatrixWorld(true);
    const target = runtime.ikControlTargets.get(boneId);
    if (target) {
      target.position.copy(nextPosition);
    }
    return [localPosition.x, localPosition.y, localPosition.z] as [
      number,
      number,
      number,
    ];
  },
  getBoneWorldPosition(objectId: string, boneId: string) {
    const bone = runtimeMap.get(objectId)?.bones.get(boneId);
    if (!bone) {
      return undefined;
    }
    bone.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(bone.matrixWorld);
    return [position.x, position.y, position.z] as [number, number, number];
  },
  getAdditionalPickTargets() {
    return Array.from(runtimeMap.values()).flatMap((runtime) =>
      Array.from(runtime.ikTargets.values()),
    );
  },
  getIkTargetPickTargets(objectId?: string) {
    const runtimes = objectId
      ? [runtimeMap.get(objectId)].filter((runtime): runtime is SkeletonRuntime =>
          Boolean(runtime),
        )
      : Array.from(runtimeMap.values());
    return runtimes.flatMap((runtime) => Array.from(runtime.ikTargets.values()));
  },
  getBonePickTargets(objectId?: string) {
    const runtimes = objectId
      ? [runtimeMap.get(objectId)].filter((runtime): runtime is SkeletonRuntime =>
          Boolean(runtime),
        )
      : Array.from(runtimeMap.values());
    return runtimes.flatMap((runtime) => Array.from(runtime.boneHandles.values()));
  },
  getIkControlPickTargets(objectId?: string) {
    const runtimes = objectId
      ? [runtimeMap.get(objectId)].filter((runtime): runtime is SkeletonRuntime =>
          Boolean(runtime),
        )
      : Array.from(runtimeMap.values());
    return runtimes.flatMap((runtime) => Array.from(runtime.ikControlTargets.values()));
  },
  solveChain(objectId: string, chainId: string, rig?: ObjectRig) {
    const runtime = runtimeMap.get(objectId);
    if (!runtime || !rig) {
      return;
    }
    const chain = rig.ikChains.find((item) => item.id === chainId);
    if (!chain?.enabled) {
      return;
    }
    solveIkChain(runtime, chain);
    updateHandleColors(runtime, rig);
    runtime.helper.updateMatrixWorld(true);
  },
  sync(objectId: string, rig?: ObjectRig) {
    const runtime = runtimeMap.get(objectId);
    if (!runtime || !rig?.hasSkeleton) {
      return;
    }

    rig.bones.forEach((boneRecord) => {
      const bone = runtime.bones.get(boneRecord.id);
      if (!bone) {
        return;
      }
      bone.position.set(...boneRecord.position);
      bone.rotation.set(...boneRecord.rotation);
    });

    runtime.helper.visible = rig.showSkeleton && runtime.root.visible;
    ensureIkControlTargets(objectId, runtime, rig);
    ensureIkTargets(objectId, runtime, rig);
    if (rig.mode === "ik") {
      rig.ikChains.filter((chain) => chain.enabled).forEach((chain) => {
        solveIkChain(runtime, chain);
      });
    }
    updateHandleColors(runtime, rig);
    runtime.helper.updateMatrixWorld(true);
  },
  remove(objectId: string) {
    const runtime = runtimeMap.get(objectId);
    if (!runtime) {
      return;
    }

    runtime.helper.parent?.remove(runtime.helper);
    runtime.helper.dispose();
    runtime.boneHandles.forEach((handle) => {
      handle.parent?.remove(handle);
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
    });
    runtime.ikControlTargets.forEach((target) => {
      target.parent?.remove(target);
      target.geometry.dispose();
      (target.material as THREE.Material).dispose();
    });
    runtime.ikTargets.forEach((target) => {
      target.parent?.remove(target);
      target.geometry.dispose();
      (target.material as THREE.Material).dispose();
    });

    runtimeMap.delete(objectId);
  },
  disposeAll() {
    Array.from(runtimeMap.keys()).forEach((objectId) => skeletonRegistry.remove(objectId));
  },
};
