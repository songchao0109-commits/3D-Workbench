import * as THREE from "three";
import { create } from "zustand";
import {
  applyAnimationToProjectState,
  clampAnimationDuration,
  clampAnimationFps,
  clampAnimationTime,
  clearAnimationInPoint,
  clearAnimationOutPoint,
  moveCameraCuts,
  moveTimelineKeyframes,
  normalizeAnimationRangePoints,
  resizeCameraCut,
  recordBoneRotationChannel,
  recordCameraChannels,
  recordIkTargetChannel,
  recordObjectTransformChannels,
  removeCameraCuts,
  removeTimelineKeyframes,
  setAnimationInPoint,
  setAnimationOutPoint,
  upsertAnimationCameraCut,
} from "../domain/animationTimeline";
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
  TimelineKeyframeRef,
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
  setAnimationTime: (time: number) => void;
  setAnimationPlaying: (playing: boolean) => void;
  toggleAnimationPlayback: () => void;
  setAnimationAutoKeyEnabled: (enabled: boolean) => void;
  setAnimationAutoKeyMode: (mode: ProjectState["animation"]["autoKeyMode"]) => void;
  setAnimationDuration: (duration: number) => void;
  setAnimationFps: (fps: number) => void;
  setAnimationInPoint: (time: number) => void;
  setAnimationOutPoint: (time: number) => void;
  clearAnimationInPoint: () => void;
  clearAnimationOutPoint: () => void;
  setAnimationInPointToCurrentTime: () => void;
  setAnimationOutPointToCurrentTime: () => void;
  stepAnimation: (deltaSeconds: number) => void;
  captureCurrentKeyframe: () => { ok: true } | { ok: false; message: string };
  addCurrentCameraCut: () => { ok: true } | { ok: false; message: string };
  addCameraCutAtTime: (cameraId: string) => { ok: true } | { ok: false; message: string };
  removeSelectedTimelineKeyframe: (refs: TimelineKeyframeRef[]) => void;
  moveSelectedTimelineKeyframe: (refs: TimelineKeyframeRef[], time: number) => void;
  resizeCameraCutClip: (
    cutId: string,
    edge: "start" | "end",
    time: number,
  ) => void;
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

function applyAnimationState(state: ProjectState, time: number) {
  const nextTime = clampAnimationTime(time, state.animation.duration, state.animation.fps);
  const sampled = applyAnimationToProjectState(state, nextTime);
  return {
    ...sampled,
    animation: {
      ...state.animation,
      currentTime: nextTime,
    },
  };
}

function captureManualSelectionKeyframes(state: ProjectState) {
  const currentTime = clampAnimationTime(
    state.animation.currentTime,
    state.animation.duration,
    state.animation.fps,
  );
  const activeObject = state.activeObjectId
    ? state.objects.find((object) => object.id === state.activeObjectId)
    : undefined;
  const activeCamera = state.selectedCameraId
    ? state.cameras.find((camera) => camera.id === state.selectedCameraId)
    : undefined;

  if (activeObject?.rig?.hasSkeleton && activeObject.rig.boneControlActive) {
    if (activeObject.rig.mode === "fk" && activeObject.rig.activeBoneId) {
      const activeBone = activeObject.rig.bones.find(
        (bone) => bone.id === activeObject.rig?.activeBoneId,
      );
      if (!activeBone) {
        return { ok: false as const, message: "当前骨骼不存在，无法记录关键帧" };
      }
      return {
        ok: true as const,
        bindings: recordBoneRotationChannel(
          state.animation.bindings,
          activeObject,
          activeBone,
          currentTime,
        ),
      };
    }

    if (activeObject.rig.mode === "ik" && activeObject.rig.activeIkChainId) {
      const activeChain = activeObject.rig.ikChains.find(
        (chain) => chain.id === activeObject.rig?.activeIkChainId,
      );
      if (!activeChain) {
        return { ok: false as const, message: "当前 IK 节点不存在，无法记录关键帧" };
      }
      return {
        ok: true as const,
        bindings: recordIkTargetChannel(
          state.animation.bindings,
          activeObject,
          activeChain,
          currentTime,
        ),
      };
    }
  }

  if (activeObject) {
    return {
      ok: true as const,
      bindings: recordObjectTransformChannels(
        state.animation.bindings,
        activeObject,
        currentTime,
      ),
    };
  }

  if (activeCamera) {
    return {
      ok: true as const,
      bindings: recordCameraChannels(state.animation.bindings, activeCamera, currentTime),
    };
  }

  return { ok: false as const, message: "请先选择对象、机位或骨骼控制节点" };
}

