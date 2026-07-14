import {
  Camera,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CornerDownLeft,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipBack,
  SkipForward,
  Trash2,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineKeyframeRef } from "../../domain/projectTypes";
import { formatBoneDisplayName } from "../../domain/rigUtils";
import {
  createAnimationExportName,
  type AnimationExportRange,
  type AnimationExportRequestDetail,
} from "../../export/animationExport";
import { useProjectStore } from "../../store/projectStore";

type TimelineTreeNode = {
  id: string;
  label: string;
  subtitle?: string;
  kind: "summary" | "group" | "binding" | "channel" | "cameraCut";
  keyframes: TimelineDisplayKeyframe[];
  children?: TimelineTreeNode[];
  laneClassName?: string;
};

type TimelineDisplayKeyframe = {
  id: string;
  time: number;
  refs: TimelineKeyframeRef[];
  label?: string;
};

type VisibleTimelineNode = {
  depth: number;
  node: TimelineTreeNode;
};

type TimelineCameraMarker = {
  id: string;
  cameraId: string;
  label: string;
  time: number;
  refs: TimelineKeyframeRef[];
};

type TimelineCameraMarkerPlacement = TimelineCameraMarker & {
  lane: number;
  groupSize: number;
};

const OPEN_TIMELINE_MIN_SECONDS = 15;
const OPEN_TIMELINE_LOOKAHEAD_SECONDS = 15;
const CAMERA_MARKER_LABEL_COLLISION_PX = 88;
const TIMELINE_BASE_PIXELS_PER_FRAME = 12;
const TIMELINE_MIN_ZOOM = 0.25;
const TIMELINE_MAX_ZOOM = 3;
const TIMELINE_ZOOM_STEP = 0.15;

function buildDisplayKeyframes(
  items: Array<{ id: string; time: number; refs: TimelineKeyframeRef[]; label?: string }>,
) {
  const byTime = new Map<string, TimelineDisplayKeyframe>();
  items.forEach((item) => {
    const key = item.time.toFixed(4);
    const current = byTime.get(key);
    if (current) {
      current.refs = [...current.refs, ...item.refs];
      return;
    }
    byTime.set(key, {
      id: item.id,
      time: item.time,
      refs: [...item.refs],
      label: item.label,
    });
  });
  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
}

function formatFrameLabel(time: number, fps: number) {
  return Math.round(Math.max(0, time) * fps).toString();
}

function formatTimecode(time: number, fps: number) {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(time * safeFps));
  const framesPerHour = safeFps * 3600;
  const framesPerMinute = safeFps * 60;
  const hours = Math.floor(totalFrames / framesPerHour);
  const minutes = Math.floor((totalFrames % framesPerHour) / framesPerMinute);
  const seconds = Math.floor((totalFrames % framesPerMinute) / safeFps);
  const frames = totalFrames % safeFps;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${frames
    .toString()
    .padStart(2, "0")}`;
}

function formatTimelineTick(seconds: number, fps: number) {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(seconds * safeFps));
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const frames = totalFrames % safeFps;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}.${frames
    .toString()
    .padStart(2, "0")}`;
}

function formatSeconds(seconds: number) {
  return Number(seconds.toFixed(2)).toString();
}

function InsertKeyframeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="15"
        rx="4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
        transform="rotate(45 12 12)"
        width="15"
        x="4.5"
        y="4.5"
      />
      <path
        d="M12 7.6v8.8M7.6 12h8.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
      />
    </svg>
  );
}

function PlayOnceIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 6.5h15M4 17.5h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
      />
      <path
        d="M16 13.5l4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
      />
      <path
        d="M11.5 10.5V8.5h-1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M11.5 8.5v4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function clampFrameValue(value: number, maxFrame: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(maxFrame, Math.max(0, Math.round(value)));
}

function normalizeExportFrameRange(
  startFrame: number,
  endFrame: number,
  maxFrame: number,
) {
  if (maxFrame <= 0) {
    return {
      startFrame: 0,
      endFrame: 1,
    };
  }

  const nextStartFrame = clampFrameValue(startFrame, maxFrame);
  const nextEndFrame = clampFrameValue(endFrame, maxFrame);

  if (nextEndFrame > nextStartFrame) {
    return {
      startFrame: nextStartFrame,
      endFrame: nextEndFrame,
    };
  }

  if (nextStartFrame >= maxFrame) {
    return {
      startFrame: Math.max(0, maxFrame - 1),
      endFrame: maxFrame,
    };
  }

  return {
    startFrame: nextStartFrame,
    endFrame: Math.min(maxFrame, nextStartFrame + 1),
  };
}

function clampTimelineZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(TIMELINE_MAX_ZOOM, Math.max(TIMELINE_MIN_ZOOM, value));
}

