import * as THREE from "three";
import { create } from "zustand";
import { defaultProject } from "../domain/defaultProject";
import { getIkControlBones, isIkControlBoneName } from "../domain/rigUtils";
import type {
  AssetRecord,
  BoneRecord,
  IkChainRecord,
  MaterialOverride,
  ObjectRig,
  OutputFrame,
  ProjectState,
  SceneCamera,
  SceneObject,
  SnapshotRecord,
  ToolMode,
  TransformMode,
  Vec3,
  WorldSettings,
} from "../domain/projectTypes";

type ProjectStore = ProjectState & {
  setActiveTool: (tool: ToolMode) => void;
  setTransformMode: (mode: TransformMode) => void;
  setOutputFrame: (frame: OutputFrame) => void;
  clearSelection: () => void;
  setActiveObject: (objectId?: string) => void;
  setActiveCamera: (cameraId: string) => void;
  setCameraPreviewActive: (active: boolean) => void;
  addCamera: (camera?: Partial<SceneCamera>) => void;
  updateCamera: (cameraId: string, updates: Partial<SceneCamera>) => void;
  updateWorldSettings: (updates: Partial<WorldSettings>) => void;
  setWorldPanoramaAsset: (asset?: AssetRecord) => void;
  toggleCameraVisible: (cameraId: string) => void;
  toggleCameraLocked: (cameraId: string) => void;
  removeCamera: (cameraId: string) => void;
  setObjectRigMode: (objectId: string, mode: ObjectRig["mode"]) => void;
  toggleObjectSkeletonVisible: (objectId: string) => void;
  setActiveBone: (objectId: string, boneId?: string) => void;
  updateBoneRotation: (objectId: string, boneId: string, rotation: Vec3) => void;
  updateBonePosition: (objectId: string, boneId: string, position: Vec3) => void;
  createIkChain: (
    objectId: string,
    rootBoneId: string,
    effectorBoneId: string,
  ) => { ok: true; chainId: string } | { ok: false; message: string };
  setActiveIkChain: (objectId: string, chainId?: string) => void;
  updateIkChain: (
    objectId: string,
    chainId: string,
    updates: Partial<IkChainRecord>,
  ) => void;
  removeIkChain: (objectId: string, chainId: string) => void;
  updateObject: (objectId: string, updates: Partial<SceneObject>) => void;
  updateObjectTransform: (
    objectId: string,
    transform: Partial<Pick<SceneObject, "position" | "rotation" | "scale">>,
  ) => void;
  updateObjectMetrics: (
    objectId: string,
    updates: Partial<Pick<SceneObject, "actualDimensions">>,
  ) => void;
  toggleObjectVisible: (objectId: string) => void;
  toggleObjectLocked: (objectId: string) => void;
  toggleObjectBoundsVisible: (objectId: string) => void;
  removeObject: (objectId: string) => void;
  updateObjectMaterial: (
    objectId: string,
    materialId: string,
    updates: Partial<MaterialOverride>,
  ) => void;
  addAsset: (asset: AssetRecord) => void;
  addSceneObject: (object: SceneObject) => void;
  addImportedModel: (asset: AssetRecord, object: SceneObject) => void;
  addSnapshot: (snapshot: SnapshotRecord) => void;
  setImportError: (message?: string) => void;
  releaseRuntimeAssets: () => void;
};

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

function getDefaultBoneId(bones: BoneRecord[]) {
  return bones.find((bone) => !bone.parentId)?.id ?? bones[0]?.id;
}

const matrixPosition = new THREE.Vector3();
const matrixRotation = new THREE.Quaternion();
const matrixScale = new THREE.Vector3();
const previousMatrix = new THREE.Matrix4();
const nextMatrix = new THREE.Matrix4();
const deltaMatrix = new THREE.Matrix4();
const transformedTarget = new THREE.Vector3();