function captureCameraCut(state: ProjectState) {
  const cameraId = state.selectedCameraId ?? state.activeCameraId;
  return captureCameraCutForCamera(state, cameraId);
}

function captureCameraCutForCamera(state: ProjectState, cameraId?: string) {
  if (!cameraId) {
    return { ok: false as const, message: "请先选择一个机位，再添加机位序列" };
  }
  return {
    ok: true as const,
    cameraCuts: upsertAnimationCameraCut(
      state.animation.cameraCuts,
      cameraId,
      clampAnimationTime(
        state.animation.currentTime,
        state.animation.duration,
        state.animation.fps,
      ),
      state.animation.duration,
      state.animation.fps,
    ),
  };
}

function maybeAutoKeyObjectTransform(
  state: ProjectState,
  objectId: string,
  nextObjects: SceneObject[],
) {
  if (!state.animation.autoKeyEnabled || state.activeObjectId !== objectId) {
    return state.animation;
  }
  const activeObject = nextObjects.find((object) => object.id === objectId);
  if (!activeObject) {
    return state.animation;
  }
  return {
    ...state.animation,
    bindings: recordObjectTransformChannels(
      state.animation.bindings,
      activeObject,
      state.animation.currentTime,
      state.animation.autoKeyMode,
    ),
  };
}

function maybeAutoKeyCamera(
  state: ProjectState,
  cameraId: string,
  nextCameras: SceneCamera[],
) {
  if (!state.animation.autoKeyEnabled || state.selectedCameraId !== cameraId) {
    return state.animation;
  }
  const activeCamera = nextCameras.find((camera) => camera.id === cameraId);
  if (!activeCamera) {
    return state.animation;
  }
  return {
    ...state.animation,
    bindings: recordCameraChannels(
      state.animation.bindings,
      activeCamera,
      state.animation.currentTime,
      state.animation.autoKeyMode,
    ),
  };
}

function maybeAutoKeyBone(
  state: ProjectState,
  objectId: string,
  boneId: string,
  nextObjects: SceneObject[],
) {
  if (!state.animation.autoKeyEnabled || state.activeObjectId !== objectId) {
    return state.animation;
  }
  const activeObject = nextObjects.find((object) => object.id === objectId);
  const activeBone = activeObject?.rig?.bones.find((bone) => bone.id === boneId);
  if (!activeObject || !activeBone) {
    return state.animation;
  }
  return {
    ...state.animation,
    bindings: recordBoneRotationChannel(
      state.animation.bindings,
      activeObject,
      activeBone,
      state.animation.currentTime,
      state.animation.autoKeyMode,
    ),
  };
}

