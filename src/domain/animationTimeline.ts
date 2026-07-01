import type {
  AnimationAutoKeyMode,
  AnimationBinding,
  AnimationCameraCut,
  AnimationBindingTargetType,
  AnimationChannel,
  AnimationChannelPath,
  AnimationChannelValue,
  AnimationKeyframe,
  TimelineKeyframeRef,
  ProjectState,
  SceneCamera,
  SceneObject,
  Vec3,
} from "./projectTypes";

const MIN_DURATION = 1;
const MIN_FPS = 1;
const MAX_FPS = 60;
const MIN_CAMERA_CLIP_FRAMES = 1;

function isVec3Value(value: AnimationChannelValue): value is Vec3 {
  return Array.isArray(value);
}

function cloneValue(value: AnimationChannelValue) {
  return isVec3Value(value) ? [...value] as Vec3 : value;
}

function sortKeyframes(keyframes: AnimationKeyframe[]) {
  return [...keyframes].sort((left, right) => left.time - right.time);
}

function getCameraCutStart(cut: AnimationCameraCut) {
  return cut.startTime ?? cut.time ?? 0;
}

function getCameraCutEnd(cut: AnimationCameraCut, duration?: number) {
  const fallbackEnd = duration ?? Math.max(getCameraCutStart(cut), cut.time ?? 0);
  return cut.endTime ?? fallbackEnd;
}

function sortCameraCuts(cameraCuts: AnimationCameraCut[]) {
  return [...cameraCuts].sort(
    (left, right) => getCameraCutStart(left) - getCameraCutStart(right),
  );
}

export function clampAnimationDuration(value: number) {
  return Math.max(MIN_DURATION, Number.isFinite(value) ? value : MIN_DURATION);
}

export function clampAnimationFps(value: number) {
  return Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(value || MIN_FPS)));
}

export function quantizeAnimationTime(time: number, fps: number) {
  const safeFps = clampAnimationFps(fps);
  return Math.max(0, Math.round(time * safeFps) / safeFps);
}

export function clampAnimationTime(time: number, duration: number, fps: number) {
  const quantized = quantizeAnimationTime(time, fps);
  return Math.min(clampAnimationDuration(duration), Math.max(0, quantized));
}

export function resolvePlaybackCameraId(
  cameraCuts: AnimationCameraCut[],
  time: number,
  fallbackCameraId?: string,
) {
  const ordered = sortCameraCuts(cameraCuts);
  const matched =
    ordered.find(
      (cut) =>
        getCameraCutStart(cut) <= time + 0.0001 &&
        time < getCameraCutEnd(cut) - 0.0001,
    ) ??
    ordered
      .filter((cut) => getCameraCutStart(cut) <= time + 0.0001)
      .at(-1);
  return matched?.cameraId ?? fallbackCameraId;
}

function sampleNumberChannel(
  keyframes: AnimationKeyframe[],
  time: number,
): number | undefined {
  const ordered = sortKeyframes(keyframes);
  if (!ordered.length) {
    return undefined;
  }
  if (time <= ordered[0].time) {
    return ordered[0].value as number;
  }
  const last = ordered[ordered.length - 1];
  if (time >= last.time) {
    return last.value as number;
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (time < current.time || time > next.time) {
      continue;
    }
    if (current.interpolation === "step" || next.time === current.time) {
      return current.value as number;
    }
    const start = current.value as number;
    const end = next.value as number;
    const alpha = (time - current.time) / (next.time - current.time);
    return start + (end - start) * alpha;
  }

  return last.value as number;
}