function applyObjectDeltaToTargetPosition(
  previousObject: Pick<SceneObject, "position" | "rotation" | "scale">,
  nextObject: Pick<SceneObject, "position" | "rotation" | "scale">,
  targetPosition: Vec3,
): Vec3 {
  previousMatrix.compose(
    matrixPosition.set(...previousObject.position),
    matrixRotation.setFromEuler(new THREE.Euler(...previousObject.rotation)),
    matrixScale.set(...previousObject.scale),
  );
  nextMatrix.compose(
    matrixPosition.set(...nextObject.position),
    matrixRotation.setFromEuler(new THREE.Euler(...nextObject.rotation)),
    matrixScale.set(...nextObject.scale),
  );
  deltaMatrix.copy(nextMatrix).multiply(previousMatrix.clone().invert());
  transformedTarget.set(...targetPosition).applyMatrix4(deltaMatrix);
  return [transformedTarget.x, transformedTarget.y, transformedTarget.z];
}

export const useProjectStore = create<ProjectStore>((set) => ({
  ...defaultProject,
  setActiveTool: (tool) => set({ activeTool: tool }),
  setTransformMode: (mode) => set({ transformMode: mode, activeTool: "move" }),
  setOutputFrame: (frame) => set({ outputFrame: frame, activeTool: "aspect" }),
  clearSelection: () => set({ activeObjectId: undefined, selectedCameraId: undefined }),
  setActiveObject: (objectId) =>
    set((state) => ({
      activeObjectId: objectId,
      selectedCameraId: undefined,
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                boneControlActive: false,
              },
            }
          : object,
      ),
    })),
  setActiveCamera: (cameraId) =>
    set({
      activeCameraId: cameraId,
      selectedCameraId: cameraId,
      activeObjectId: undefined,
    }),
  setCameraPreviewActive: (active) => set({ cameraPreviewActive: active }),
  addCamera: (camera = {}) =>
    set((state) => {
      const index = state.cameras.length + 1;
      const id = camera.id ?? `camera_${crypto.randomUUID()}`;
      const nextCamera: SceneCamera = {
        id,
        name: camera.name ?? `相机${index}`,
        position: camera.position ?? [8, 5.2, 7.4],
        rotation: camera.rotation ?? [-0.7, 0.8, 0.5],
        target: camera.target ?? [0, 0, 0],
        targetMode: camera.targetMode ?? "manual",
        targetRefId: camera.targetRefId,
        targetRefType: camera.targetRefType,
        fov: camera.fov ?? 45,
        mode: camera.mode ?? "lookAt",
        visible: camera.visible ?? true,
        locked: camera.locked ?? false,
      };

      return {
        cameras: [...state.cameras, nextCamera],
        activeCameraId: id,
        selectedCameraId: id,
        activeObjectId: undefined,
      };
    }),
  updateCamera: (cameraId, updates) =>
    set((state) => ({
      cameras: state.cameras.map((camera) =>
        camera.id === cameraId ? { ...camera, ...updates } : camera,
      ),
    })),
  updateWorldSettings: (updates) =>
    set((state) => {
      return {
        worldSettings: {
          ...state.worldSettings,
          ...updates,
          rootTransform: {
            ...state.worldSettings.rootTransform,
            ...updates.rootTransform,
          },
          snap: {
            ...state.worldSettings.snap,
            ...updates.snap,
          },
          ground: {
            ...state.worldSettings.ground,
            ...updates.ground,
          },
          panoramaSphere: {
            ...state.worldSettings.panoramaSphere,
            ...updates.panoramaSphere,
          },
        },
      };
    }),
  setWorldPanoramaAsset: (asset) =>
    set((state) => {
      const previousAsset = state.assets.find(
        (item) => item.id === state.worldSettings.panoramaSphere.assetId,
      );
      if (previousAsset && previousAsset.id !== asset?.id) {
        URL.revokeObjectURL(previousAsset.objectUrl);
      }

      const nextAssets = asset
        ? [
            ...state.assets.filter(
              (item) =>
                item.id !== state.worldSettings.panoramaSphere.assetId &&
                item.id !== asset.id,
            ),
            asset,
          ]
        : state.assets.filter(
            (item) => item.id !== state.worldSettings.panoramaSphere.assetId,
          );

      return {
        assets: nextAssets,
        worldSettings: {
          ...state.worldSettings,
          panoramaSphere: {
            ...state.worldSettings.panoramaSphere,
            assetId: asset?.id,
            visible: asset ? true : false,
          },
        },
      };
    }),
  toggleCameraVisible: (cameraId) =>
    set((state) => ({
      cameras: state.cameras.map((camera) =>
        camera.id === cameraId ? { ...camera, visible: !camera.visible } : camera,
      ),
    })),
  toggleCameraLocked: (cameraId) =>
    set((state) => ({
      cameras: state.cameras.map((camera) =>
        camera.id === cameraId ? { ...camera, locked: !camera.locked } : camera,
      ),
    })),
  removeCamera: (cameraId) =>
    set((state) => {
      const remaining = state.cameras.filter((camera) => camera.id !== cameraId);
      const fallbackCamera: SceneCamera = {
        id: `camera_${crypto.randomUUID()}`,
        name: "相机1",
        position: [8, 5.2, 7.4],
        rotation: [-0.7, 0.8, 0.5],
        target: [0, 0, 0],
        targetMode: "manual",
        fov: 45,
        mode: "lookAt",
        visible: true,
        locked: false,
      };
      const nextCameras = remaining.length > 0 ? remaining : [fallbackCamera];
      const nextActiveCameraId =
        state.activeCameraId === cameraId
          ? nextCameras[0].id
          : state.activeCameraId ?? nextCameras[0].id;

      window.dispatchEvent(
        new CustomEvent("scene-camera-remove-request", {
          detail: cameraId,
        }),
      );

      return {
        cameras: nextCameras,
        activeCameraId: nextActiveCameraId,
        selectedCameraId:
          state.selectedCameraId === cameraId ? undefined : state.selectedCameraId,
        activeObjectId: undefined,
        cameraPreviewActive:
          state.activeCameraId === cameraId ? false : state.cameraPreviewActive,
      };
    }),
  setObjectRigMode: (objectId, mode) =>
    set((state) => ({
      objects: state.objects.map((object) => {
        if (object.id !== objectId || !object.rig) {
          return object;
        }
        const activeBoneId =
          mode === "fk"
            ? object.rig.activeBoneId ?? getDefaultBoneId(object.rig.bones)
            : object.rig.activeBoneId &&
                object.rig.bones.some(
                  (bone) =>
                    bone.id === object.rig?.activeBoneId &&
                    isIkControlBoneName(bone.name),
                )
              ? object.rig.activeBoneId
              : getIkControlBones(object.rig.bones)[0]?.id;
        const activeIkChainId =
          mode === "ik"
            ? object.rig.activeIkChainId ?? object.rig.ikChains[0]?.id
            : object.rig.activeIkChainId;
        return {
          ...object,
          rig: {
            ...object.rig,
            mode,
            activeBoneId,
            activeIkChainId,
            boneControlActive:
              mode === "fk"
                ? Boolean(activeBoneId)
                : Boolean(activeIkChainId),
          },
        };
      }),
    })),
  toggleObjectSkeletonVisible: (objectId) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                showSkeleton: !object.rig.showSkeleton,
              },
            }
          : object,
      ),
    })),
  setActiveBone: (objectId, boneId) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                activeBoneId: boneId,
                boneControlActive: Boolean(boneId),
              },
            }
          : object,
      ),
      activeObjectId: objectId,
      selectedCameraId: undefined,
    })),
  updateBoneRotation: (objectId, boneId, rotation) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                activeBoneId: boneId,
                boneControlActive: true,
                bones: object.rig.bones.map((bone) =>
                  bone.id === boneId ? { ...bone, rotation } : bone,
                ),
              },
            }
          : object,
      ),
    })),
  updateBonePosition: (objectId, boneId, position) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                activeBoneId: boneId,
                boneControlActive: true,
                bones: object.rig.bones.map((bone) =>
                  bone.id === boneId ? { ...bone, position } : bone,
                ),
              },
            }
          : object,
      ),
    })),
  createIkChain: (objectId, rootBoneId, effectorBoneId) => {
    const state = useProjectStore.getState();
    const object = state.objects.find((item) => item.id === objectId);
    const rig = object?.rig;
    if (!rig?.hasSkeleton) {
      return { ok: false, message: "当前模型没有可编辑骨架" };
    }
    const linkBoneIds = buildIkLinkIds(rig.bones, rootBoneId, effectorBoneId);
    if (!linkBoneIds || linkBoneIds.length === 0) {
      return { ok: false, message: "根骨骼必须是末端骨骼的祖先骨骼" };
    }
    const chainId = `ik_chain_${crypto.randomUUID()}`;
    const effectorBone = rig.bones.find((bone) => bone.id === effectorBoneId);
    const nextChain: IkChainRecord = {
      id: chainId,
      name: effectorBone?.name ? `${effectorBone.name} IK` : `骨链${rig.ikChains.length + 1}`,
      rootBoneId,
      effectorBoneId,
      linkBoneIds,
      targetPosition: object?.position ?? [0, 1, 0],
      enabled: true,
    };
    set((current) => ({
      objects: current.objects.map((item) =>
        item.id === objectId && item.rig
          ? {
              ...item,
              rig: {
                ...item.rig,
                mode: "ik",
                activeIkChainId: chainId,
                ikChains: [...item.rig.ikChains, nextChain],
              },
            }
          : item,
      ),
    }));
    return { ok: true, chainId };
  },
  setActiveIkChain: (objectId, chainId) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                activeIkChainId: chainId,
                boneControlActive: Boolean(chainId),
              },
            }
          : object,
      ),
      activeObjectId: objectId,
      selectedCameraId: undefined,
    })),
  updateIkChain: (objectId, chainId, updates) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                ikChains: object.rig.ikChains.map((chain) =>
                  chain.id === chainId ? { ...chain, ...updates } : chain,
                ),
              },
            }
          : object,
      ),
    })),
  removeIkChain: (objectId, chainId) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                ikChains: object.rig.ikChains.filter((chain) => chain.id !== chainId),
                activeIkChainId:
                  object.rig.activeIkChainId === chainId
                    ? undefined
                    : object.rig.activeIkChainId,
              },
            }
          : object,
      ),
    })),
  updateObject: (objectId, updates) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId ? { ...object, ...updates } : object,
      ),
    })),
  updateObjectTransform: (objectId, transform) =>
    set((state) => ({
      objects: state.objects.map((object) => {
        if (object.id !== objectId) {
          return object;
        }
        const nextObject = {
          ...object,
          ...transform,
        };
        if (!object.rig?.ikChains.length) {
          return nextObject;
        }
        return {
          ...nextObject,
          rig: {
            ...object.rig,
            ikChains: object.rig.ikChains.map((chain) => ({
              ...chain,
              targetPosition: applyObjectDeltaToTargetPosition(
                {
                  position: object.position,
                  rotation: object.rotation,
                  scale: object.scale,
                },
                {
                  position: nextObject.position,
                  rotation: nextObject.rotation,
                  scale: nextObject.scale,
                },
                chain.targetPosition,
              ),
            })),
          },
        };
      }),
    })),
  updateObjectMetrics: (objectId, updates) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId ? { ...object, ...updates } : object,
      ),
    })),
  toggleObjectVisible: (objectId) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId ? { ...object, visible: !object.visible } : object,
      ),
    })),
  toggleObjectLocked: (objectId) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId ? { ...object, locked: !object.locked } : object,
      ),
    })),
  toggleObjectBoundsVisible: (objectId) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId
          ? { ...object, boundsVisible: !object.boundsVisible }
          : object,
      ),
    })),
  removeObject: (objectId) =>
    set((state) => {
      const removedObject = state.objects.find((object) => object.id === objectId);
      const removedAssetIds = new Set<string>();
      if (removedObject?.assetId) {
        removedAssetIds.add(removedObject.assetId);
      }
      removedObject?.materialOverrides?.forEach((override) => {
        if (override.textureAssetId) {
          removedAssetIds.add(override.textureAssetId);
        }
      });
      const removedAssets = state.assets.filter((asset) =>
        removedAssetIds.has(asset.id),
      );
      removedAssets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl));
      window.dispatchEvent(
        new CustomEvent("scene-object-remove-request", {
          detail: objectId,
        }),
      );

      return {
        assets: state.assets.filter((asset) => !removedAssetIds.has(asset.id)),
        objects: state.objects.filter((object) => object.id !== objectId),
        activeObjectId:
          state.activeObjectId === objectId ? undefined : state.activeObjectId,
      };
    }),
  updateObjectMaterial: (objectId, materialId, updates) =>
    set((state) => {
      const textureAssetsToRemove = new Set<string>();
      const objects = state.objects.map((object) => {
        if (object.id !== objectId) {
          return object;
        }
        const existingOverrides = object.materialOverrides ?? [];
        const previous = existingOverrides.find(
          (override) => override.materialId === materialId,
        );
        if (
          updates.textureAssetId &&
          previous?.textureAssetId &&
          previous.textureAssetId !== updates.textureAssetId
        ) {
          textureAssetsToRemove.add(previous.textureAssetId);
        }
        const nextOverride: MaterialOverride = {
          materialId,
          materialName: updates.materialName ?? previous?.materialName ?? materialId,
          ...previous,
          ...updates,
        };
        const nextOverrides = previous
          ? existingOverrides.map((override) =>
              override.materialId === materialId ? nextOverride : override,
            )
          : [...existingOverrides, nextOverride];

        return {
          ...object,
          materialOverrides: nextOverrides,
        };
      });

      const removedAssets = state.assets.filter((asset) =>
        textureAssetsToRemove.has(asset.id),
      );
      removedAssets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl));

      return {
        objects,
        assets: state.assets.filter((asset) => !textureAssetsToRemove.has(asset.id)),
      };
    }),
  addAsset: (asset) =>
    set((state) => ({
      assets: [...state.assets, asset],
    })),
  addSceneObject: (object) =>
    set((state) => ({
      objects: [...state.objects, object],
      activeObjectId: object.id,
      selectedCameraId: undefined,
    })),
  addImportedModel: (asset, object) =>
    set((state) => ({
      assets: [...state.assets, asset],
      objects: [...state.objects, object],
      activeObjectId: object.id,
      selectedCameraId: undefined,
      importError: undefined,
    })),
  addSnapshot: (snapshot) =>
    set((state) => ({
      snapshots: [snapshot, ...state.snapshots],
    })),
  setImportError: (message) => set({ importError: message }),
  releaseRuntimeAssets: () =>
    set((state) => {
      state.assets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl));
      return {
      assets: [],
      objects: state.objects.filter((object) => object.type === "character"),
        worldSettings: {
          ...state.worldSettings,
          panoramaSphere: {
            ...state.worldSettings.panoramaSphere,
            assetId: undefined,
            visible: false,
          },
        },
        activeObjectId:
          state.activeObjectId &&
          state.objects.find((object) => object.id === state.activeObjectId)
            ?.type === "character"
            ? state.activeObjectId
            : undefined,
        selectedCameraId: undefined,
        cameraPreviewActive: false,
      };
    }),
}));
