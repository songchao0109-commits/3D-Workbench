import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BoneRecord, IkChainRecord, ObjectRig } from "../domain/projectTypes";

const loader = new GLTFLoader();

export function loadGlbFromUrl(objectUrl: string) {
  return new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      objectUrl,
      (gltf) => {
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        reject(error);
      },
    );
  });
}

export function loadGlbFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  return new Promise<{ objectUrl: string; scene: THREE.Group }>((resolve, reject) => {
    loader.load(
      objectUrl,
      (gltf) => {
        resolve({
          objectUrl,
          scene: gltf.scene,
        });
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      },
    );
  });
}

export function normalizeImportedScene(scene: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? 2.5 / maxAxis : 1;

  scene.scale.setScalar(scale);
  scene.position.sub(center.multiplyScalar(scale));

  const normalizedBox = new THREE.Box3().setFromObject(scene);
  scene.position.y -= normalizedBox.min.y;
}

function createBoneRecord(bone: THREE.Bone): BoneRecord {
  return {
    id: bone.uuid,
    name: bone.name || "未命名骨骼",
    parentId: bone.parent instanceof THREE.Bone ? bone.parent.uuid : undefined,
    position: [bone.position.x, bone.position.y, bone.position.z],
    rotation: [bone.rotation.x, bone.rotation.y, bone.rotation.z],
  };
}

function buildIkLinkIds(
  bones: BoneRecord[],
  rootBoneId: string,
  effectorBoneId: string,
) {
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const linkIds: string[] = [];
  let current = byId.get(effectorBoneId);

  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) {
      return undefined;
    }
    linkIds.push(parent.id);
    if (parent.id === rootBoneId) {
      return linkIds;
    }
    current = parent;
  }

  return undefined;
}

function createAutoIkChain(
  bones: BoneRecord[],
  chainId: string,
  chainName: string,
  rootName: string,
  effectorNames: string[],
) {
  const rootBone = bones.find((bone) => bone.name.toLowerCase() === rootName);
  const effectorBone = effectorNames
    .map((name) => bones.find((bone) => bone.name.toLowerCase() === name))
    .find(Boolean);

  if (!rootBone || !effectorBone) {
    return undefined;
  }

  const linkBoneIds = buildIkLinkIds(bones, rootBone.id, effectorBone.id);
  if (!linkBoneIds?.length) {
    return undefined;
  }

  return {
    id: chainId,
    name: chainName,
    rootBoneId: rootBone.id,
    effectorBoneId: effectorBone.id,
    linkBoneIds,
    targetPosition: [0, 0, 0],
    enabled: true,
  } satisfies IkChainRecord;
}

function buildAutoIkChains(bones: BoneRecord[]) {
  const chains = [
    createAutoIkChain(bones, "auto_ik_hand_l", "左手IK", "upperarm_l", ["hand_l"]),
    createAutoIkChain(bones, "auto_ik_hand_r", "右手IK", "upperarm_r", ["hand_r"]),
    createAutoIkChain(bones, "auto_ik_foot_l", "左脚IK", "thigh_l", [
      "ball_leaf_l",
      "ball_l",
      "foot_l",
    ]),
    createAutoIkChain(bones, "auto_ik_foot_r", "右脚IK", "thigh_r", [
      "ball_leaf_r",
      "ball_r",
      "foot_r",
    ]),
  ].filter((chain): chain is NonNullable<typeof chain> => Boolean(chain));

  return chains as IkChainRecord[];
}

export function extractRigFromScene(scene: THREE.Object3D): ObjectRig | undefined {
  let skinnedMesh: THREE.SkinnedMesh | undefined;

  scene.traverse((child) => {
    if (!skinnedMesh && child instanceof THREE.SkinnedMesh) {
      skinnedMesh = child;
    }
  });

  if (!skinnedMesh?.skeleton?.bones.length) {
    return undefined;
  }

  const bones = skinnedMesh.skeleton.bones.map(createBoneRecord);
  const rootBone = bones.find((bone) => !bone.parentId) ?? bones[0];
  const ikChains = buildAutoIkChains(bones);

  return {
    hasSkeleton: true,
    mode: "fk",
    showSkeleton: true,
    activeBoneId: rootBone?.id,
    boneControlActive: false,
    activeIkChainId: ikChains[0]?.id,
    bones,
    ikChains,
  };
}