function sampleVec3Channel(
  keyframes: AnimationKeyframe[],
  time: number,
): Vec3 | undefined {
  const ordered = sortKeyframes(keyframes);
  if (!ordered.length) {
    return undefined;
  }
  if (time <= ordered[0].time) {
    return cloneValue(ordered[0].value) as Vec3;
  }
  const last = ordered[ordered.length - 1];
  if (time >= last.time) {
    return cloneValue(last.value) as Vec3;
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (time < current.time || time > next.time) {
      continue;
    }
    if (current.interpolation === "step" || next.time === current.time) {
      return cloneValue(current.value) as Vec3;
    }
    const start = current.value as Vec3;
    const end = next.value as Vec3;
    const alpha = (time - current.time) / (next.time - current.time);
    return [
      start[0] + (end[0] - start[0]) * alpha,
      start[1] + (end[1] - start[1]) * alpha,
      start[2] + (end[2] - start[2]) * alpha,
    ];
  }

  return cloneValue(last.value) as Vec3;
}

function sampleChannelValue(channel: AnimationChannel, time: number) {
  return channel.valueType === "number"
    ? sampleNumberChannel(channel.keyframes, time)
    : sampleVec3Channel(channel.keyframes, time);
}

function cloneRigObject(object: SceneObject) {
  if (!object.rig) {
    return object;
  }
  return {
    ...object,
    rig: {
      ...object.rig,
      bones: object.rig.bones.map((bone) => ({ ...bone })),
      ikChains: object.rig.ikChains.map((chain) => ({ ...chain })),
    },
  };
}

function ensureObjectClone(
  nextObjects: SceneObject[],
  cloneFlags: boolean[],
  index: number,
) {
  if (!cloneFlags[index]) {
    nextObjects[index] = cloneRigObject(nextObjects[index]);
    cloneFlags[index] = true;
  }
  return nextObjects[index];
}

function ensureCameraClone(
  nextCameras: SceneCamera[],
  cloneFlags: boolean[],
  index: number,
) {
  if (!cloneFlags[index]) {
    nextCameras[index] = { ...nextCameras[index] };
    cloneFlags[index] = true;
  }
  return nextCameras[index];
}

export function applyAnimationToProjectState(
  state: Pick<ProjectState, "objects" | "cameras" | "animation">,
  time: number,
) {
  const nextObjects = [...state.objects];
  const nextCameras = [...state.cameras];
  const objectCloneFlags = nextObjects.map(() => false);
  const cameraCloneFlags = nextCameras.map(() => false);
  const objectIndexById = new Map(nextObjects.map((object, index) => [object.id, index]));
  const cameraIndexById = new Map(nextCameras.map((camera, index) => [camera.id, index]));

  state.animation.bindings.forEach((binding) => {
    if (binding.targetType === "object") {
      const objectIndex = objectIndexById.get(binding.targetId);
      if (objectIndex === undefined) {
        return;
      }
      const object = ensureObjectClone(nextObjects, objectCloneFlags, objectIndex);
      binding.channels.forEach((channel) => {
        const sampledValue = sampleChannelValue(channel, time);
        if (sampledValue === undefined) {
          return;
        }
        if (channel.path === "position" && isVec3Value(sampledValue)) {
          object.position = sampledValue;
        }
        if (channel.path === "rotation" && isVec3Value(sampledValue)) {
          object.rotation = sampledValue;
        }
        if (channel.path === "scale" && isVec3Value(sampledValue)) {
          object.scale = sampledValue;
        }
        if (channel.path === "boneRotation" && isVec3Value(sampledValue) && object.rig) {
          object.rig.bones = object.rig.bones.map((bone) =>
            bone.id === channel.boneId ? { ...bone, rotation: sampledValue } : bone,
          );
        }
        if (
          channel.path === "ikTargetPosition" &&
          isVec3Value(sampledValue) &&
          object.rig
        ) {
          object.rig.ikChains = object.rig.ikChains.map((chain) =>
            chain.id === channel.ikChainId
              ? { ...chain, targetPosition: sampledValue }
              : chain,
          );
        }
      });
      return;
    }

    const cameraIndex = cameraIndexById.get(binding.targetId);
    if (cameraIndex === undefined) {
      return;
    }
    const camera = ensureCameraClone(nextCameras, cameraCloneFlags, cameraIndex);
    binding.channels.forEach((channel) => {
      const sampledValue = sampleChannelValue(channel, time);
      if (sampledValue === undefined) {
        return;
      }
      if (channel.path === "position" && isVec3Value(sampledValue)) {
        camera.position = sampledValue;
      }
      if (channel.path === "rotation" && isVec3Value(sampledValue)) {
        camera.rotation = sampledValue;
      }
      if (channel.path === "target" && isVec3Value(sampledValue)) {
        camera.target = sampledValue;
      }
      if (channel.path === "fov" && typeof sampledValue === "number") {
        camera.fov = sampledValue;
      }
    });
  });

  return {
    objects: nextObjects,
    cameras: nextCameras,
  };
}

