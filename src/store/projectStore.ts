import * as THREE from "three";
import { emitAppFeedback } from "../app/appFeedback";
import { create } from "zustand";
import {
  applyAnimationToProjectState,
  clampAnimationDuration,
  clampAnimationFps,
  clampAnimationTime,
  clearAnimationInPoint,
  clearAnimationOutPoint,
  hasCameraCutAtTime,
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
import { sceneRegistry } from "../three/sceneRegistry";
import type {
  AssetRecord,
  BoneRecord,
  IkChainRecord,
  MaterialOverride,
  ObjectRig,
  OutputFrame,
  ProjectState,
  SceneCamera,
  SceneGroup,
  SceneObject,
  SnapshotRecord,
  TimelineKeyframeRef,
  ToolMode,
  TransformMode,
  Vec3,
  WorldSettings,
} from "../domain/projectTypes";

type ProjectClipboard = {
  objects: SceneObject[];
  groups: SceneGroup[];
  pasteCount: number;
};

type ProjectHistoryState = {
  past: ProjectState[];
  future: ProjectState[];
  limit: number;
};

type DuplicateSelectionResult =
  | { ok: true; objectIds: string[]; sourceObjectIds: string[] }
  | { ok: false; message: string };

type AltDuplicatePreviewRestore = {
  previewObjectIds: string[];
  originalObjectIds: string[];
  originalActiveGroupId?: string;
  originalActiveObjectId?: string;
  originalTransforms: Array<
    Pick<SceneObject, "id" | "position" | "rotation" | "scale">
  >;
};

type ProjectStore = ProjectState & {
  clipboard?: ProjectClipboard;
  history: ProjectHistoryState;
  historyDraft?: ProjectState;
  setActiveTool: (tool: ToolMode) => void;
  setTransformMode: (mode: TransformMode) => void;
  setOutputFrame: (frame: OutputFrame) => void;
  beginHistoryDraft: () => void;
  commitHistoryDraft: () => void;
  clearSelection: () => void;
  setActiveObject: (objectId?: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  selectObjectOrGroup: (objectId: string) => void;
  toggleSelectionUnit: (objectId: string) => void;
  setSelectedObjects: (objectIds: string[], primaryObjectId?: string) => void;
  setActiveGroup: (groupId?: string) => void;
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
  copySelection: () => { ok: true } | { ok: false; message: string };
  pasteClipboard: (options?: { offset?: number }) => DuplicateSelectionResult;
  duplicateSelection: (options?: { offset?: number }) => DuplicateSelectionResult;
  cancelAltDuplicatePreview: (preview: AltDuplicatePreviewRestore) => void;
  removeSelection: () => void;
  setSelectionVisible: (visible: boolean) => void;
  setSelectionLocked: (locked: boolean) => void;
  groupSelection: () => { ok: true; groupId: string } | { ok: false; message: string };
  ungroupSelection: () => void;
  updateGroup: (groupId: string, updates: Partial<SceneGroup>) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  toggleGroupVisible: (groupId: string) => void;
  toggleGroupLocked: (groupId: string) => void;
  removeGroup: (groupId: string) => void;
  moveObjectToGroup: (objectId: string, targetGroupId?: string) => void;
  moveSelectionToGroup: (targetGroupId: string) => void;
  snapSelectionToGround: () => void;
  alignSelection: (
    mode:
      | "x"
      | "y"
      | "z"
      | "left"
      | "right"
      | "bottom"
      | "top"
      | "front"
      | "back"
      | "center",
  ) => void;
  distributeSelection: (axis: "x" | "z") => void;
  undo: () => void;
  redo: () => void;
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
  toggleAnimationLoop: () => void;
  toggleAnimationCameraCutsEnabled: () => void;
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

const PLAYBACK_RANGE_EPSILON = 0.0001;

function getAnimationPlaybackRange(animation: ProjectState["animation"]) {
  const duration = clampAnimationDuration(animation.duration);
  const startTime =
    animation.inPointTime === undefined
      ? 0
      : clampAnimationTime(animation.inPointTime, duration, animation.fps);
  const endTime =
    animation.outPointTime === undefined
      ? duration
      : clampAnimationTime(animation.outPointTime, duration, animation.fps);

  return {
    startTime,
    endTime,
  };
}

function getPlaybackStartTime(animation: ProjectState["animation"]) {
  const { startTime, endTime } = getAnimationPlaybackRange(animation);
  const currentTime = clampAnimationTime(
    animation.currentTime,
    animation.duration,
    animation.fps,
  );
  const outsideRange =
    currentTime < startTime - PLAYBACK_RANGE_EPSILON ||
    currentTime >= endTime - PLAYBACK_RANGE_EPSILON;

  return outsideRange ? startTime : currentTime;
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
  const activeGroup = state.activeGroupId
    ? state.groups.find((group) => group.id === state.activeGroupId)
    : undefined;

  if (activeGroup) {
    const groupObjects = activeGroup.objectIds
      .map((objectId) => state.objects.find((object) => object.id === objectId))
      .filter((object): object is SceneObject => Boolean(object));
    if (!groupObjects.length) {
      return { ok: false as const, message: "当前组没有可插帧对象" };
    }
    return {
      ok: true as const,
      bindings: groupObjects.reduce(
        (bindings, object) =>
          recordObjectTransformChannels(bindings, object, currentTime),
        state.animation.bindings,
      ),
    };
  }

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
    return { ok: false as const, message: "请先选择一个机位，再添加机位切换点" };
  }
  const currentTime = clampAnimationTime(
    state.animation.currentTime,
    state.animation.duration,
    state.animation.fps,
  );
  if (
    hasCameraCutAtTime(
      state.animation.cameraCuts,
      currentTime,
      state.animation.duration,
      state.animation.fps,
    )
  ) {
    return { ok: false as const, message: "该时间点已有机位切换点" };
  }
  return {
    ok: true as const,
    cameraCuts: upsertAnimationCameraCut(
      state.animation.cameraCuts,
      cameraId,
      currentTime,
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
  const activeGroup = state.activeGroupId
    ? state.groups.find((group) => group.id === state.activeGroupId)
    : undefined;
  const shouldAutoKey =
    state.activeObjectId === objectId || Boolean(activeGroup?.objectIds.includes(objectId));
  if (!state.animation.autoKeyEnabled || !shouldAutoKey) {
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

const historyLimit = 50;

function cloneProjectState(state: ProjectState): ProjectState {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: state.schemaVersion,
      projectName: state.projectName,
      activeShotId: state.activeShotId,
      activeObjectId: state.activeObjectId,
      activeGroupId: state.activeGroupId,
      selectedObjectIds: state.selectedObjectIds,
      selectedCameraId: state.selectedCameraId,
      activeCameraId: state.activeCameraId,
      activeTool: state.activeTool,
      transformMode: state.transformMode,
      cameraPreviewActive: state.cameraPreviewActive,
      outputFrame: state.outputFrame,
      worldSettings: state.worldSettings,
      assets: state.assets,
      objects: state.objects,
      groups: state.groups,
      cameras: state.cameras,
      snapshots: state.snapshots,
      animation: state.animation,
      importError: state.importError,
    }),
  ) as ProjectState;
}

function withHistory(
  state: ProjectStore,
  updates: Partial<ProjectStore>,
): Partial<ProjectStore> {
  if (state.historyDraft) {
    return {
      ...updates,
      history: {
        ...state.history,
        future: [],
      },
      historyDraft: state.historyDraft,
    };
  }
  return {
    ...updates,
    history: {
      past: [...state.history.past, cloneProjectState(state)].slice(-state.history.limit),
      future: [],
      limit: state.history.limit,
    },
  };
}

function removeAnimationTargets(
  animation: ProjectState["animation"],
  options: {
    objectIds?: Set<string>;
    cameraIds?: Set<string>;
  },
): ProjectState["animation"] {
  const objectIds = options.objectIds ?? new Set<string>();
  const cameraIds = options.cameraIds ?? new Set<string>();
  if (!objectIds.size && !cameraIds.size) {
    return animation;
  }

  return {
    ...animation,
    bindings: animation.bindings.filter((binding) => {
      if (binding.targetType === "object") {
        return !objectIds.has(binding.targetId);
      }
      return !cameraIds.has(binding.targetId);
    }),
    cameraCuts: cameraIds.size
      ? animation.cameraCuts.filter((cut) => !cameraIds.has(cut.cameraId))
      : animation.cameraCuts,
  };
}

function restoreSnapshot(
  snapshot: ProjectState,
  history: ProjectHistoryState,
): Partial<ProjectStore> {
  return {
    ...cloneProjectState(snapshot),
    history,
    clipboard: undefined,
    historyDraft: undefined,
  };
}

function projectStatesEqual(left: ProjectState, right: ProjectState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeObjectIds(objectIds: string[], objects: SceneObject[]) {
  const validIds = new Set(objects.map((object) => object.id));
  return Array.from(new Set(objectIds.filter((id) => validIds.has(id))));
}

function nextObjectCopyName(name: string, existingNames: Set<string>) {
  const baseName = `${name} 副本`;
  if (!existingNames.has(baseName)) {
    existingNames.add(baseName);
    return baseName;
  }
  let index = 2;
  while (existingNames.has(`${baseName} ${index}`)) {
    index += 1;
  }
  const nextName = `${baseName} ${index}`;
  existingNames.add(nextName);
  return nextName;
}

function offsetObject(object: SceneObject, offset: number): SceneObject {
  return {
    ...object,
    position: [
      object.position[0] + offset,
      object.position[1],
      object.position[2] + offset,
    ],
    rig: object.rig
      ? {
          ...object.rig,
          ikChains: object.rig.ikChains.map((chain) => ({
            ...chain,
            targetPosition: [
              chain.targetPosition[0] + offset,
              chain.targetPosition[1],
              chain.targetPosition[2] + offset,
            ],
          })),
        }
      : object.rig,
  };
}

function getSelectedObjectIds(state: ProjectStore) {
  const selectedIds = state.selectedObjectIds.length
    ? state.selectedObjectIds
    : state.activeObjectId
      ? [state.activeObjectId]
      : [];
  return normalizeObjectIds(selectedIds, state.objects);
}

function getObjectGroupId(groups: SceneGroup[], objectId: string) {
  return groups.find((group) => group.objectIds.includes(objectId))?.id;
}

function getExactSelectedGroupId(groups: SceneGroup[], objectIds: string[]) {
  const selectedIds = new Set(objectIds);
  return groups.find(
    (group) =>
      group.objectIds.length === selectedIds.size &&
      group.objectIds.every((objectId) => selectedIds.has(objectId)),
  )?.id;
}

function getCopyContextError(state: ProjectStore) {
  if (state.selectedCameraId) {
    return "当前选中的是机位，不能复制对象";
  }
  const selectedObjectIds = getSelectedObjectIds(state);
  if (
    state.objects.some(
      (object) => selectedObjectIds.includes(object.id) && object.rig?.boneControlActive,
    )
  ) {
    return "调整骨骼或 IK 时不能复制对象";
  }
  if (!selectedObjectIds.length) {
    return "请先选择要复制的对象";
  }
  return undefined;
}

function getRuntimeObjectBounds(objectId: string) {
  const runtimeObject = sceneRegistry.getObject(objectId);
  if (!runtimeObject) {
    return undefined;
  }

  const box = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  const parentInverseMatrix = new THREE.Matrix4()
    .copy(runtimeObject.parent?.matrixWorld ?? new THREE.Matrix4())
    .invert();
  const meshMatrix = new THREE.Matrix4();
  let hasBounds = false;

  runtimeObject.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!("geometry" in mesh) || !mesh.geometry) {
      return;
    }
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    if (!mesh.geometry.boundingBox) {
      return;
    }
    meshMatrix.multiplyMatrices(parentInverseMatrix, mesh.matrixWorld);
    meshBounds.copy(mesh.geometry.boundingBox).applyMatrix4(meshMatrix);
    if (!hasBounds) {
      box.copy(meshBounds);
      hasBounds = true;
      return;
    }
    box.union(meshBounds);
  });

  return hasBounds ? box.clone() : undefined;
}

function getRuntimeObjectMinY(objectId: string) {
  return getRuntimeObjectBounds(objectId)?.min.y;
}

function getReferencedAssetIds(state: ProjectState, objects = state.objects) {
  const ids = new Set<string>();
  objects.forEach((object) => {
    if (object.assetId) {
      ids.add(object.assetId);
    }
    object.materialOverrides?.forEach((override) => {
      if (override.textureAssetId) {
        ids.add(override.textureAssetId);
      }
    });
  });
  if (state.worldSettings.panoramaSphere.assetId) {
    ids.add(state.worldSettings.panoramaSphere.assetId);
  }
  return ids;
}

function removeUnreferencedAssets(
  state: ProjectState,
  objects: SceneObject[],
  extraCandidateIds: Iterable<string>,
) {
  const referencedIds = getReferencedAssetIds(state, objects);
  const candidateIds = new Set(extraCandidateIds);
  const removableIds = new Set(
    Array.from(candidateIds).filter((assetId) => !referencedIds.has(assetId)),
  );
  state.assets
    .filter((asset) => removableIds.has(asset.id))
    .forEach((asset) => URL.revokeObjectURL(asset.objectUrl));
  return state.assets.filter((asset) => !removableIds.has(asset.id));
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...defaultProject,
  clipboard: undefined,
  history: {
    past: [],
    future: [],
    limit: historyLimit,
  },
  historyDraft: undefined,
  setActiveTool: (tool) => set({ activeTool: tool }),
  setTransformMode: (mode) => set({ transformMode: mode, activeTool: "move" }),
  setOutputFrame: (frame) => set({ outputFrame: frame, activeTool: "aspect" }),
  beginHistoryDraft: () =>
    set((state) =>
      state.historyDraft
        ? state
        : {
            historyDraft: cloneProjectState(state),
            history: {
              ...state.history,
              future: [],
            },
          },
    ),
  commitHistoryDraft: () =>
    set((state) => {
      if (!state.historyDraft) {
        return state;
      }
      const draft = state.historyDraft;
      const current = cloneProjectState(state);
      if (projectStatesEqual(draft, current)) {
        return {
          historyDraft: undefined,
        };
      }
      return {
        historyDraft: undefined,
        history: {
          past: [...state.history.past, draft].slice(-state.history.limit),
          future: [],
          limit: state.history.limit,
        },
      };
    }),
  clearSelection: () =>
    set({
      activeObjectId: undefined,
      activeGroupId: undefined,
      selectedObjectIds: [],
      selectedCameraId: undefined,
    }),
  setActiveObject: (objectId) =>
    set((state) => ({
      activeObjectId: objectId,
      activeGroupId: undefined,
      selectedObjectIds: objectId ? [objectId] : [],
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
  toggleObjectSelection: (objectId) =>
    set((state) => {
      const exists = state.selectedObjectIds.includes(objectId);
      const selectedObjectIds = exists
        ? state.selectedObjectIds.filter((id) => id !== objectId)
        : [...state.selectedObjectIds, objectId];
      const normalizedIds = normalizeObjectIds(selectedObjectIds, state.objects);
      return {
        selectedObjectIds: normalizedIds,
        activeObjectId: normalizedIds.at(-1),
        activeGroupId: undefined,
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
      };
    }),
  selectObjectOrGroup: (objectId) =>
    set((state) => {
      const groupId = getObjectGroupId(state.groups, objectId);
      const group = groupId ? state.groups.find((item) => item.id === groupId) : undefined;
      const objects = state.objects.map((object) =>
        object.id === objectId && object.rig
          ? {
              ...object,
              rig: {
                ...object.rig,
                boneControlActive: false,
              },
            }
          : object,
      );
      if (!group) {
        return {
          activeObjectId: objectId,
          activeGroupId: undefined,
          selectedObjectIds: [objectId],
          selectedCameraId: undefined,
          objects,
        };
      }
      if (state.activeGroupId === group.id) {
        return {
          activeObjectId: objectId,
          activeGroupId: undefined,
          selectedObjectIds: [objectId],
          selectedCameraId: undefined,
          objects,
        };
      }
      return {
        activeObjectId: group.objectIds[0],
        activeGroupId: group.id,
        selectedObjectIds: [...group.objectIds],
        selectedCameraId: undefined,
        objects,
      };
    }),
  toggleSelectionUnit: (objectId) =>
    set((state) => {
      const groupId = getObjectGroupId(state.groups, objectId);
      const group = groupId ? state.groups.find((item) => item.id === groupId) : undefined;
      const unitIds = group?.objectIds ?? [objectId];
      const selectedIds = new Set(state.selectedObjectIds);
      const unitIsSelected = unitIds.every((id) => selectedIds.has(id));
      unitIds.forEach((id) => {
        if (unitIsSelected) {
          selectedIds.delete(id);
        } else {
          selectedIds.add(id);
        }
      });
      const selectedObjectIds = normalizeObjectIds(Array.from(selectedIds), state.objects);
      const activeGroupId = getExactSelectedGroupId(state.groups, selectedObjectIds);
      const activeGroup = activeGroupId
        ? state.groups.find((item) => item.id === activeGroupId)
        : undefined;
      return {
        selectedObjectIds,
        activeObjectId: activeGroup?.objectIds[0] ?? selectedObjectIds.at(-1),
        activeGroupId,
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
      };
    }),
  setSelectedObjects: (objectIds, primaryObjectId) =>
    set((state) => {
      const selectedObjectIds = normalizeObjectIds(objectIds, state.objects);
      const activeGroupId = getExactSelectedGroupId(state.groups, selectedObjectIds);
      const activeGroup = activeGroupId
        ? state.groups.find((item) => item.id === activeGroupId)
        : undefined;
      return {
        selectedObjectIds,
        activeObjectId: activeGroup?.objectIds[0] ??
          (primaryObjectId && selectedObjectIds.includes(primaryObjectId)
            ? primaryObjectId
            : selectedObjectIds.at(-1)),
        activeGroupId,
        selectedCameraId: undefined,
      };
    }),
  setActiveGroup: (groupId) =>
    set((state) => {
      const group = groupId
        ? state.groups.find((item) => item.id === groupId)
        : undefined;
      return {
        activeGroupId: group?.id,
        selectedObjectIds: group ? [...group.objectIds] : [],
        activeObjectId: group?.objectIds[0],
        selectedCameraId: undefined,
        objects: group
          ? state.objects.map((object) =>
              group.objectIds.includes(object.id) && object.rig
                ? {
                    ...object,
                    rig: {
                      ...object.rig,
                      boneControlActive: false,
                    },
                  }
                : object,
            )
          : state.objects,
      };
    }),
  setActiveCamera: (cameraId) =>
    set({
      activeCameraId: cameraId,
      selectedCameraId: cameraId,
      activeObjectId: undefined,
      activeGroupId: undefined,
      selectedObjectIds: [],
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

      return withHistory(state, {
        cameras: [...state.cameras, nextCamera],
        activeCameraId: id,
        selectedCameraId: id,
        activeObjectId: undefined,
        activeGroupId: undefined,
        selectedObjectIds: [],
      });
    }),
  updateCamera: (cameraId, updates) =>
    set((state) => {
      const cameras = state.cameras.map((camera) =>
        camera.id === cameraId ? { ...camera, ...updates } : camera,
      );
      return withHistory(state, {
        cameras,
        animation: maybeAutoKeyCamera(state, cameraId, cameras),
      });
    }),
  updateWorldSettings: (updates) =>
    set((state) => {
      return withHistory(state, {
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
      });
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

      return withHistory(state, {
        assets: nextAssets,
        worldSettings: {
          ...state.worldSettings,
          panoramaSphere: {
            ...state.worldSettings.panoramaSphere,
            assetId: asset?.id,
            visible: asset ? true : false,
          },
        },
      });
    }),
  toggleCameraVisible: (cameraId) =>
    set((state) => withHistory(state, {
      cameras: state.cameras.map((camera) =>
        camera.id === cameraId ? { ...camera, visible: !camera.visible } : camera,
      ),
    })),
  toggleCameraLocked: (cameraId) =>
    set((state) => withHistory(state, {
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

      return withHistory(state, {
        cameras: nextCameras,
        activeCameraId: nextActiveCameraId,
        selectedCameraId:
          state.selectedCameraId === cameraId ? undefined : state.selectedCameraId,
        activeObjectId: undefined,
        activeGroupId: undefined,
        selectedObjectIds: [],
        cameraPreviewActive:
          state.activeCameraId === cameraId ? false : state.cameraPreviewActive,
        animation: removeAnimationTargets(state.animation, {
          cameraIds: new Set([cameraId]),
        }),
      });
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
    set((state) => withHistory(state, {
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
      return withHistory(state, {
        objects,
        animation: maybeAutoKeyObjectTransform(state, objectId, objects),
      });
    }),
  updateObjectMetrics: (objectId, updates) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === objectId ? { ...object, ...updates } : object,
      ),
    })),
  toggleObjectVisible: (objectId) =>
    set((state) => withHistory(state, {
      objects: state.objects.map((object) =>
        object.id === objectId ? { ...object, visible: !object.visible } : object,
      ),
    })),
  toggleObjectLocked: (objectId) =>
    set((state) => withHistory(state, {
      objects: state.objects.map((object) =>
        object.id === objectId ? { ...object, locked: !object.locked } : object,
      ),
    })),
  toggleObjectBoundsVisible: (objectId) =>
    set((state) => withHistory(state, {
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
      window.dispatchEvent(
        new CustomEvent("scene-object-remove-request", {
          detail: objectId,
        }),
      );
      const objects = state.objects.filter((object) => object.id !== objectId);
      const groups = state.groups
        .map((group) => ({
          ...group,
          objectIds: group.objectIds.filter((id) => id !== objectId),
        }))
        .filter((group) => group.objectIds.length > 0);

      return withHistory(state, {
        assets: removeUnreferencedAssets(state, objects, removedAssetIds),
        objects,
        groups,
        animation: removeAnimationTargets(state.animation, {
          objectIds: new Set([objectId]),
        }),
        selectedObjectIds: state.selectedObjectIds.filter((id) => id !== objectId),
        activeObjectId:
          state.activeObjectId === objectId ? undefined : state.activeObjectId,
        activeGroupId:
          state.activeGroupId && groups.some((group) => group.id === state.activeGroupId)
            ? state.activeGroupId
            : undefined,
      });
    }),
  copySelection: () => {
    const state = get();
    const copyContextError = getCopyContextError(state);
    if (copyContextError) {
      return { ok: false as const, message: copyContextError };
    }
    const selectedIds = getSelectedObjectIds(state);
    const selectedSet = new Set(selectedIds);
    const groups = state.groups.filter((group) =>
      group.objectIds.some((id) => selectedSet.has(id)),
    );
    set({
      clipboard: {
        objects: state.objects.filter((object) => selectedSet.has(object.id)),
        groups,
        pasteCount: 0,
      },
    });
    return { ok: true as const };
  },
  pasteClipboard: (options) => {
    const state = get();
    const copyContextError = getCopyContextError(state);
    if (copyContextError) {
      return {
        ok: false as const,
        message: copyContextError,
      };
    }
    const clipboard = state.clipboard;
    if (!clipboard?.objects.length) {
      return { ok: false as const, message: "剪贴板为空" };
    }
    const idMap = new Map<string, string>();
    const existingNames = new Set(state.objects.map((object) => object.name));
    const offset = options?.offset ?? 0.45 * (clipboard.pasteCount + 1);
    const nextObjects = clipboard.objects.map((object) => {
      const id = `object_${crypto.randomUUID()}`;
      idMap.set(object.id, id);
      return offsetObject(
        {
          ...object,
          id,
          sourceObjectId: object.sourceObjectId ?? object.id,
          name: nextObjectCopyName(object.name, existingNames),
          rig: object.rig
            ? {
                ...object.rig,
                activeBoneId: object.rig.activeBoneId,
                activeIkChainId: object.rig.activeIkChainId,
                bones: object.rig.bones.map((bone) => ({ ...bone })),
                ikChains: object.rig.ikChains.map((chain) => ({ ...chain })),
              }
            : object.rig,
          materialOverrides: object.materialOverrides?.map((override) => ({
            ...override,
          })),
        },
        offset,
      );
    });
    const selectedIds = nextObjects.map((object) => object.id);
    const nextGroups = clipboard.groups
      .map((group) => {
        const objectIds = group.objectIds
          .map((objectId) => idMap.get(objectId))
          .filter((objectId): objectId is string => Boolean(objectId));
        if (objectIds.length < 2) {
          return undefined;
        }
        return {
          ...group,
          id: `group_${crypto.randomUUID()}`,
          name: nextObjectCopyName(group.name, new Set(state.groups.map((item) => item.name))),
          objectIds,
        };
      })
      .filter((group): group is SceneGroup => Boolean(group));

    set((current) =>
      withHistory(current, {
        objects: [...current.objects, ...nextObjects],
        groups: [...current.groups, ...nextGroups],
        selectedObjectIds: selectedIds,
        activeObjectId: selectedIds.at(-1),
        activeGroupId: nextGroups[0]?.id,
        selectedCameraId: undefined,
        clipboard: {
          ...clipboard,
          pasteCount: clipboard.pasteCount + 1,
        },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("scene-objects-clone-request", {
        detail: nextObjects.map((object) => ({
          objectId: object.id,
          sourceObjectId: object.sourceObjectId,
        })),
      }),
    );
    return {
      ok: true as const,
      objectIds: selectedIds,
      sourceObjectIds: clipboard.objects.map((object) => object.id),
    };
  },
  duplicateSelection: (options) => {
    const copyResult = get().copySelection();
    if (!copyResult.ok) {
      return copyResult;
    }
    return get().pasteClipboard(options);
  },
  cancelAltDuplicatePreview: (preview) =>
    set((state) => {
      const previewObjectIds = new Set(preview.previewObjectIds);
      const transformsById = new Map(
        preview.originalTransforms.map((object) => [object.id, object]),
      );
      previewObjectIds.forEach((objectId) => {
        window.dispatchEvent(
          new CustomEvent("scene-object-remove-request", {
            detail: objectId,
          }),
        );
      });
      const objects = state.objects
        .filter((object) => !previewObjectIds.has(object.id))
        .map((object) => {
          const transform = transformsById.get(object.id);
          return transform
            ? {
                ...object,
                position: transform.position,
                rotation: transform.rotation,
                scale: transform.scale,
              }
            : object;
        });
      let animation = {
        ...state.animation,
        bindings: state.animation.bindings.filter(
          (binding) =>
            binding.targetType !== "object" || !previewObjectIds.has(binding.targetId),
        ),
      };
      if (animation.autoKeyEnabled) {
        preview.originalObjectIds.forEach((objectId) => {
          const object = objects.find((item) => item.id === objectId);
          if (!object) {
            return;
          }
          animation = {
            ...animation,
            bindings: recordObjectTransformChannels(
              animation.bindings,
              object,
              animation.currentTime,
              animation.autoKeyMode,
            ),
          };
        });
      }
      return withHistory(state, {
        objects,
        groups: state.groups
          .map((group) => ({
            ...group,
            objectIds: group.objectIds.filter((objectId) => !previewObjectIds.has(objectId)),
          }))
          .filter((group) => group.objectIds.length > 0),
        animation,
        selectedObjectIds: preview.originalObjectIds,
        activeObjectId: preview.originalActiveObjectId ?? preview.originalObjectIds.at(-1),
        activeGroupId: preview.originalActiveGroupId,
        selectedCameraId: undefined,
      });
    }),
  removeSelection: () => {
    const current = get();
    const selectedIds = getSelectedObjectIds(current);
    if (!selectedIds.length) {
      emitAppFeedback("请先选择对象，再执行删除");
      return;
    }
    if (
      selectedIds.length >= 5 &&
      !window.confirm(`即将删除 ${selectedIds.length} 个对象，是否继续？`)
    ) {
      return;
    }
    set((state) => {
      const selectedSet = new Set(selectedIds);
      const removedAssetIds = new Set<string>();
      state.objects.forEach((object) => {
        if (!selectedSet.has(object.id)) {
          return;
        }
        if (object.assetId) {
          removedAssetIds.add(object.assetId);
        }
        object.materialOverrides?.forEach((override) => {
          if (override.textureAssetId) {
            removedAssetIds.add(override.textureAssetId);
          }
        });
        window.dispatchEvent(
          new CustomEvent("scene-object-remove-request", {
            detail: object.id,
          }),
        );
      });
      const objects = state.objects.filter((object) => !selectedSet.has(object.id));
      const groups = state.groups
        .map((group) => ({
          ...group,
          objectIds: group.objectIds.filter((id) => !selectedSet.has(id)),
        }))
        .filter((group) => group.objectIds.length > 0);
      return withHistory(state, {
        assets: removeUnreferencedAssets(state, objects, removedAssetIds),
        objects,
        groups,
        animation: removeAnimationTargets(state.animation, {
          objectIds: selectedSet,
        }),
        selectedObjectIds: [],
        activeObjectId: undefined,
        activeGroupId: undefined,
      });
    });
  },
  setSelectionVisible: (visible) =>
    set((state) => {
      const selectedSet = new Set(getSelectedObjectIds(state));
      if (!selectedSet.size && !state.activeGroupId) {
        return state;
      }
      const activeGroup = state.activeGroupId
        ? state.groups.find((group) => group.id === state.activeGroupId)
        : undefined;
      activeGroup?.objectIds.forEach((id) => selectedSet.add(id));
      return withHistory(state, {
        objects: state.objects.map((object) =>
          selectedSet.has(object.id) ? { ...object, visible } : object,
        ),
        groups: state.groups.map((group) =>
          group.id === state.activeGroupId ? { ...group, visible } : group,
        ),
      });
    }),
  setSelectionLocked: (locked) =>
    set((state) => {
      const selectedSet = new Set(getSelectedObjectIds(state));
      if (!selectedSet.size && !state.activeGroupId) {
        return state;
      }
      const activeGroup = state.activeGroupId
        ? state.groups.find((group) => group.id === state.activeGroupId)
        : undefined;
      activeGroup?.objectIds.forEach((id) => selectedSet.add(id));
      return withHistory(state, {
        objects: state.objects.map((object) =>
          selectedSet.has(object.id) ? { ...object, locked } : object,
        ),
        groups: state.groups.map((group) =>
          group.id === state.activeGroupId ? { ...group, locked } : group,
        ),
      });
    }),
  groupSelection: () => {
    const state = get();
    const selectedIds = getSelectedObjectIds(state);
    if (selectedIds.length < 2) {
      return { ok: false as const, message: "请至少选择两个对象再打组" };
    }
    const groupedId = selectedIds.find((id) => getObjectGroupId(state.groups, id));
    if (groupedId) {
      return { ok: false as const, message: "已在组内的对象请先解组" };
    }
    const groupId = `group_${crypto.randomUUID()}`;
    const group: SceneGroup = {
      id: groupId,
      name: `组 ${state.groups.length + 1}`,
      visible: true,
      locked: false,
      collapsed: false,
      objectIds: selectedIds,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    set((current) =>
      withHistory(current, {
        groups: [...current.groups, group],
        activeGroupId: groupId,
        selectedObjectIds: selectedIds,
        activeObjectId: selectedIds[0],
        selectedCameraId: undefined,
      }),
    );
    return { ok: true as const, groupId };
  },
  ungroupSelection: () =>
    set((state) => {
      const groupIds = new Set<string>();
      if (state.activeGroupId) {
        groupIds.add(state.activeGroupId);
      }
      state.selectedObjectIds.forEach((objectId) => {
        const groupId = getObjectGroupId(state.groups, objectId);
        if (groupId) {
          groupIds.add(groupId);
        }
      });
      if (!groupIds.size) {
        return state;
      }
      return withHistory(state, {
        groups: state.groups.filter((group) => !groupIds.has(group.id)),
        activeGroupId: undefined,
      });
    }),
  updateGroup: (groupId, updates) =>
    set((state) => {
      const nextUpdates =
        typeof updates.name === "string"
          ? { ...updates, name: updates.name.slice(0, 10) }
          : updates;
      return withHistory(state, {
        groups: state.groups.map((group) =>
          group.id === groupId ? { ...group, ...nextUpdates } : group,
        ),
      });
    }),
  toggleGroupCollapsed: (groupId) =>
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === groupId ? { ...group, collapsed: !group.collapsed } : group,
      ),
    })),
  toggleGroupVisible: (groupId) =>
    set((state) => {
      const group = state.groups.find((item) => item.id === groupId);
      if (!group) {
        return state;
      }
      const visible = !group.visible;
      const objectIds = new Set(group.objectIds);
      return withHistory(state, {
        groups: state.groups.map((item) =>
          item.id === groupId ? { ...item, visible } : item,
        ),
        objects: state.objects.map((object) =>
          objectIds.has(object.id) ? { ...object, visible } : object,
        ),
      });
    }),
  toggleGroupLocked: (groupId) =>
    set((state) => {
      const group = state.groups.find((item) => item.id === groupId);
      if (!group) {
        return state;
      }
      const locked = !group.locked;
      const objectIds = new Set(group.objectIds);
      return withHistory(state, {
        groups: state.groups.map((item) =>
          item.id === groupId ? { ...item, locked } : item,
        ),
        objects: state.objects.map((object) =>
          objectIds.has(object.id) ? { ...object, locked } : object,
        ),
      });
    }),
  removeGroup: (groupId) =>
    set((state) => {
      const group = state.groups.find((item) => item.id === groupId);
      if (!group) {
        return state;
      }
      const objectIds = new Set(group.objectIds);
      const removedAssetIds = new Set<string>();
      state.objects.forEach((object) => {
        if (!objectIds.has(object.id)) {
          return;
        }
        if (object.assetId) {
          removedAssetIds.add(object.assetId);
        }
        object.materialOverrides?.forEach((override) => {
          if (override.textureAssetId) {
            removedAssetIds.add(override.textureAssetId);
          }
        });
        window.dispatchEvent(
          new CustomEvent("scene-object-remove-request", {
            detail: object.id,
          }),
        );
      });
      const objects = state.objects.filter((object) => !objectIds.has(object.id));
      return withHistory(state, {
        assets: removeUnreferencedAssets(state, objects, removedAssetIds),
        objects,
        groups: state.groups.filter((item) => item.id !== groupId),
        animation: removeAnimationTargets(state.animation, {
          objectIds,
        }),
        selectedObjectIds: [],
        activeObjectId: undefined,
        activeGroupId: undefined,
      });
    }),
  moveObjectToGroup: (objectId, targetGroupId) =>
    set((state) => {
      if (!state.objects.some((object) => object.id === objectId)) {
        return state;
      }
      const sourceGroupId = getObjectGroupId(state.groups, objectId);
      if (sourceGroupId === targetGroupId) {
        return state;
      }
      if (targetGroupId && !state.groups.some((group) => group.id === targetGroupId)) {
        emitAppFeedback("目标分组不存在");
        return state;
      }
      const groups = state.groups
        .map((group) => {
          if (group.id === sourceGroupId) {
            return {
              ...group,
              objectIds: group.objectIds.filter((id) => id !== objectId),
            };
          }
          if (group.id === targetGroupId) {
            return {
              ...group,
              objectIds: [...group.objectIds, objectId],
            };
          }
          return group;
        })
        .filter((group) => group.objectIds.length > 0);
      return withHistory(state, {
        groups,
        activeGroupId: getExactSelectedGroupId(groups, state.selectedObjectIds),
      });
    }),
  moveSelectionToGroup: (targetGroupId) =>
    set((state) => {
      const selectedObjectIds = getSelectedObjectIds(state);
      if (!selectedObjectIds.length) {
        emitAppFeedback("请先选择对象");
        return state;
      }
      if (!state.groups.some((group) => group.id === targetGroupId)) {
        emitAppFeedback("目标分组不存在");
        return state;
      }
      if (selectedObjectIds.some((objectId) => getObjectGroupId(state.groups, objectId))) {
        emitAppFeedback("请先移出已有分组的对象");
        return state;
      }
      return withHistory(state, {
        groups: state.groups.map((group) =>
          group.id === targetGroupId
            ? { ...group, objectIds: [...group.objectIds, ...selectedObjectIds] }
            : group,
        ),
        activeGroupId: undefined,
      });
    }),
  snapSelectionToGround: () =>
    set((state) => {
      const selectedSet = new Set(getSelectedObjectIds(state));
      if (!selectedSet.size) {
        emitAppFeedback("请先选择对象，再执行落地");
        return state;
      }
      const movableObjects = state.objects.filter(
        (object) => selectedSet.has(object.id) && !object.locked,
      );
      if (!movableObjects.length) {
        emitAppFeedback("所选对象已锁定，无法执行落地");
        return state;
      }
      const groundY = state.worldSettings.ground.y;
      return withHistory(state, {
        objects: state.objects.map((object) => {
          if (!selectedSet.has(object.id) || object.locked) {
            return object;
          }
          const minY = getRuntimeObjectMinY(object.id);
          if (typeof minY === "number") {
            return {
              ...object,
              position: [
                object.position[0],
                object.position[1] + (groundY - minY),
                object.position[2],
              ],
            };
          }
          const height = object.actualDimensions?.[1] ?? 0;
          return {
            ...object,
            position: [object.position[0], groundY + height / 2, object.position[2]],
          };
        }),
      });
    }),
  alignSelection: (mode) =>
    set((state) => {
      const selectedSet = new Set(getSelectedObjectIds(state));
      const selectedObjects = state.objects.filter(
        (object) => selectedSet.has(object.id) && !object.locked,
      );
      if (selectedObjects.length < 2) {
        emitAppFeedback("至少选择两个未锁定对象后才能对齐");
        return state;
      }
      const boundsById = new Map(
        selectedObjects.map((object) => [object.id, getRuntimeObjectBounds(object.id)]),
      );
      const getCenter = (object: SceneObject): Vec3 => {
        const bounds = boundsById.get(object.id);
        return bounds
          ? [
              (bounds.min.x + bounds.max.x) / 2,
              (bounds.min.y + bounds.max.y) / 2,
              (bounds.min.z + bounds.max.z) / 2,
            ]
          : object.position;
      };
      const getTargetValue = (object: SceneObject) => {
        const bounds = boundsById.get(object.id);
        switch (mode) {
          case "left":
            return bounds?.min.x ?? object.position[0];
          case "right":
            return bounds?.max.x ?? object.position[0];
          case "bottom":
            return bounds?.min.y ?? object.position[1];
          case "top":
            return bounds?.max.y ?? object.position[1];
          case "front":
            return bounds?.min.z ?? object.position[2];
          case "back":
            return bounds?.max.z ?? object.position[2];
          case "y":
            return bounds ? (bounds.min.y + bounds.max.y) / 2 : object.position[1];
          case "z":
            return bounds ? (bounds.min.z + bounds.max.z) / 2 : object.position[2];
          case "x":
          default:
            return bounds ? (bounds.min.x + bounds.max.x) / 2 : object.position[0];
        }
      };
      if (mode === "center") {
        const targetCenter = getCenter(selectedObjects[0]);
        return withHistory(state, {
          objects: state.objects.map((object) =>
            selectedSet.has(object.id) && !object.locked
              ? {
                  ...object,
                  position: object.position.map((value, index) =>
                    value + (targetCenter[index] - getCenter(object)[index]),
                  ) as Vec3,
                }
              : object,
          ),
        });
      }
      const getAxisIndex = () => {
        if (mode === "left" || mode === "right" || mode === "x") {
          return 0;
        }
        if (mode === "bottom" || mode === "top" || mode === "y") {
          return 1;
        }
        return 2;
      };
      const axisIndex = getAxisIndex();
      const target = getTargetValue(selectedObjects[0]);
      return withHistory(state, {
        objects: state.objects.map((object) =>
          selectedSet.has(object.id) && !object.locked
            ? {
                ...object,
                position: object.position.map((value, index) =>
                  index === axisIndex
                    ? value + (target - getTargetValue(object))
                    : value,
                ) as Vec3,
              }
            : object,
        ),
      });
    }),
  distributeSelection: (axis) =>
    set((state) => {
      const selectedSet = new Set(getSelectedObjectIds(state));
      const axisIndex = axis === "x" ? 0 : 2;
      const selectedObjects = state.objects
        .filter((object) => selectedSet.has(object.id) && !object.locked)
        .sort((left, right) => left.position[axisIndex] - right.position[axisIndex]);
      if (selectedObjects.length < 3) {
        emitAppFeedback("至少选择三个未锁定对象后才能等距分布");
        return state;
      }
      const first = selectedObjects[0].position[axisIndex];
      const last = selectedObjects[selectedObjects.length - 1].position[axisIndex];
      const step = (last - first) / (selectedObjects.length - 1);
      const positions = new Map(
        selectedObjects.map((object, index) => [object.id, first + step * index]),
      );
      return withHistory(state, {
        objects: state.objects.map((object) => {
          const nextValue = positions.get(object.id);
          return nextValue === undefined
            ? object
            : {
                ...object,
                position: object.position.map((value, index) =>
                  index === axisIndex ? nextValue : value,
                ) as Vec3,
              };
        }),
      });
    }),
  undo: () => {
    let state = get();
    if (state.historyDraft) {
      state.commitHistoryDraft();
      state = get();
    }
    const previous = state.history.past.at(-1);
    if (!previous) {
      return;
    }
    const history = {
      past: state.history.past.slice(0, -1),
      future: [cloneProjectState(state), ...state.history.future].slice(0, state.history.limit),
      limit: state.history.limit,
    };
    set(restoreSnapshot(previous, history));
    window.dispatchEvent(new CustomEvent("project-runtime-sync-request"));
  },
  redo: () => {
    let state = get();
    if (state.historyDraft) {
      state.commitHistoryDraft();
      state = get();
    }
    const next = state.history.future[0];
    if (!next) {
      return;
    }
    const history = {
      past: [...state.history.past, cloneProjectState(state)].slice(-state.history.limit),
      future: state.history.future.slice(1),
      limit: state.history.limit,
    };
    set(restoreSnapshot(next, history));
    window.dispatchEvent(new CustomEvent("project-runtime-sync-request"));
  },
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

      return withHistory(state, {
        objects,
        assets: removeUnreferencedAssets(state, objects, textureAssetsToRemove),
      });
    }),
  addAsset: (asset) =>
    set((state) => ({
      assets: [...state.assets, asset],
    })),
  addSceneObject: (object) =>
    set((state) => withHistory(state, {
      objects: [...state.objects, object],
      activeObjectId: object.id,
      activeGroupId: undefined,
      selectedObjectIds: [object.id],
      selectedCameraId: undefined,
    })),
  addImportedModel: (asset, object) =>
    set((state) => withHistory(state, {
      assets: [...state.assets, asset],
      objects: [...state.objects, object],
      activeObjectId: object.id,
      activeGroupId: undefined,
      selectedObjectIds: [object.id],
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
        currentTime: playing
          ? getPlaybackStartTime(state.animation)
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
          currentTime: nextPlaying
            ? getPlaybackStartTime(state.animation)
            : state.animation.currentTime,
          isPlaying: nextPlaying,
        },
      };
    }),
  toggleAnimationLoop: () =>
    set((state) => ({
      animation: {
        ...state.animation,
        loop: !state.animation.loop,
      },
    })),
  toggleAnimationCameraCutsEnabled: () =>
    set((state) => ({
      animation: {
        ...state.animation,
        cameraCutsEnabled: state.animation.cameraCutsEnabled === false,
      },
    })),
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
    set((state) =>
      withHistory(state, {
        animation: setAnimationInPoint(state.animation, time),
      }),
    ),
  setAnimationOutPoint: (time) =>
    set((state) =>
      withHistory(state, {
        animation: setAnimationOutPoint(state.animation, time),
      }),
    ),
  clearAnimationInPoint: () =>
    set((state) =>
      withHistory(state, {
        animation: clearAnimationInPoint(state.animation),
      }),
    ),
  clearAnimationOutPoint: () =>
    set((state) =>
      withHistory(state, {
        animation: clearAnimationOutPoint(state.animation),
      }),
    ),
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
      return withHistory(state, {
        animation:
          currentInPointTime !== undefined && Math.abs(currentInPointTime - currentTime) < 0.0001
            ? clearAnimationInPoint(state.animation)
            : setAnimationInPoint(state.animation, currentTime),
      });
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
      return withHistory(state, {
        animation:
          currentOutPointTime !== undefined &&
          Math.abs(currentOutPointTime - currentTime) < 0.0001
            ? clearAnimationOutPoint(state.animation)
            : setAnimationOutPoint(state.animation, currentTime),
      });
    }),
  stepAnimation: (deltaSeconds) =>
    set((state) => {
      if (!state.animation.isPlaying) {
        return state;
      }
      const { startTime, endTime } = getAnimationPlaybackRange(state.animation);
      const rangeDuration = endTime - startTime;
      if (rangeDuration <= PLAYBACK_RANGE_EPSILON) {
        return {
          animation: {
            ...state.animation,
            currentTime: endTime,
            isPlaying: false,
          },
        };
      }
      const currentTime = clampAnimationTime(
        state.animation.currentTime,
        state.animation.duration,
        state.animation.fps,
      );
      const rangeCurrentTime =
        currentTime < startTime - PLAYBACK_RANGE_EPSILON ||
        currentTime > endTime + PLAYBACK_RANGE_EPSILON
          ? startTime
          : currentTime;
      const rawNextTime = rangeCurrentTime + Math.max(0, deltaSeconds);
      const shouldLoop = state.animation.loop;
      const nextTime =
        rawNextTime > endTime
          ? shouldLoop
            ? startTime + ((rawNextTime - startTime) % rangeDuration)
            : endTime
          : rawNextTime;
      if (!shouldLoop && rawNextTime >= endTime) {
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
    if (useProjectStore.getState().historyDraft) {
      useProjectStore.getState().commitHistoryDraft();
    }
    const state = useProjectStore.getState();
    const result = captureManualSelectionKeyframes(state);
    if (!result.ok) {
      return result;
    }
    set((current) =>
      withHistory(current, {
        animation: {
          ...current.animation,
          bindings: result.bindings,
        },
      }),
    );
    return { ok: true as const };
  },
  addCurrentCameraCut: () => {
    if (useProjectStore.getState().historyDraft) {
      useProjectStore.getState().commitHistoryDraft();
    }
    const state = useProjectStore.getState();
    const result = captureCameraCut(state);
    if (!result.ok) {
      return result;
    }
    set((current) =>
      withHistory(current, {
        animation: {
          ...current.animation,
          cameraCuts: result.cameraCuts,
        },
      }),
    );
    return { ok: true as const };
  },
  addCameraCutAtTime: (cameraId) => {
    if (useProjectStore.getState().historyDraft) {
      useProjectStore.getState().commitHistoryDraft();
    }
    const state = useProjectStore.getState();
    const result = captureCameraCutForCamera(state, cameraId);
    if (!result.ok) {
      return result;
    }
    set((current) =>
      withHistory(current, {
        animation: {
          ...current.animation,
          cameraCuts: result.cameraCuts,
        },
      }),
    );
    return { ok: true as const };
  },
  removeSelectedTimelineKeyframe: (refs) =>
    set((state) =>
      withHistory(state, {
        animation: {
          ...state.animation,
          bindings: removeTimelineKeyframes(state.animation.bindings, refs),
          cameraCuts: removeCameraCuts(state.animation.cameraCuts, refs),
        },
      }),
    ),
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
      return withHistory(
        state,
        applyAnimationState(
          {
            ...state,
            animation: {
              ...state.animation,
              bindings: nextBindings,
              cameraCuts: nextCameraCuts,
            },
          },
          state.animation.currentTime,
        ),
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
      return withHistory(state, {
        animation: {
          ...state.animation,
          cameraCuts: nextCameraCuts,
        },
      });
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