export function TimelinePanel({
  expanded,
  height,
  onHeightChange,
  onToggle,
}: {
  expanded: boolean;
  height: number;
  onHeightChange: (height: number) => void;
  onToggle: () => void;
}) {
  const projectName = useProjectStore((state) => state.projectName);
  const animation = useProjectStore((state) => state.animation);
  const activeObjectId = useProjectStore((state) => state.activeObjectId);
  const activeGroupId = useProjectStore((state) => state.activeGroupId);
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const objects = useProjectStore((state) => state.objects);
  const groups = useProjectStore((state) => state.groups);
  const cameras = useProjectStore((state) => state.cameras);
  const setAnimationTime = useProjectStore((state) => state.setAnimationTime);
  const setAnimationFps = useProjectStore((state) => state.setAnimationFps);
  const setAnimationDuration = useProjectStore((state) => state.setAnimationDuration);
  const setAnimationInPoint = useProjectStore((state) => state.setAnimationInPoint);
  const setAnimationOutPoint = useProjectStore((state) => state.setAnimationOutPoint);
  const clearAnimationInPoint = useProjectStore((state) => state.clearAnimationInPoint);
  const clearAnimationOutPoint = useProjectStore((state) => state.clearAnimationOutPoint);
  const setAnimationInPointToCurrentTime = useProjectStore(
    (state) => state.setAnimationInPointToCurrentTime,
  );
  const setAnimationOutPointToCurrentTime = useProjectStore(
    (state) => state.setAnimationOutPointToCurrentTime,
  );
  const addCameraCutAtTime = useProjectStore((state) => state.addCameraCutAtTime);
  const toggleAnimationPlayback = useProjectStore(
    (state) => state.toggleAnimationPlayback,
  );
  const toggleAnimationLoop = useProjectStore((state) => state.toggleAnimationLoop);
  const toggleAnimationCameraCutsEnabled = useProjectStore(
    (state) => state.toggleAnimationCameraCutsEnabled,
  );
  const setAnimationAutoKeyEnabled = useProjectStore(
    (state) => state.setAnimationAutoKeyEnabled,
  );
  const captureCurrentKeyframe = useProjectStore(
    (state) => state.captureCurrentKeyframe,
  );
  const addCurrentCameraCut = useProjectStore((state) => state.addCurrentCameraCut);
  const removeSelectedTimelineKeyframe = useProjectStore(
    (state) => state.removeSelectedTimelineKeyframe,
  );
  const moveSelectedTimelineKeyframe = useProjectStore(
    (state) => state.moveSelectedTimelineKeyframe,
  );
  const beginHistoryDraft = useProjectStore((state) => state.beginHistoryDraft);
  const commitHistoryDraft = useProjectStore((state) => state.commitHistoryDraft);
  const [feedback, setFeedback] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedKeyframe, setSelectedKeyframe] = useState<{
    id: string;
    refs: TimelineKeyframeRef[];
    time: number;
  } | null>(null);
  const [draggingKeyframe, setDraggingKeyframe] = useState<{
    id: string;
    refs: TimelineKeyframeRef[];
    time: number;
    laneLeft: number;
    laneWidth: number;
    pointerOffsetX: number;
  } | null>(null);
  const [seekingTimeline, setSeekingTimeline] = useState(false);
  const [draggingRangePoint, setDraggingRangePoint] = useState<{
    type: "in" | "out";
    laneLeft: number;
    laneWidth: number;
  } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStart, setExportStart] = useState("0");
  const [exportEnd, setExportEnd] = useState("");
  const [exportRangeCustomized, setExportRangeCustomized] = useState(false);
  const [exportError, setExportError] = useState("");
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [lastEditedKeyframeIds, setLastEditedKeyframeIds] = useState<string[]>([]);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [toolbarTooltip, setToolbarTooltip] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const previousBindingsRef = useRef(animation.bindings);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineLeftListRef = useRef<HTMLDivElement>(null);
  const timelineRightListRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const syncingTrackScrollRef = useRef<"left" | "right" | null>(null);
  const timelinePanStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    laneLeft: number;
    laneWidth: number;
    isPanning: boolean;
  } | null>(null);

  const activeObject = activeObjectId
    ? objects.find((object) => object.id === activeObjectId)
    : undefined;
  const activeCamera = selectedCameraId
    ? cameras.find((camera) => camera.id === selectedCameraId)
    : undefined;
  const activeGroup = activeGroupId
    ? groups.find((group) => group.id === activeGroupId)
    : undefined;
  const cameraCutsEnabled = animation.cameraCutsEnabled !== false;

  useEffect(() => {
    if (!activeGroup) {
      return;
    }
    setExpandedNodes((current) => {
      const next = {
        ...current,
        summary: true,
        "group:object": true,
        [`scene-group:${activeGroup.id}`]: true,
      };
      return Object.keys(next).every((key) => next[key] === current[key]) ? current : next;
    });
  }, [activeGroup]);
  const objectMap = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const cameraMap = useMemo(
    () => new Map(cameras.map((camera) => [camera.id, camera])),
    [cameras],
  );

  const cameraCutMarkers = useMemo<TimelineCameraMarker[]>(
    () =>
      animation.cameraCuts
        .map((cut) => {
          const time = cut.startTime ?? cut.time ?? 0;
          return {
            id: `camera-cut:${cut.id}`,
            cameraId: cut.cameraId,
            label: cameraMap.get(cut.cameraId)?.name ?? "未知机位",
            time,
            refs: [
              {
                kind: "cameraCut" as const,
                cutId: cut.id,
              },
            ],
          };
        })
        .sort((left, right) => left.time - right.time),
    [animation.cameraCuts, cameraMap],
  );

  const bindingRows = useMemo(
    () =>
      animation.bindings.map((binding) => {
        const transformChannels = binding.channels.filter((channel) =>
          ["position", "rotation", "scale"].includes(channel.path),
        );
        const otherChannels = binding.channels.filter(
          (channel) => !["position", "rotation", "scale"].includes(channel.path),
        );
        const channelRows = [...transformChannels, ...otherChannels].map((channel) => {
          const bindingObject =
            binding.targetType === "object" ? objectMap.get(binding.targetId) : undefined;
          const suffix =
            channel.boneId && bindingObject?.rig
              ? bindingObject.rig.bones.find((bone) => bone.id === channel.boneId)?.name
              : undefined;
          const resolvedLabel =
            channel.path === "boneRotation" && suffix
              ? `骨骼旋转 · ${formatBoneDisplayName(suffix)}`
              : channel.path === "ikTargetPosition"
                ? `${channel.label}`
                : suffix
                  ? `${channel.label} · ${formatBoneDisplayName(suffix)}`
                  : channel.label;
          const resolvedSubtitle =
            channel.path === "boneRotation"
              ? "骨骼通道"
              : channel.path === "ikTargetPosition"
                ? "IK 通道"
                : channel.valueType === "vec3"
                  ? "三轴通道"
                  : "数值通道";
          return {
            bindingId: binding.id,
            bindingLabel: binding.label,
            channel,
            label: resolvedLabel,
            subtitle: resolvedSubtitle,
            keyframes: channel.keyframes.map((keyframe) => ({
              id: `${binding.id}:${channel.id}:${keyframe.id}`,
              time: keyframe.time,
              refs: [
                {
                  kind: "channel" as const,
                  bindingId: binding.id,
                  channelId: channel.id,
                  keyframeId: keyframe.id,
                },
              ],
            })),
          };
        });
        return {
          id: binding.id,
          label: binding.label,
          targetId: binding.targetId,
          targetType: binding.targetType,
          keyframes: buildDisplayKeyframes(
            channelRows.flatMap((row) => row.keyframes),
          ),
          channelRows,
        };
      }),
    [animation.bindings, objectMap],
  );
  const timelineTree = useMemo<TimelineTreeNode[]>(() => {
    const objectBindings = bindingRows.filter((binding) => binding.targetType === "object");
    const cameraBindings = bindingRows.filter((binding) => binding.targetType === "camera");
    const toBindingNode = (binding: (typeof bindingRows)[number]): TimelineTreeNode => ({
      id: binding.id,
      label: binding.label,
      subtitle: `${binding.channelRows.length} 个通道`,
      kind: "binding",
      keyframes: binding.keyframes,
      children: binding.channelRows.map((row) => ({
        id: `${row.bindingId}:${row.channel.id}`,
        label: row.label,
        subtitle: row.subtitle,
        kind: "channel",
        keyframes: row.keyframes,
      })),
    });
    const groupedObjectIds = new Set(groups.flatMap((group) => group.objectIds));
    const groupChildren = groups.flatMap((group) => {
      const memberBindings = objectBindings.filter((binding) =>
        group.objectIds.includes(binding.targetId),
      );
      if (!memberBindings.length) {
        return [];
      }
      return [
        {
          id: `scene-group:${group.id}`,
          label: group.name,
          subtitle: `${memberBindings.length} 个成员轨道`,
          kind: "group" as const,
          keyframes: buildDisplayKeyframes(
            memberBindings.flatMap((binding) => binding.keyframes),
          ),
          children: memberBindings.map(toBindingNode),
        },
      ];
    });
    const objectChildren: TimelineTreeNode[] = [
      ...groupChildren,
      ...objectBindings
        .filter((binding) => !groupedObjectIds.has(binding.targetId))
        .map(toBindingNode),
    ];
    const cameraChildren: TimelineTreeNode[] = cameraBindings.map(toBindingNode);

      return [
        {
          id: "summary",
          label: "汇总",
          subtitle: "默认展示全局关键帧",
        kind: "summary",
        keyframes: buildDisplayKeyframes(bindingRows.flatMap((binding) => binding.keyframes)),
        laneClassName: "timeline-track-lane timeline-summary-lane",
        children: [
          {
            id: "group:camera",
            label: "机位",
            subtitle: cameraChildren.length ? `${cameraChildren.length} 个机位轨道` : "暂无机位轨道",
            kind: "group",
            keyframes: buildDisplayKeyframes(cameraChildren.flatMap((item) => item.keyframes)),
            children: cameraChildren,
          },
          {
            id: "group:object",
            label: "对象",
            subtitle: objectChildren.length ? `${objectChildren.length} 个对象轨道` : "暂无对象轨道",
            kind: "group",
            keyframes: buildDisplayKeyframes(objectChildren.flatMap((item) => item.keyframes)),
            children: objectChildren,
          },
        ],
      },
    ];
  }, [bindingRows, groups]);

  const selectionLabel = useMemo(() => {
    if (activeGroup) {
      return `当前组：${activeGroup.name}`;
    }
    if (activeObject?.rig?.hasSkeleton && activeObject.rig.boneControlActive) {
      if (activeObject.rig.mode === "fk" && activeObject.rig.activeBoneId) {
        const bone = activeObject.rig.bones.find(
          (item) => item.id === activeObject.rig?.activeBoneId,
        );
        return bone
          ? `当前骨骼：${formatBoneDisplayName(bone.name)}`
          : `当前对象：${activeObject.name}`;
      }
      if (activeObject.rig.mode === "ik" && activeObject.rig.activeIkChainId) {
        const chain = activeObject.rig.ikChains.find(
          (item) => item.id === activeObject.rig?.activeIkChainId,
        );
        return chain ? `当前 IK：${chain.name}` : `当前对象：${activeObject.name}`;
      }
    }
    if (activeObject) {
      return `当前对象：${activeObject.name}`;
    }
    if (activeCamera) {
      return `当前机位：${activeCamera.name}`;
    }
    return "请选择对象、机位或骨骼控制节点";
  }, [activeCamera, activeGroup, activeObject]);

  const ioRange = useMemo(() => {
    const startTime = animation.inPointTime ?? 0;
    const endTime = animation.outPointTime ?? animation.duration;
    return {
      startTime,
      endTime,
      hasInPoint: animation.inPointTime !== undefined,
      hasOutPoint: animation.outPointTime !== undefined,
      hasVisibleRange:
        animation.inPointTime !== undefined || animation.outPointTime !== undefined,
    };
  }, [animation.duration, animation.inPointTime, animation.outPointTime]);

  const timelineExtentSeconds = useMemo(() => {
    const furthestKeyframeTime = bindingRows.reduce((maxTime, binding) => {
      const bindingMax = binding.keyframes.reduce(
        (rowMax, keyframe) => Math.max(rowMax, keyframe.time),
        0,
      );
      return Math.max(maxTime, bindingMax);
    }, 0);
    const furthestCameraCutTime = cameraCutMarkers.reduce(
      (maxTime, marker) => Math.max(maxTime, marker.time),
      0,
    );
    const furthestExplicitTime = Math.max(
      animation.currentTime,
      animation.inPointTime ?? 0,
      animation.outPointTime ?? 0,
      furthestKeyframeTime,
      furthestCameraCutTime,
    );
    return Math.max(
      OPEN_TIMELINE_MIN_SECONDS,
      animation.duration + OPEN_TIMELINE_LOOKAHEAD_SECONDS,
      furthestExplicitTime + OPEN_TIMELINE_LOOKAHEAD_SECONDS,
    );
  }, [
    animation.currentTime,
    animation.duration,
    animation.inPointTime,
    animation.outPointTime,
    bindingRows,
    cameraCutMarkers,
  ]);

  const ensureTimelineCoversTime = useCallback((time: number) => {
    if (!Number.isFinite(time) || time <= animation.duration) {
      return;
    }
    setAnimationDuration(time + OPEN_TIMELINE_LOOKAHEAD_SECONDS);
  }, [animation.duration, setAnimationDuration]);

  const collectKeyframeIdsAtTime = (
    targetType: "object" | "camera",
    targetId: string,
    time: number,
  ) => {
    const timeKey = time.toFixed(4);
    return bindingRows
      .filter((binding) => binding.targetType === targetType && binding.targetId === targetId)
      .flatMap((binding) =>
        binding.channelRows.flatMap((row) =>
          row.keyframes
            .filter((keyframe) => keyframe.time.toFixed(4) === timeKey)
            .map((keyframe) => keyframe.id),
        ),
      );
  };

  const collectGroupKeyframeIdsAtTime = (groupId: string, time: number) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) {
      return [];
    }
    return group.objectIds.flatMap((objectId) =>
      collectKeyframeIdsAtTime("object", objectId, time),
    );
  };

  const handleCapture = () => {
    const result = captureCurrentKeyframe();
    if (result.ok) {
      if (activeGroup) {
        setLastEditedKeyframeIds(
          collectGroupKeyframeIdsAtTime(activeGroup.id, animation.currentTime),
        );
      } else if (activeObject) {
        setLastEditedKeyframeIds(
          collectKeyframeIdsAtTime("object", activeObject.id, animation.currentTime),
        );
      } else if (activeCamera) {
        setLastEditedKeyframeIds(
          collectKeyframeIdsAtTime("camera", activeCamera.id, animation.currentTime),
        );
      }
    }
    setFeedback(result.ok ? "已记录关键帧" : result.message);
  };

  const handleCameraCutCapture = (cameraId?: string) => {
    const result = cameraId ? addCameraCutAtTime(cameraId) : addCurrentCameraCut();
    setCameraMenuOpen(false);
    setFeedback(result.ok ? "已添加机位切换点" : result.message);
  };

  const handleSetInPoint = () => {
    const shouldClear =
      animation.inPointTime !== undefined &&
      Math.abs(animation.inPointTime - animation.currentTime) < 0.0001;
    setAnimationInPointToCurrentTime();
    setFeedback(shouldClear ? "已清除入点" : "已设置入点");
  };

  const handleSetOutPoint = () => {
    const shouldClear =
      animation.outPointTime !== undefined &&
      Math.abs(animation.outPointTime - animation.currentTime) < 0.0001;
    setAnimationOutPointToCurrentTime();
    setFeedback(shouldClear ? "已清除出点" : "已设置出点");
  };

  const handleClearInPoint = useCallback(() => {
    clearAnimationInPoint();
    setFeedback("已清除入点");
  }, [clearAnimationInPoint]);

  const handleClearOutPoint = useCallback(() => {
    clearAnimationOutPoint();
    setFeedback("已清除出点");
  }, [clearAnimationOutPoint]);

  const handleTogglePlaybackMode = () => {
    toggleAnimationLoop();
    setFeedback(animation.loop ? "播放模式：只播放一次" : "播放模式：循环播放");
  };

  const handleToggleCameraCutsEnabled = () => {
    toggleAnimationCameraCutsEnabled();
    setFeedback(cameraCutsEnabled ? "机位切换已关闭" : "机位切换已开启");
  };

  const updateRangePointAtClientX = useCallback((
    type: "in" | "out",
    clientX: number,
    laneLeft: number,
    laneWidth: number,
  ) => {
    const relativeX = Math.min(laneWidth, Math.max(0, clientX - laneLeft));
    const nextTime = (relativeX / Math.max(laneWidth, 1)) * timelineExtentSeconds;
    ensureTimelineCoversTime(nextTime);
    if (type === "in") {
      setAnimationInPoint(nextTime);
      setFeedback(`入点：第 ${formatFrameLabel(nextTime, animation.fps)} 帧`);
      return;
    }
    setAnimationOutPoint(nextTime);
    setFeedback(`出点：第 ${formatFrameLabel(nextTime, animation.fps)} 帧`);
  }, [
    animation.fps,
    ensureTimelineCoversTime,
    setAnimationInPoint,
    setAnimationOutPoint,
    timelineExtentSeconds,
  ]);

  const handleRangePointPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    type: "in" | "out",
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const laneRect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!laneRect) {
      return;
    }
    beginHistoryDraft();
    setDraggingRangePoint({
      type,
      laneLeft: laneRect.left,
      laneWidth: laneRect.width,
    });
  };

  useEffect(() => {
    if (!cameraMenuOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!cameraMenuRef.current?.contains(event.target as Node)) {
        setCameraMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [cameraMenuOpen]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) {
        return;
      }
      const delta = resizeStateRef.current.startY - event.clientY;
      const maxHeight = Math.min(window.innerHeight * 0.78, 760);
      onHeightChange(
        Math.round(Math.min(maxHeight, Math.max(220, resizeStateRef.current.startHeight + delta))),
      );
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onHeightChange]);

  const handleDeleteSelectedKeyframe = () => {
    if (!selectedKeyframe) {
      return;
    }
    removeSelectedTimelineKeyframe(selectedKeyframe.refs);
    setSelectedKeyframe(null);
    setFeedback("已删除关键帧");
  };

  useEffect(() => {
    setExpandedNodes((current) =>
      current.summary === undefined
        ? {
            ...current,
            summary: true,
            "group:camera": true,
            "group:object": true,
          }
        : current,
    );
  }, [timelineTree]);

  useEffect(() => {
    if (!selectedKeyframe) {
      return undefined;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }
      event.preventDefault();
      handleDeleteSelectedKeyframe();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [selectedKeyframe]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== "i" && key !== "o") {
        return;
      }
      event.preventDefault();
      if (key === "i") {
        handleSetInPoint();
        return;
      }
      handleSetOutPoint();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleSetInPoint, handleSetOutPoint]);

  useEffect(() => {
    if (previousBindingsRef.current === animation.bindings) {
      return;
    }
    previousBindingsRef.current = animation.bindings;
    if (activeGroup) {
      setLastEditedKeyframeIds(
        collectGroupKeyframeIdsAtTime(activeGroup.id, animation.currentTime),
      );
      return;
    }
    if (activeObject) {
      setLastEditedKeyframeIds(
        collectKeyframeIdsAtTime("object", activeObject.id, animation.currentTime),
      );
      return;
    }
    if (activeCamera) {
      setLastEditedKeyframeIds(
        collectKeyframeIdsAtTime("camera", activeCamera.id, animation.currentTime),
      );
    }
  }, [
    activeCamera,
    activeGroup,
    activeObject,
    animation.bindings,
    animation.currentTime,
    bindingRows,
    groups,
  ]);

  useEffect(() => {
    if (!draggingKeyframe) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const relativeX = Math.min(
        draggingKeyframe.laneWidth,
        Math.max(
          0,
          event.clientX - draggingKeyframe.laneLeft - draggingKeyframe.pointerOffsetX,
        ),
      );
      const nextTime =
        (relativeX / Math.max(draggingKeyframe.laneWidth, 1)) * timelineExtentSeconds;
      if (Math.abs(nextTime - draggingKeyframe.time) < 0.0001) {
        return;
      }
      ensureTimelineCoversTime(nextTime);
      moveSelectedTimelineKeyframe(draggingKeyframe.refs, nextTime);
      setLastEditedKeyframeIds([draggingKeyframe.id]);
      setSelectedKeyframe((current) =>
        current && current.id === draggingKeyframe.id
          ? { ...current, time: nextTime }
          : current,
      );
      setDraggingKeyframe((current) =>
        current && current.id === draggingKeyframe.id
          ? { ...current, time: nextTime }
          : current,
      );
    };

    const handlePointerUp = () => {
      commitHistoryDraft();
      setDraggingKeyframe(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    commitHistoryDraft,
    draggingKeyframe,
    ensureTimelineCoversTime,
    moveSelectedTimelineKeyframe,
    timelineExtentSeconds,
  ]);

  useEffect(() => {
    if (!draggingRangePoint) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateRangePointAtClientX(
        draggingRangePoint.type,
        event.clientX,
        draggingRangePoint.laneLeft,
        draggingRangePoint.laneWidth,
      );
    };

    const handlePointerUp = () => {
      commitHistoryDraft();
      setDraggingRangePoint(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [commitHistoryDraft, draggingRangePoint, updateRangePointAtClientX]);

  const seekTimelineAtClientX = useCallback((
    clientX: number,
    laneLeft: number,
    laneWidth: number,
  ) => {
    const relativeX = Math.min(laneWidth, Math.max(0, clientX - laneLeft));
    const nextTime = (relativeX / Math.max(laneWidth, 1)) * timelineExtentSeconds;
    ensureTimelineCoversTime(nextTime);
    setAnimationTime(nextTime);
  }, [ensureTimelineCoversTime, setAnimationTime, timelineExtentSeconds]);

  const scrollTimelinePaneForPointer = useCallback((clientX: number) => {
    const scrollPane = timelineScrollRef.current;
    if (!scrollPane) {
      return;
    }
    const rect = scrollPane.getBoundingClientRect();
    const threshold = 56;
    const maxScrollLeft = Math.max(0, scrollPane.scrollWidth - scrollPane.clientWidth);

    if (clientX >= rect.right - threshold && scrollPane.scrollLeft < maxScrollLeft) {
      const distance = rect.right - clientX;
      const strength = Math.max(0, threshold - Math.max(distance, 0)) / threshold;
      scrollPane.scrollLeft = Math.min(
        maxScrollLeft,
        scrollPane.scrollLeft + Math.max(8, strength * 24),
      );
      return;
    }

    if (clientX <= rect.left + threshold && scrollPane.scrollLeft > 0) {
      const distance = clientX - rect.left;
      const strength = Math.max(0, threshold - Math.max(distance, 0)) / threshold;
      scrollPane.scrollLeft = Math.max(
        0,
        scrollPane.scrollLeft - Math.max(8, strength * 24),
      );
    }
  }, []);

  const seekTimelineAtPointer = useCallback((clientX: number) => {
    scrollTimelinePaneForPointer(clientX);
    const laneElement = timelineScrollRef.current?.querySelector(".timeline-ruler");
    if (!(laneElement instanceof HTMLElement)) {
      return;
    }
    const laneRect = laneElement.getBoundingClientRect();
    seekTimelineAtClientX(clientX, laneRect.left, laneRect.width);
  }, [scrollTimelinePaneForPointer, seekTimelineAtClientX]);

  useEffect(() => {
    if (!seekingTimeline) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      seekTimelineAtPointer(event.clientX);
    };

    const handlePointerUp = () => {
      setSeekingTimeline(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [seekTimelineAtPointer, seekingTimeline]);

  const handleTimelineSeekPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const laneRect = event.currentTarget.getBoundingClientRect();
    seekTimelineAtClientX(event.clientX, laneRect.left, laneRect.width);
    setSeekingTimeline(true);
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const panState = timelinePanStateRef.current;
      if (!panState) {
        return;
      }

      const deltaX = event.clientX - panState.startClientX;
      const deltaY = event.clientY - panState.startClientY;

      if (!panState.isPanning) {
        if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) {
          return;
        }
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          panState.isPanning = true;
        } else {
          timelinePanStateRef.current = null;
          return;
        }
      }

      event.preventDefault();
      if (timelineScrollRef.current) {
        timelineScrollRef.current.scrollLeft = panState.startScrollLeft - deltaX;
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const panState = timelinePanStateRef.current;
      if (!panState) {
        return;
      }
      if (!panState.isPanning) {
        seekTimelineAtClientX(event.clientX, panState.laneLeft, panState.laneWidth);
      }
      timelinePanStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [seekTimelineAtClientX]);

  const handleTimelineLanePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const laneRect = event.currentTarget.getBoundingClientRect();
    timelinePanStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: timelineScrollRef.current?.scrollLeft ?? 0,
      laneLeft: laneRect.left,
      laneWidth: laneRect.width,
      isPanning: false,
    };
  };

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes((current) => ({
      ...current,
      [nodeId]: !current[nodeId],
    }));
  };

  const updateTimelineZoom = useCallback((value: number) => {
    setTimelineZoom(Number(clampTimelineZoom(value).toFixed(2)));
  }, []);

  const timelineZoomPercent = Math.round(timelineZoom * 100);

  const timelineContentWidth = useMemo(
    () =>
      Math.min(
        60000,
        Math.max(
          960,
          Math.round(
            timelineExtentSeconds *
              animation.fps *
              TIMELINE_BASE_PIXELS_PER_FRAME *
              timelineZoom,
          ),
        ),
      ),
    [animation.fps, timelineExtentSeconds, timelineZoom],
  );

  const rulerTicks = useMemo(() => {
    const duration = Math.max(1, timelineExtentSeconds);
    const secondsPerPixel = duration / Math.max(timelineContentWidth, 1);
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const majorStep =
      candidates.find((candidate) => candidate / secondsPerPixel >= 86) ??
      candidates[candidates.length - 1];
    const minorStep = majorStep / 4;
    const showMinorTicks = minorStep / secondsPerPixel >= 14;
    const step = showMinorTicks ? minorStep : majorStep;
    const ticks: Array<{
      key: string;
      label: string;
      left: string;
      major: boolean;
    }> = [];

    const appendTick = (seconds: number, forceMajor = false) => {
      const safeSeconds = Number(Math.min(duration, Math.max(0, seconds)).toFixed(4));
      const major =
        forceMajor ||
        Math.abs(safeSeconds / majorStep - Math.round(safeSeconds / majorStep)) <
          0.001;
      ticks.push({
        key: `${major ? "major" : "minor"}-${safeSeconds}`,
        label: major ? formatTimelineTick(safeSeconds, animation.fps) : "",
        left: `${(safeSeconds / duration) * 100}%`,
        major,
      });
    };

    const tickCount = Math.floor(duration / step) + 1;
    Array.from({ length: tickCount }).forEach((_, index) => {
      appendTick(index * step, index === 0);
    });
    const lastTick = ticks.at(-1);
    if (lastTick && Math.abs(parseFloat(lastTick.left) - 100) > 0.001) {
      appendTick(duration, true);
    }
    return ticks;
  }, [animation.fps, timelineContentWidth, timelineExtentSeconds]);

  const cameraMarkerPlacements = useMemo<TimelineCameraMarkerPlacement[]>(() => {
    const groups: Array<Array<{ marker: TimelineCameraMarker; x: number }>> = [];
    cameraCutMarkers.forEach((marker) => {
      const x =
        (marker.time / Math.max(timelineExtentSeconds, 0.001)) * timelineContentWidth;
      const lastGroup = groups.at(-1);
      const lastMarker = lastGroup?.at(-1);
      if (
        lastGroup &&
        lastMarker &&
        Math.abs(x - lastMarker.x) < CAMERA_MARKER_LABEL_COLLISION_PX
      ) {
        lastGroup.push({ marker, x });
        return;
      }
      groups.push([{ marker, x }]);
    });

    return groups.flatMap((group) =>
      group.map(({ marker }, lane) => ({
        ...marker,
        lane,
        groupSize: group.length,
      })),
    );
  }, [cameraCutMarkers, timelineContentWidth, timelineExtentSeconds]);

  const timelineStopTimes = useMemo(() => {
    const times = new Set<number>();
    bindingRows.forEach((binding) => {
      binding.keyframes.forEach((keyframe) => times.add(Number(keyframe.time.toFixed(4))));
      binding.channelRows.forEach((row) => {
        row.keyframes.forEach((keyframe) => times.add(Number(keyframe.time.toFixed(4))));
      });
    });
    cameraCutMarkers.forEach((marker) => {
      times.add(Number(marker.time.toFixed(4)));
    });
    return Array.from(times).sort((left, right) => left - right);
  }, [bindingRows, cameraCutMarkers]);

  const visibleTimelineNodes = useMemo<VisibleTimelineNode[]>(() => {
    const rows: VisibleTimelineNode[] = [];
    const appendNode = (node: TimelineTreeNode, depth = 0) => {
      if (node.kind === "summary" && depth === 0) {
        node.children?.forEach((child) => appendNode(child, 0));
        return;
      }
      rows.push({ node, depth });
      if (!node.children?.length || !expandedNodes[node.id]) {
        return;
      }
      node.children.forEach((child) => appendNode(child, depth + 1));
    };
    timelineTree.forEach((node) => appendNode(node));
    return rows;
  }, [expandedNodes, timelineTree]);

  const moveToAdjacentKeyframe = (direction: -1 | 1) => {
    const epsilon = 0.0001;
    const candidates =
      direction < 0
        ? timelineStopTimes.filter((time) => time < animation.currentTime - epsilon)
        : timelineStopTimes.filter((time) => time > animation.currentTime + epsilon);
    const nextTime = direction < 0 ? candidates.at(-1) : candidates[0];
    if (nextTime !== undefined) {
      setAnimationTime(nextTime);
    }
  };

  const getExportUnitMax = useCallback(
    () => Math.round(animation.duration * animation.fps),
    [animation.duration, animation.fps],
  );

  const getDefaultExportFrames = useCallback(() => {
    const maxFrame = getExportUnitMax();
    if (ioRange.hasInPoint || ioRange.hasOutPoint) {
      return normalizeExportFrameRange(
        Math.round((animation.inPointTime ?? 0) * animation.fps),
        Math.round((animation.outPointTime ?? animation.duration) * animation.fps),
        maxFrame,
      );
    }
    return normalizeExportFrameRange(
      0,
      Math.round(Math.min(animation.duration, 15) * animation.fps),
      maxFrame,
    );
  }, [
    animation.duration,
    animation.fps,
    animation.inPointTime,
    animation.outPointTime,
    getExportUnitMax,
    ioRange.hasInPoint,
    ioRange.hasOutPoint,
  ]);

  const getCurrentExportFrames = useCallback(() => {
    const fallback = getDefaultExportFrames();
    const startValue = Number(exportStart);
    const endValue = Number(exportEnd);
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
      return fallback;
    }
    return normalizeExportFrameRange(startValue, endValue, getExportUnitMax());
  }, [exportEnd, exportStart, getDefaultExportFrames, getExportUnitMax]);

  const applyExportFrameRange = useCallback((startFrame: number, endFrame: number) => {
    setExportStart(startFrame.toString());
    setExportEnd(endFrame.toString());
    setExportError("");
  }, []);

  const openExportDialog = () => {
    const nextRange = exportRangeCustomized
      ? getCurrentExportFrames()
      : getDefaultExportFrames();
    applyExportFrameRange(nextRange.startFrame, nextRange.endFrame);
    setExportDialogOpen(true);
  };

  useEffect(() => {
    if (!exportDialogOpen || exportRangeCustomized) {
      return;
    }
    const nextRange = getDefaultExportFrames();
    applyExportFrameRange(nextRange.startFrame, nextRange.endFrame);
  }, [
    animation.duration,
    animation.fps,
    animation.inPointTime,
    animation.outPointTime,
    applyExportFrameRange,
    exportDialogOpen,
    exportRangeCustomized,
    getDefaultExportFrames,
  ]);

  const buildExportRange = (): AnimationExportRange | undefined => {
    const startValue = Number(exportStart);
    const endValue = Number(exportEnd);
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
      setExportError("请输入有效的起始和结束点位");
      return undefined;
    }
    if (startValue < 0 || endValue < 0) {
      setExportError("起始和结束点位不能小于 0");
      return undefined;
    }

    const fps = animation.fps;
    const maxFrame = Math.round(animation.duration * fps);
    const { startFrame: clampedStartFrame, endFrame: clampedEndFrame } =
      normalizeExportFrameRange(startValue, endValue, maxFrame);

    if (clampedEndFrame <= clampedStartFrame) {
      setExportError("结束点位必须晚于起始点位");
      return undefined;
    }

    return {
      unit: "frames",
      start: clampedStartFrame,
      end: clampedEndFrame,
      startTime: clampedStartFrame / fps,
      endTime: clampedEndFrame / fps,
      startFrame: clampedStartFrame,
      endFrame: clampedEndFrame,
      frameCount: clampedEndFrame - clampedStartFrame + 1,
    };
  };

  const handleExportAnimation = () => {
    const range = buildExportRange();
    if (!range) {
      return;
    }
    const detail: AnimationExportRequestDetail = {
      name: createAnimationExportName(projectName),
      range,
    };
    window.dispatchEvent(new CustomEvent("animation-export-request", { detail }));
    setExportDialogOpen(false);
    setFeedback(`正在导出 ${range.frameCount} 帧视频`);
  };

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ current: number; total: number }>).detail;
      setFeedback(`正在导出视频 ${detail.current}/${detail.total} 帧`);
    };
    const handleComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ filename: string; format: string }>).detail;
      setFeedback(`已导出视频：${detail.filename}（${detail.format}）`);
    };
    const handleError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setFeedback(detail.message);
    };
    window.addEventListener("animation-export-progress", handleProgress);
    window.addEventListener("animation-export-complete", handleComplete);
    window.addEventListener("animation-export-error", handleError);
    return () => {
      window.removeEventListener("animation-export-progress", handleProgress);
      window.removeEventListener("animation-export-complete", handleComplete);
      window.removeEventListener("animation-export-error", handleError);
    };
  }, []);

  const getKeyframeTitle = (keyframe: TimelineDisplayKeyframe) =>
    `第 ${formatFrameLabel(keyframe.time, animation.fps)} 帧 · ${formatTimecode(
      keyframe.time,
      animation.fps,
    )}`;

  const getCameraMarkerTitle = (marker: TimelineCameraMarker) =>
    `${marker.label} · ${formatTimecode(marker.time, animation.fps)}`;

  const getIoMarkerTitle = (type: "in" | "out", time: number) =>
    `${type === "in" ? "入点" : "出点"} · 第 ${formatFrameLabel(
      time,
      animation.fps,
    )} 帧 · ${formatTimecode(time, animation.fps)}`;

  const exportDurationSeconds = useMemo(() => {
    const range = exportRangeCustomized
      ? getCurrentExportFrames()
      : getDefaultExportFrames();
    return range
      ? formatSeconds(Math.max(0, (range.endFrame - range.startFrame + 1) / Math.max(animation.fps, 1)))
      : "0";
  }, [animation.fps, exportRangeCustomized, getCurrentExportFrames, getDefaultExportFrames]);

  const handleKeyframePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    keyframe: TimelineDisplayKeyframe,
    editable: boolean,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const laneRect = event.currentTarget.parentElement?.getBoundingClientRect();
    setSelectedKeyframe({
      id: keyframe.id,
      refs: keyframe.refs,
      time: keyframe.time,
    });
    if (!editable) {
      return;
    }
    if (!laneRect) {
      return;
    }
    beginHistoryDraft();
    const keyframeLeft =
      (keyframe.time / Math.max(timelineExtentSeconds, 0.001)) * laneRect.width;
    setDraggingKeyframe({
      id: keyframe.id,
      refs: keyframe.refs,
      time: keyframe.time,
      laneLeft: laneRect.left,
      laneWidth: laneRect.width,
      pointerOffsetX: event.clientX - laneRect.left - keyframeLeft,
    });
  };

  const isLastEditedKeyframe = (keyframe: TimelineDisplayKeyframe) =>
    lastEditedKeyframeIds.includes(keyframe.id) ||
    keyframe.refs.some((ref) => {
      if (ref.kind !== "channel") {
        return false;
      }
      return lastEditedKeyframeIds.includes(
        `${ref.bindingId}:${ref.channelId}:${ref.keyframeId}`,
      );
    });

  const renderLane = (
    keyframes: TimelineDisplayKeyframe[],
    laneClassName = "timeline-track-lane",
    interactive = false,
    editable = false,
  ) => (
    <div className={laneClassName} onPointerDown={handleTimelineLanePointerDown}>
      {keyframes.map((keyframe) => (
        <button
          className={`timeline-keyframe ${
            Math.abs(keyframe.time - animation.currentTime) < 0.0001 ? "is-active" : ""
          } ${isLastEditedKeyframe(keyframe) ? "is-last-edited" : ""} ${
            selectedKeyframe?.id === keyframe.id ? "is-selected" : ""
          }`}
          key={keyframe.id}
          style={{
            left: `${(keyframe.time / Math.max(timelineExtentSeconds, 0.001)) * 100}%`,
          }}
          title={getKeyframeTitle(keyframe)}
          type="button"
          onPointerDown={(event) => handleKeyframePointerDown(event, keyframe, editable)}
        />
      ))}
      {interactive ? (
        <input
          className="timeline-scrubber"
          max={timelineExtentSeconds}
          min={0}
          step={1 / animation.fps}
          type="range"
          value={animation.currentTime}
          onInput={(event) => {
            const nextTime = Number((event.target as HTMLInputElement).value);
            ensureTimelineCoversTime(nextTime);
            setAnimationTime(nextTime);
          }}
        />
      ) : null}
    </div>
  );

  const renderCameraLane = () => (
    <div
      className={`timeline-track-lane timeline-camera-lane ${
        cameraCutsEnabled ? "" : "is-disabled"
      }`}
      onPointerDown={handleTimelineLanePointerDown}
    >
      {!cameraCutMarkers.length ? (
        <span className="timeline-camera-empty">未添加机位切换点</span>
      ) : null}
    </div>
  );

  const renderCameraMarkerLayer = () => (
    <div
      className={`timeline-camera-marker-layer ${
        cameraCutsEnabled ? "" : "is-disabled"
      }`}
      aria-hidden={!cameraCutMarkers.length}
    >
      {cameraMarkerPlacements.map((marker) => {
        const isSelected = selectedKeyframe?.id === marker.id;
        return (
          <button
            aria-label={getCameraMarkerTitle(marker)}
            className={`timeline-camera-marker ${
              marker.groupSize > 1 ? "is-staggered" : ""
            } ${isSelected ? "is-selected" : ""}`}
            key={marker.id}
            style={{
              left: `${(marker.time / Math.max(timelineExtentSeconds, 0.001)) * 100}%`,
              "--marker-lane": marker.lane,
              "--marker-label-y": `${10 + marker.lane * 28}px`,
            } as CSSProperties}
            title={getCameraMarkerTitle(marker)}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const laneRect = event.currentTarget.parentElement?.getBoundingClientRect();
              setSelectedKeyframe({
                id: marker.id,
                refs: marker.refs,
                time: marker.time,
              });
              if (!laneRect) {
                return;
              }
              beginHistoryDraft();
              const markerLeft =
                (marker.time / Math.max(timelineExtentSeconds, 0.001)) * laneRect.width;
              setDraggingKeyframe({
                id: marker.id,
                refs: marker.refs,
                time: marker.time,
                laneLeft: laneRect.left,
                laneWidth: laneRect.width,
                pointerOffsetX: event.clientX - laneRect.left - markerLeft,
              });
            }}
          >
            <span className="timeline-camera-marker-line" />
            <span className="timeline-camera-marker-label">
              <Camera size={12} />
              <span>{marker.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderGlobalPlayhead = () => (
    <div
      className="timeline-global-playhead"
      style={
        {
          "--playhead-left": `${
            (animation.currentTime / Math.max(timelineExtentSeconds, 0.001)) * 100
          }%`,
        } as CSSProperties
      }
    >
      <span>{formatFrameLabel(animation.currentTime, animation.fps)}</span>
    </div>
  );

  const renderIoRange = () => {
    if (!ioRange.hasVisibleRange) {
      return null;
    }

    const left = (ioRange.startTime / Math.max(timelineExtentSeconds, 0.001)) * 100;
    const width =
      ((ioRange.endTime - ioRange.startTime) / Math.max(timelineExtentSeconds, 0.001)) * 100;

    return (
      <div
        className="timeline-io-range"
        style={{
          left: `${left}%`,
          width: `${Math.max(width, 0)}%`,
        }}
      />
    );
  };

  const renderIoMarkers = () => (
    <>
      {animation.inPointTime !== undefined ? (
        <button
          aria-label="拖拽或双击取消入点"
          className={`timeline-io-marker is-in ${
            draggingRangePoint?.type === "in" ? "is-dragging" : ""
          }`}
          style={{
            left: `${(animation.inPointTime / Math.max(timelineExtentSeconds, 0.001)) * 100}%`,
          }}
          title={getIoMarkerTitle("in", animation.inPointTime)}
          type="button"
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleClearInPoint();
          }}
          onPointerDown={(event) => handleRangePointPointerDown(event, "in")}
        >
          I
        </button>
      ) : null}
      {animation.outPointTime !== undefined ? (
        <button
          aria-label="拖拽或双击取消出点"
          className={`timeline-io-marker is-out ${
            draggingRangePoint?.type === "out" ? "is-dragging" : ""
          }`}
          style={{
            left: `${(animation.outPointTime / Math.max(timelineExtentSeconds, 0.001)) * 100}%`,
          }}
          title={getIoMarkerTitle("out", animation.outPointTime)}
          type="button"
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleClearOutPoint();
          }}
          onPointerDown={(event) => handleRangePointPointerDown(event, "out")}
        >
          O
        </button>
      ) : null}
    </>
  );

  const getVisibleNodeKeyframes = (node: TimelineTreeNode) => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = Boolean(expandedNodes[node.id]);
    const subtitleVisible = !(hasChildren && isExpanded);
    const suppressAggregatePreview =
      Boolean(draggingKeyframe) &&
      draggingKeyframe?.refs.length === 1 &&
      draggingKeyframe.refs[0]?.kind === "channel" &&
      hasChildren;
    const visibleKeyframes = suppressAggregatePreview ? [] : node.keyframes;

    return {
      subtitleVisible,
      visibleKeyframes,
    };
  };

  const renderTreeLabel = ({ node, depth }: VisibleTimelineNode) => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = Boolean(expandedNodes[node.id]);
    const labelClassName =
      node.kind === "channel" ? "timeline-track-meta timeline-node-meta" : "timeline-binding-toggle";
    const { subtitleVisible } = getVisibleNodeKeyframes(node);

    return (
      <div className={`timeline-label-row timeline-node-${node.kind}`} key={`label:${node.id}`}>
        {hasChildren ? (
          <button
            aria-expanded={isExpanded}
            className={labelClassName}
            style={{ "--timeline-indent": `${depth * 16}px` } as CSSProperties}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleNodeExpanded(node.id);
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="timeline-binding-name">{node.label}</span>
            {subtitleVisible && node.subtitle ? <small>{node.subtitle}</small> : null}
          </button>
        ) : (
          <div
            className={labelClassName}
            style={{ "--timeline-indent": `${depth * 16}px` } as CSSProperties}
          >
            <span className="timeline-node-bullet" />
            <strong>{node.label}</strong>
            {node.subtitle ? <span>{node.subtitle}</span> : null}
          </div>
        )}
      </div>
    );
  };

  const renderTreeLane = ({ node, depth }: VisibleTimelineNode) => {
    const laneClassName = node.laneClassName ?? "timeline-track-lane";
    const { visibleKeyframes } = getVisibleNodeKeyframes(node);

    return (
      <div className={`timeline-lane-row timeline-node-group depth-${depth}`} key={`lane:${node.id}`}>
        {renderLane(
          visibleKeyframes,
          laneClassName,
          node.kind === "summary",
          Boolean(visibleKeyframes.length),
        )}
      </div>
    );
  };

  const syncTrackScroll = (source: "left" | "right") => {
    const sourceElement =
      source === "left" ? timelineLeftListRef.current : timelineRightListRef.current;
    const targetElement =
      source === "left" ? timelineRightListRef.current : timelineLeftListRef.current;
    const targetSide = source === "left" ? "right" : "left";

    if (!sourceElement || !targetElement) {
      return;
    }
    if (syncingTrackScrollRef.current === source) {
      syncingTrackScrollRef.current = null;
      return;
    }
    syncingTrackScrollRef.current = targetSide;
    targetElement.scrollTop = sourceElement.scrollTop;
    requestAnimationFrame(() => {
      if (syncingTrackScrollRef.current === targetSide) {
        syncingTrackScrollRef.current = null;
      }
    });
  };

  const showToolbarTooltip = (
    event:
      | ReactFocusEvent<HTMLButtonElement>
      | ReactMouseEvent<HTMLButtonElement>,
    label: string,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setToolbarTooltip({
      label,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    });
  };

  const hideToolbarTooltip = () => {
    setToolbarTooltip(null);
  };

  return (
    <section
      className={`timeline-panel ${expanded ? "is-expanded" : "is-collapsed"}`}
      style={expanded ? { height: `${height}px` } : undefined}
    >
      {expanded ? (
        <button
          className="timeline-resize-handle"
          type="button"
          aria-label="调整关键帧时间线高度"
          onPointerDown={(event) => {
            event.preventDefault();
            resizeStateRef.current = {
              startY: event.clientY,
              startHeight: height,
            };
          }}
        >
          <span />
        </button>
      ) : null}
      <div className="timeline-dock-bar">
        <button
          aria-label="展开时间线"
          className="timeline-toggle-button"
          title="展开时间线"
          type="button"
          onClick={onToggle}
        >
          <Video size={15} />
          <span>关键帧动画</span>
          <ChevronUp className={expanded ? "is-expanded" : ""} size={15} />
        </button>

        <div className="timeline-dock-status">
          <span>{selectionLabel}</span>
          <span>{formatTimecode(animation.currentTime, animation.fps)}</span>
        </div>

        <div className="timeline-dock-actions">
          <button
            className={`timeline-auto-key-button ${
              animation.autoKeyEnabled ? "is-active" : ""
            }`}
            type="button"
            onClick={() => setAnimationAutoKeyEnabled(!animation.autoKeyEnabled)}
          >
            <Circle size={10} />
            <span>自动关键帧</span>
          </button>
          <button className="timeline-primary-button" type="button" onClick={handleCapture}>
            <InsertKeyframeIcon size={14} />
            <span>手动插帧</span>
          </button>
          <button
            className="timeline-ghost-button"
            disabled={!selectedKeyframe}
            type="button"
            onClick={handleDeleteSelectedKeyframe}
          >
            <Trash2 size={14} />
            <span>删除关键帧</span>
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="timeline-panel-body">
          <div className="timeline-editor-toolbar">
            <div className="timeline-toolbar-main">
              <div className="timeline-playback-group">
                <button
                  aria-label="收起时间线"
                  className="timeline-icon-button timeline-collapse-button"
                  data-tooltip="收起时间线"
                  title="收起时间线"
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={onToggle}
                  onFocus={(event) => showToolbarTooltip(event, "收起时间线")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "收起时间线")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  aria-label={animation.isPlaying ? "暂停" : "播放"}
                  className="timeline-icon-button"
                  data-tooltip={animation.isPlaying ? "暂停" : "播放"}
                  title={animation.isPlaying ? "暂停" : "播放"}
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onFocus={(event) =>
                    showToolbarTooltip(event, animation.isPlaying ? "暂停" : "播放")
                  }
                  onMouseEnter={(event) =>
                    showToolbarTooltip(event, animation.isPlaying ? "暂停" : "播放")
                  }
                  onMouseLeave={hideToolbarTooltip}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleAnimationPlayback();
                  }}
                >
                  {animation.isPlaying ? <Pause size={19} /> : <Play size={19} />}
                </button>
                <button
                  aria-label={`播放模式：${animation.loop ? "循环播放" : "只播放一次"}`}
                  className={`timeline-icon-button timeline-loop-button ${
                    animation.loop ? "is-active" : ""
                  }`}
                  data-tooltip={animation.loop ? "循环播放" : "只播放一次"}
                  title={animation.loop ? "循环播放" : "只播放一次"}
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={handleTogglePlaybackMode}
                  onFocus={(event) =>
                    showToolbarTooltip(
                      event,
                      animation.loop ? "循环播放" : "只播放一次",
                    )
                  }
                  onMouseEnter={(event) =>
                    showToolbarTooltip(
                      event,
                      animation.loop ? "循环播放" : "只播放一次",
                    )
                  }
                  onMouseLeave={hideToolbarTooltip}
                >
                  {animation.loop ? <Repeat size={17} /> : <PlayOnceIcon size={17} />}
                </button>
                <button
                  aria-label="上一关键帧"
                  className="timeline-icon-button"
                  data-tooltip="上一关键帧"
                  title="上一关键帧"
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={() => moveToAdjacentKeyframe(-1)}
                  onFocus={(event) => showToolbarTooltip(event, "上一关键帧")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "上一关键帧")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <SkipBack size={17} />
                </button>
                <button
                  aria-label="手动插帧"
                  className="timeline-icon-button"
                  data-tooltip="手动插帧"
                  title="手动插帧"
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={handleCapture}
                  onFocus={(event) => showToolbarTooltip(event, "手动插帧")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "手动插帧")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <InsertKeyframeIcon size={17} />
                </button>
                <button
                  aria-label="下一关键帧"
                  className="timeline-icon-button"
                  data-tooltip="下一关键帧"
                  title="下一关键帧"
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={() => moveToAdjacentKeyframe(1)}
                  onFocus={(event) => showToolbarTooltip(event, "下一关键帧")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "下一关键帧")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <SkipForward size={17} />
                </button>
              </div>
              <div className="timeline-toolbar-center">
                <label className="timeline-fps-field">
                  <span>帧率</span>
                  <select
                    value={animation.fps}
                    onChange={(event) => setAnimationFps(Number(event.target.value))}
                  >
                    {[24, 25, 30].map((fps) => (
                      <option key={fps} value={fps}>
                        {fps}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="timeline-zoom-control">
                  <button
                    aria-label="缩小时间轴"
                    className="timeline-icon-button"
                    data-tooltip="缩小时间轴"
                    disabled={timelineZoom <= TIMELINE_MIN_ZOOM}
                    title="缩小时间轴"
                    type="button"
                    onBlur={hideToolbarTooltip}
                    onClick={() => updateTimelineZoom(timelineZoom - TIMELINE_ZOOM_STEP)}
                    onFocus={(event) => showToolbarTooltip(event, "缩小时间轴")}
                    onMouseEnter={(event) => showToolbarTooltip(event, "缩小时间轴")}
                    onMouseLeave={hideToolbarTooltip}
                  >
                    <ZoomOut size={15} />
                  </button>
                  <input
                    aria-label="时间轴缩放"
                    className="timeline-zoom-slider"
                    max={TIMELINE_MAX_ZOOM}
                    min={TIMELINE_MIN_ZOOM}
                    step={0.05}
                    type="range"
                    value={timelineZoom}
                    onChange={(event) => updateTimelineZoom(Number(event.target.value))}
                  />
                  <button
                    aria-label="放大时间轴"
                    className="timeline-icon-button"
                    data-tooltip="放大时间轴"
                    disabled={timelineZoom >= TIMELINE_MAX_ZOOM}
                    title="放大时间轴"
                    type="button"
                    onBlur={hideToolbarTooltip}
                    onClick={() => updateTimelineZoom(timelineZoom + TIMELINE_ZOOM_STEP)}
                    onFocus={(event) => showToolbarTooltip(event, "放大时间轴")}
                    onMouseEnter={(event) => showToolbarTooltip(event, "放大时间轴")}
                    onMouseLeave={hideToolbarTooltip}
                  >
                    <ZoomIn size={15} />
                  </button>
                  <span>{timelineZoomPercent}%</span>
                </div>
                <button
                  aria-label="自动关键帧"
                  className={`timeline-auto-key-toggle ${
                    animation.autoKeyEnabled ? "is-active" : ""
                  }`}
                  type="button"
                  onClick={() => setAnimationAutoKeyEnabled(!animation.autoKeyEnabled)}
                >
                  <span>自动关键帧</span>
                  <i aria-hidden="true" />
                </button>
                <button
                  aria-label="设置入点"
                  className="timeline-icon-button"
                  data-tooltip="设置入点"
                  title="设置入点"
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={handleSetInPoint}
                  onFocus={(event) => showToolbarTooltip(event, "设置入点")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "设置入点")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <CornerDownRight size={14} />
                </button>
                <button
                  aria-label="设置出点"
                  className="timeline-icon-button"
                  data-tooltip="设置出点"
                  title="设置出点"
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={handleSetOutPoint}
                  onFocus={(event) => showToolbarTooltip(event, "设置出点")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "设置出点")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <CornerDownLeft size={14} />
                </button>
                <button
                  aria-label="删除"
                  className="timeline-icon-button"
                  data-tooltip="删除"
                  title="删除"
                  disabled={!selectedKeyframe}
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={handleDeleteSelectedKeyframe}
                  onFocus={(event) => showToolbarTooltip(event, "删除")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "删除")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="timeline-toolbar-actions">
                <button
                  aria-label="生成视频"
                  className="timeline-generate-button"
                  data-tooltip="生成视频"
                  title="生成视频"
                  type="button"
                  onBlur={hideToolbarTooltip}
                  onClick={openExportDialog}
                  onFocus={(event) => showToolbarTooltip(event, "生成视频")}
                  onMouseEnter={(event) => showToolbarTooltip(event, "生成视频")}
                  onMouseLeave={hideToolbarTooltip}
                >
                  <Download size={18} />
                  <span>生成</span>
                </button>
              </div>
            </div>
            {toolbarTooltip ? (
              <div
                className="timeline-floating-tooltip"
                style={
                  {
                    "--tooltip-x": `${toolbarTooltip.x}px`,
                    "--tooltip-y": `${toolbarTooltip.y}px`,
                  } as CSSProperties
                }
              >
                {toolbarTooltip.label}
              </div>
            ) : null}
          </div>

          {exportDialogOpen ? (
            <div className="timeline-export-popover" role="dialog" aria-label="导出视频">
              <div className="timeline-export-header">
                <strong>导出视频</strong>
                <span>按帧设置范围</span>
              </div>
              <div className="timeline-export-fields">
                <label className="timeline-number-field">
                  <span>起始</span>
                  <input
                    min={0}
                    max={getExportUnitMax()}
                    step={1}
                    type="number"
                    value={exportStart}
                    onChange={(event) => {
                      setExportRangeCustomized(true);
                      setExportStart(event.target.value);
                      setExportError("");
                    }}
                  />
                  <small>帧</small>
                </label>
                <label className="timeline-number-field">
                  <span>结束</span>
                  <input
                    min={0}
                    max={getExportUnitMax()}
                    step={1}
                    type="number"
                    value={exportEnd}
                    onChange={(event) => {
                      setExportRangeCustomized(true);
                      setExportEnd(event.target.value);
                      setExportError("");
                    }}
                  />
                  <small>帧</small>
                </label>
              </div>
              <div className="timeline-export-summary">
                <span>帧率 {animation.fps} fps</span>
                <span>视频时长 {exportDurationSeconds} s</span>
              </div>
              {exportError ? (
                <div className="timeline-export-error">{exportError}</div>
              ) : null}
              <div className="timeline-export-actions">
                <button
                  className="timeline-ghost-button"
                  type="button"
                  onClick={() => setExportDialogOpen(false)}
                >
                  取消
                </button>
                <button
                  className="timeline-primary-button"
                  type="button"
                  onClick={handleExportAnimation}
                >
                  <Download size={14} />
                  <span>导出 MP4</span>
                </button>
              </div>
            </div>
          ) : null}

          <div
            className="timeline-editor-grid"
          >
            <div className="timeline-left-head timeline-timecode-head">
              <span className="timeline-timecode-value">
                {formatTimecode(animation.currentTime, animation.fps)}
              </span>
            </div>
            <div
              className={`timeline-camera-label ${
                cameraCutsEnabled ? "" : "is-disabled"
              }`}
              ref={cameraMenuRef}
            >
              <span>机位切换</span>
              <button
                aria-label={cameraCutsEnabled ? "关闭机位切换" : "开启机位切换"}
                aria-pressed={cameraCutsEnabled}
                className={`timeline-camera-switch ${
                  cameraCutsEnabled ? "is-active" : ""
                }`}
                title={cameraCutsEnabled ? "关闭机位切换" : "开启机位切换"}
                type="button"
                onClick={handleToggleCameraCutsEnabled}
              >
                {cameraCutsEnabled ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button
                className="timeline-camera-add-button"
                type="button"
                title="添加机位切换点"
                onClick={() => setCameraMenuOpen((current) => !current)}
              >
                <Plus size={14} />
                <Camera size={12} />
              </button>
              {cameraMenuOpen ? (
                <div className="timeline-camera-menu">
                  {cameras.map((camera) => (
                    <button
                      key={camera.id}
                      className="timeline-camera-menu-item"
                      type="button"
                      onClick={() => handleCameraCutCapture(camera.id)}
                    >
                      <Camera size={13} />
                      <span>{camera.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div
              className="timeline-track-list timeline-label-list"
              ref={timelineLeftListRef}
              onScroll={() => syncTrackScroll("left")}
            >
              {visibleTimelineNodes.map((item) => renderTreeLabel(item))}
            </div>
            <div className="timeline-scroll-pane" ref={timelineScrollRef}>
              <div
                className="timeline-scroll-content"
                style={
                  {
                    "--timeline-content-width": `${timelineContentWidth}px`,
                  } as CSSProperties
                }
              >
                <div className="timeline-ruler" onPointerDown={handleTimelineSeekPointerDown}>
                  {renderIoRange()}
                  {rulerTicks.map((tick) => (
                    <span
                      className={`timeline-ruler-tick ${
                        tick.major ? "is-major" : "is-minor"
                      }`}
                      key={tick.key}
                      style={{ left: tick.left }}
                    >
                      {tick.label}
                    </span>
                  ))}
                  {renderIoMarkers()}
                </div>
                {renderCameraLane()}
                {renderCameraMarkerLayer()}
                <div
                  className="timeline-track-list timeline-tree-list timeline-lane-list"
                  ref={timelineRightListRef}
                  onScroll={() => syncTrackScroll("right")}
                >
                  {visibleTimelineNodes.map((item) => renderTreeLane(item))}
                </div>
                {renderGlobalPlayhead()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