export function upsertAnimationCameraCut(
  cameraCuts: AnimationCameraCut[],
  cameraId: string,
  time: number,
  duration: number,
  fps: number,
) {
  const nextStartTime = clampAnimationTime(time, duration, fps);
  const nextDuration = clampAnimationDuration(duration);
  const minLength = MIN_CAMERA_CLIP_FRAMES / clampAnimationFps(fps);
  const existingIndex = cameraCuts.findIndex(
    (cut) => Math.abs(getCameraCutStart(cut) - nextStartTime) < 0.0001,
  );
  const defaultStartTime = cameraCuts.length ? nextStartTime : 0;
  const defaultEndTime = nextDuration;
  const nextCut: AnimationCameraCut = {
    id: existingIndex >= 0 ? cameraCuts[existingIndex].id : `camera_cut_${crypto.randomUUID()}`,
    cameraId,
    startTime: Math.min(defaultStartTime, nextDuration - minLength),
    endTime: defaultEndTime,
  };
  if (existingIndex < 0) {
    return normalizeCameraCuts([...cameraCuts, nextCut], nextDuration, fps);
  }
  return normalizeCameraCuts(
    cameraCuts.map((cut, index) => (index === existingIndex ? nextCut : cut)),
    nextDuration,
    fps,
  );
}

export function normalizeCameraCuts(
  cameraCuts: AnimationCameraCut[],
  duration: number,
  fps: number,
) {
  const nextDuration = clampAnimationDuration(duration);
  const minLength = MIN_CAMERA_CLIP_FRAMES / clampAnimationFps(fps);
  const ordered = sortCameraCuts(cameraCuts)
    .map((cut) => {
      const startTime = clampAnimationTime(getCameraCutStart(cut), nextDuration, fps);
      const rawEndTime = cut.endTime === undefined ? nextDuration : cut.endTime;
      const endTime = Math.min(
        nextDuration,
        Math.max(startTime + minLength, clampAnimationTime(rawEndTime, nextDuration, fps)),
      );
      return {
        id: cut.id,
        cameraId: cut.cameraId,
        startTime,
        endTime,
      };
    })
    .filter((cut) => cut.endTime - cut.startTime >= minLength - 0.0001);

  return ordered.map((cut, index) => {
    const nextCut = ordered[index + 1];
    if (!nextCut) {
      return cut;
    }
    return {
      ...cut,
      endTime: Math.min(cut.endTime, Math.max(cut.startTime + minLength, nextCut.startTime)),
    };
  });
}

function normalizeKeyframes(keyframes: AnimationKeyframe[]) {
  const byTime = new Map<string, AnimationKeyframe>();
  sortKeyframes(keyframes).forEach((keyframe) => {
    byTime.set(keyframe.time.toFixed(4), keyframe);
  });
  return sortKeyframes(Array.from(byTime.values()));
}