function maybeAutoKeyIkChain(
  state: ProjectState,
  objectId: string,
  chainId: string,
  nextObjects: SceneObject[],
) {
  if (!state.animation.autoKeyEnabled || state.activeObjectId !== objectId) {
    return state.animation;
  }
  const activeObject = nextObjects.find((object) => object.id === objectId);
  const activeChain = activeObject?.rig?.ikChains.find((chain) => chain.id === chainId);
  if (!activeObject || !activeChain) {
    return state.animation;
  }
  return {
    ...state.animation,
    bindings: recordIkTargetChannel(
      state.animation.bindings,
      activeObject,
      activeChain,
      state.animation.currentTime,
      state.animation.autoKeyMode,
    ),
  };
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
        targetOffset: camera.targetOffset ?? [0, 0, 0],
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
    set((state) => {
      const cameras = state.cameras.map((camera) =>
        camera.id === cameraId ? { ...camera, ...updates } : camera,
      );
      return {
        cameras,
        animation: maybeAutoKeyCamera(state, cameraId, cameras),
      };
    }),
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
        targetOffset: [0, 0, 0],
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
    set((state) => {
      const objects = state.objects.map((object) =>
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
      );
      return {
        objects,
        animation: maybeAutoKeyBone(state, objectId, boneId, objects),
      };
    }),
  updateBonePosition: (objectId, boneId, position) =>
    set((state) => {
      const objects = state.objects.map((object) =>
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
      );
      return {
        objects,
      };
    }),
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
    set((state) => {
      const objects = state.objects.map((object) =>
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
      );
      return {
        objects,
        animation: maybeAutoKeyIkChain(state, objectId, chainId, objects),
      };
    }),
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
    set((state) => {
      const objects = state.objects.map((object) => {
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
      });
      return {
        objects,
        animation: maybeAutoKeyObjectTransform(state, objectId, objects),
      };
    }),
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
  setAnimationTime: (time) =>
    set((state) => applyAnimationState(state, time)),
  setAnimationPlaying: (playing) =>
    set((state) => ({
      animation: {
        ...state.animation,
        currentTime:
          playing && state.animation.currentTime >= state.animation.duration - 0.0001
            ? 0
            : state.animation.currentTime,
        isPlaying: playing,
      },
    })),
  toggleAnimationPlayback: () =>
    set((state) => {
      const nextPlaying = !state.animation.isPlaying;
      return {
        animation: {
          ...state.animation,
          currentTime:
            nextPlaying && state.animation.currentTime >= state.animation.duration - 0.0001
              ? 0
              : state.animation.currentTime,
          isPlaying: nextPlaying,
        },
      };
    }),
  setAnimationAutoKeyEnabled: (enabled) =>
    set((state) => ({
      animation: {
        ...state.animation,
        autoKeyEnabled: enabled,
      },
    })),
  setAnimationAutoKeyMode: (mode) =>
    set((state) => ({
      animation: {
        ...state.animation,
        autoKeyMode: mode,
      },
    })),
  setAnimationDuration: (duration) =>
    set((state) => {
      const nextDuration = clampAnimationDuration(duration);
      const nextAnimation = normalizeAnimationRangePoints({
        ...state.animation,
        duration: nextDuration,
      });
      const nextState = {
        ...state,
        animation: nextAnimation,
      };
      return applyAnimationState(nextState, state.animation.currentTime);
    }),
  setAnimationFps: (fps) =>
    set((state) => {
      const nextFps = clampAnimationFps(fps);
      const nextAnimation = normalizeAnimationRangePoints({
        ...state.animation,
        fps: nextFps,
      });
      const nextState = {
        ...state,
        animation: nextAnimation,
      };
      return applyAnimationState(nextState, state.animation.currentTime);
    }),
  setAnimationInPoint: (time) =>
    set((state) => ({
      animation: setAnimationInPoint(state.animation, time),
    })),
  setAnimationOutPoint: (time) =>
    set((state) => ({
      animation: setAnimationOutPoint(state.animation, time),
    })),
  clearAnimationInPoint: () =>
    set((state) => ({
      animation: clearAnimationInPoint(state.animation),
    })),
  clearAnimationOutPoint: () =>
    set((state) => ({
      animation: clearAnimationOutPoint(state.animation),
    })),
  setAnimationInPointToCurrentTime: () =>
    set((state) => {
      const currentInPointTime =
        state.animation.inPointTime === undefined
          ? undefined
          : clampAnimationTime(
              state.animation.inPointTime,
              state.animation.duration,
              state.animation.fps,
            );
      const currentTime = clampAnimationTime(
        state.animation.currentTime,
        state.animation.duration,
        state.animation.fps,
      );
      return {
        animation:
          currentInPointTime !== undefined && Math.abs(currentInPointTime - currentTime) < 0.0001
            ? clearAnimationInPoint(state.animation)
            : setAnimationInPoint(state.animation, currentTime),
      };
    }),
  setAnimationOutPointToCurrentTime: () =>
    set((state) => {
      const currentOutPointTime =
        state.animation.outPointTime === undefined
          ? undefined
          : clampAnimationTime(
              state.animation.outPointTime,
              state.animation.duration,
              state.animation.fps,
            );
      const currentTime = clampAnimationTime(
        state.animation.currentTime,
        state.animation.duration,
        state.animation.fps,
      );
      return {
        animation:
          currentOutPointTime !== undefined &&
          Math.abs(currentOutPointTime - currentTime) < 0.0001
            ? clearAnimationOutPoint(state.animation)
            : setAnimationOutPoint(state.animation, currentTime),
      };
    }),
  stepAnimation: (deltaSeconds) =>
    set((state) => {
      if (!state.animation.isPlaying) {
        return state;
      }
      const duration = clampAnimationDuration(state.animation.duration);
      const rawNextTime = state.animation.currentTime + Math.max(0, deltaSeconds);
      const shouldLoop = state.animation.loop;
      const nextTime =
        rawNextTime > duration
          ? shouldLoop
            ? rawNextTime % duration
            : duration
          : rawNextTime;
      if (!shouldLoop && rawNextTime >= duration) {
        return {
          animation: {
            ...state.animation,
            currentTime: nextTime,
            isPlaying: false,
          },
        };
      }
      return {
        animation: {
          ...state.animation,
          currentTime: nextTime,
        },
      };
    }),
  captureCurrentKeyframe: () => {
    const state = useProjectStore.getState();
    const result = captureManualSelectionKeyframes(state);
    if (!result.ok) {
      return result;
    }
    set((current) => ({
      animation: {
        ...current.animation,
        bindings: result.bindings,
      },
    }));
    return { ok: true as const };
  },
  addCurrentCameraCut: () => {
    const state = useProjectStore.getState();
    const result = captureCameraCut(state);
    if (!result.ok) {
      return result;
    }
    set((current) => ({
      animation: {
        ...current.animation,
        cameraCuts: result.cameraCuts,
      },
    }));
    return { ok: true as const };
  },
  addCameraCutAtTime: (cameraId) => {
    const state = useProjectStore.getState();
    const result = captureCameraCutForCamera(state, cameraId);
    if (!result.ok) {
      return result;
    }
    set((current) => ({
      animation: {
        ...current.animation,
        cameraCuts: result.cameraCuts,
      },
    }));
    return { ok: true as const };
  },
  removeSelectedTimelineKeyframe: (refs) =>
    set((state) => ({
      animation: {
        ...state.animation,
        bindings: removeTimelineKeyframes(state.animation.bindings, refs),
        cameraCuts: removeCameraCuts(state.animation.cameraCuts, refs),
      },
    })),
  moveSelectedTimelineKeyframe: (refs, time) =>
    set((state) => {
      const nextTime = clampAnimationTime(
        time,
        state.animation.duration,
        state.animation.fps,
      );
      const nextBindings = moveTimelineKeyframes(
        state.animation.bindings,
        refs,
        nextTime,
      );
      const nextCameraCuts = moveCameraCuts(
        state.animation.cameraCuts,
        refs,
        nextTime,
        state.animation.duration,
        state.animation.fps,
      );
      return applyAnimationState(
        {
          ...state,
          animation: {
            ...state.animation,
            bindings: nextBindings,
            cameraCuts: nextCameraCuts,
          },
        },
        state.animation.currentTime,
      );
    }),
  resizeCameraCutClip: (cutId, edge, time) =>
    set((state) => {
      const nextCameraCuts = resizeCameraCut(
        state.animation.cameraCuts,
        cutId,
        edge,
        time,
        state.animation.duration,
        state.animation.fps,
      );
      return {
        animation: {
          ...state.animation,
          cameraCuts: nextCameraCuts,
        },
      };
    }),
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