export function removeTimelineKeyframes(
  bindings: AnimationBinding[],
  refs: TimelineKeyframeRef[],
) {
  const channelRefs = refs.filter(
    (ref): ref is Extract<TimelineKeyframeRef, { kind: "channel" }> => ref.kind === "channel",
  );
  if (!channelRefs.length) {
    return bindings;
  }
  const refMap = new Map<string, Set<string>>();
  channelRefs.forEach((ref) => {
    const channelKey = `${ref.bindingId}:${ref.channelId}`;
    const ids = refMap.get(channelKey) ?? new Set<string>();
    ids.add(ref.keyframeId);
    refMap.set(channelKey, ids);
  });

  return bindings
    .map((binding) => {
      const channels = binding.channels
        .map((channel) => {
          const ids = refMap.get(`${binding.id}:${channel.id}`);
          if (!ids) {
            return channel;
          }
          return {
            ...channel,
            keyframes: channel.keyframes.filter((keyframe) => !ids.has(keyframe.id)),
          };
        })
        .filter((channel) => channel.keyframes.length > 0);
      return {
        ...binding,
        channels,
      };
    })
    .filter((binding) => binding.channels.length > 0);
}

export function moveTimelineKeyframes(
  bindings: AnimationBinding[],
  refs: TimelineKeyframeRef[],
  nextTime: number,
) {
  const channelRefs = refs.filter(
    (ref): ref is Extract<TimelineKeyframeRef, { kind: "channel" }> => ref.kind === "channel",
  );
  if (!channelRefs.length) {
    return bindings;
  }
  const refMap = new Map<string, Set<string>>();
  channelRefs.forEach((ref) => {
    const channelKey = `${ref.bindingId}:${ref.channelId}`;
    const ids = refMap.get(channelKey) ?? new Set<string>();
    ids.add(ref.keyframeId);
    refMap.set(channelKey, ids);
  });

  return bindings.map((binding) => ({
    ...binding,
    channels: binding.channels.map((channel) => {
      const ids = refMap.get(`${binding.id}:${channel.id}`);
      if (!ids) {
        return channel;
      }
      return {
        ...channel,
        keyframes: normalizeKeyframes(
          channel.keyframes.map((keyframe) =>
            ids.has(keyframe.id)
              ? {
                  ...keyframe,
                  time: nextTime,
                }
              : keyframe,
          ),
        ),
      };
    }),
  }));
}

export function removeCameraCuts(
  cameraCuts: AnimationCameraCut[],
  refs: TimelineKeyframeRef[],
) {
  const cutIds = new Set(
    refs
      .filter((ref): ref is Extract<TimelineKeyframeRef, { kind: "cameraCut" }> => ref.kind === "cameraCut")
      .map((ref) => ref.cutId),
  );
  if (!cutIds.size) {
    return cameraCuts;
  }
  return cameraCuts.filter((cut) => !cutIds.has(cut.id));
}

export function moveCameraCuts(
  cameraCuts: AnimationCameraCut[],
  refs: TimelineKeyframeRef[],
  nextTime: number,
  duration: number,
  fps: number,
) {
  const cutIds = new Set(
    refs
      .filter((ref): ref is Extract<TimelineKeyframeRef, { kind: "cameraCut" }> => ref.kind === "cameraCut")
      .map((ref) => ref.cutId),
  );
  if (!cutIds.size) {
    return cameraCuts;
  }
  const nextDuration = clampAnimationDuration(duration);
  const minLength = MIN_CAMERA_CLIP_FRAMES / clampAnimationFps(fps);
  const normalized = normalizeCameraCuts(cameraCuts, nextDuration, fps);
  const nextCuts = normalized.map((cut) => {
    if (!cutIds.has(cut.id)) {
      return cut;
    }
    const length = Math.max(minLength, cut.endTime - cut.startTime);
    const startTime = Math.min(
      nextDuration - length,
      Math.max(0, clampAnimationTime(nextTime, nextDuration, fps)),
    );
    return {
      ...cut,
      startTime,
      endTime: startTime + length,
    };
  });
  return normalizeCameraCuts(nextCuts, nextDuration, fps);
}

export function resizeCameraCut(
  cameraCuts: AnimationCameraCut[],
  cutId: string,
  edge: "start" | "end",
  time: number,
  duration: number,
  fps: number,
) {
  const nextDuration = clampAnimationDuration(duration);
  const minLength = MIN_CAMERA_CLIP_FRAMES / clampAnimationFps(fps);
  const nextTime = clampAnimationTime(time, nextDuration, fps);
  const normalized = normalizeCameraCuts(cameraCuts, nextDuration, fps);
  return normalizeCameraCuts(
    normalized.map((cut) => {
      if (cut.id !== cutId) {
        return cut;
      }
      if (edge === "start") {
        return {
          ...cut,
          startTime: Math.min(nextTime, cut.endTime - minLength),
        };
      }
      return {
        ...cut,
        endTime: Math.max(nextTime, cut.startTime + minLength),
      };
    }),
    nextDuration,
    fps,
  );
}

export function getAnimationBindingId(targetType: AnimationBindingTargetType, targetId: string) {
  return `${targetType}:${targetId}`;
}

export function getAnimationChannelId(
  path: AnimationChannelPath,
  extra?: { boneId?: string; ikChainId?: string },
) {
  if (extra?.boneId) {
    return `${path}:${extra.boneId}`;
  }
  if (extra?.ikChainId) {
    return `${path}:${extra.ikChainId}`;
  }
  return path;
}

export function upsertAnimationBinding(
  bindings: AnimationBinding[],
  targetType: AnimationBindingTargetType,
  targetId: string,
  label: string,
) {
  const bindingId = getAnimationBindingId(targetType, targetId);
  const current = bindings.find((binding) => binding.id === bindingId);
  if (current) {
    return {
      binding: current,
      bindings: bindings.map((item) =>
        item.id === bindingId ? { ...item, label } : item,
      ),
    };
  }
  const binding: AnimationBinding = {
    id: bindingId,
    targetType,
    targetId,
    label,
    channels: [],
  };
  return {
    binding,
    bindings: [...bindings, binding],
  };
}

export function upsertAnimationChannel(
  channels: AnimationChannel[],
  nextChannel: Omit<AnimationChannel, "keyframes">,
  nextKeyframe: AnimationKeyframe,
  mode: AnimationAutoKeyMode = "add_replace",
) {
  const existing = channels.find((channel) => channel.id === nextChannel.id);
  if (!existing && mode === "replace") {
    return channels;
  }
  if (!existing) {
    return [
      ...channels,
      {
        ...nextChannel,
        keyframes: [nextKeyframe],
      },
    ];
  }

  const nextKeyframes = [...existing.keyframes];
  const existingIndex = nextKeyframes.findIndex(
    (item) => Math.abs(item.time - nextKeyframe.time) < 0.0001,
  );
  if (existingIndex < 0 && mode === "replace") {
    return channels;
  }
  if (existingIndex >= 0) {
    nextKeyframes[existingIndex] = nextKeyframe;
  } else {
    nextKeyframes.push(nextKeyframe);
  }

  return channels.map((channel) =>
    channel.id === nextChannel.id
      ? {
          ...channel,
          ...nextChannel,
          keyframes: sortKeyframes(nextKeyframes),
        }
      : channel,
  );
}

export function recordObjectTransformChannels(
  bindings: AnimationBinding[],
  object: Pick<SceneObject, "id" | "name" | "position" | "rotation" | "scale">,
  time: number,
  mode: AnimationAutoKeyMode = "add_replace",
) {
  if (mode === "replace" && !bindings.some((binding) => binding.id === getAnimationBindingId("object", object.id))) {
    return bindings;
  }
  const bindingResult = upsertAnimationBinding(bindings, "object", object.id, object.name);
  let channels = bindingResult.binding.channels;
  channels = upsertAnimationChannel(
    channels,
    {
      id: getAnimationChannelId("position"),
      label: "位置",
      path: "position",
      valueType: "vec3",
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...object.position] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  channels = upsertAnimationChannel(
    channels,
    {
      id: getAnimationChannelId("rotation"),
      label: "旋转",
      path: "rotation",
      valueType: "vec3",
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...object.rotation] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  channels = upsertAnimationChannel(
    channels,
    {
      id: getAnimationChannelId("scale"),
      label: "缩放",
      path: "scale",
      valueType: "vec3",
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...object.scale] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  return bindingResult.bindings.map((binding) =>
    binding.id === bindingResult.binding.id ? { ...binding, channels } : binding,
  );
}

export function recordCameraChannels(
  bindings: AnimationBinding[],
  camera: Pick<SceneCamera, "id" | "name" | "position" | "rotation" | "target" | "fov">,
  time: number,
  mode: AnimationAutoKeyMode = "add_replace",
) {
  if (mode === "replace" && !bindings.some((binding) => binding.id === getAnimationBindingId("camera", camera.id))) {
    return bindings;
  }
  const bindingResult = upsertAnimationBinding(bindings, "camera", camera.id, camera.name);
  let channels = bindingResult.binding.channels;
  channels = upsertAnimationChannel(
    channels,
    {
      id: getAnimationChannelId("position"),
      label: "位置",
      path: "position",
      valueType: "vec3",
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...camera.position] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  channels = upsertAnimationChannel(
    channels,
    {
      id: getAnimationChannelId("rotation"),
      label: "旋转",
      path: "rotation",
      valueType: "vec3",
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...camera.rotation] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  channels = upsertAnimationChannel(
    channels,
    {
      id: getAnimationChannelId("target"),
      label: "注视目标",
      path: "target",
      valueType: "vec3",
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...camera.target] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  channels = upsertAnimationChannel(
    channels,
    {
      id: getAnimationChannelId("fov"),
      label: "FOV",
      path: "fov",
      valueType: "number",
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: camera.fov,
      interpolation: "linear",
    },
    mode,
  );
  return bindingResult.bindings.map((binding) =>
    binding.id === bindingResult.binding.id ? { ...binding, channels } : binding,
  );
}

export function recordBoneRotationChannel(
  bindings: AnimationBinding[],
  object: Pick<SceneObject, "id" | "name">,
  bone: { id: string; name: string; rotation: Vec3 },
  time: number,
  mode: AnimationAutoKeyMode = "add_replace",
) {
  if (mode === "replace" && !bindings.some((binding) => binding.id === getAnimationBindingId("object", object.id))) {
    return bindings;
  }
  const bindingResult = upsertAnimationBinding(bindings, "object", object.id, object.name);
  const channelId = getAnimationChannelId("boneRotation", {
    boneId: bone.id,
  });
  const channels = upsertAnimationChannel(
    bindingResult.binding.channels,
    {
      id: channelId,
      label: `${bone.name} / 骨骼旋转`,
      path: "boneRotation",
      valueType: "vec3",
      boneId: bone.id,
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...bone.rotation] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  return bindingResult.bindings.map((binding) =>
    binding.id === bindingResult.binding.id ? { ...binding, channels } : binding,
  );
}

export function recordIkTargetChannel(
  bindings: AnimationBinding[],
  object: Pick<SceneObject, "id" | "name">,
  chain: { id: string; name: string; targetPosition: Vec3 },
  time: number,
  mode: AnimationAutoKeyMode = "add_replace",
) {
  if (mode === "replace" && !bindings.some((binding) => binding.id === getAnimationBindingId("object", object.id))) {
    return bindings;
  }
  const bindingResult = upsertAnimationBinding(bindings, "object", object.id, object.name);
  const channelId = getAnimationChannelId("ikTargetPosition", {
    ikChainId: chain.id,
  });
  const channels = upsertAnimationChannel(
    bindingResult.binding.channels,
    {
      id: channelId,
      label: `${chain.name} / IK 目标`,
      path: "ikTargetPosition",
      valueType: "vec3",
      ikChainId: chain.id,
    },
    {
      id: `keyframe_${crypto.randomUUID()}`,
      time,
      value: [...chain.targetPosition] as Vec3,
      interpolation: "linear",
    },
    mode,
  );
  return bindingResult.bindings.map((binding) =>
    binding.id === bindingResult.binding.id ? { ...binding, channels } : binding,
  );
}
