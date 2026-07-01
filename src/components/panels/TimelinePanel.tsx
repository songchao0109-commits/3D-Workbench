import {
  Camera,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Download,
  KeyRound,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
  Video,
} from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
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

type TimelineCameraClip = {
  id: string;
  cameraId: string;
  label: string;
  startTime: number;
  endTime: number;
  refs: TimelineKeyframeRef[];
};

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
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const objects = useProjectStore((state) => state.objects);
  const cameras = useProjectStore((state) => state.cameras);
  const setAnimationTime = useProjectStore((state) => state.setAnimationTime);
  const setAnimationFps = useProjectStore((state) => state.setAnimationFps);
  const addCameraCutAtTime = useProjectStore((state) => state.addCameraCutAtTime);
  const toggleAnimationPlayback = useProjectStore(
    (state) => state.toggleAnimationPlayback,
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
  const resizeCameraCutClip = useProjectStore((state) => state.resizeCameraCutClip);
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
  } | null>(null);
  const [resizingCameraClip, setResizingCameraClip] = useState<{
    cutId: string;
    edge: "start" | "end";
    laneLeft: number;
    laneWidth: number;
  } | null>(null);
  const [seekingTimeline, setSeekingTimeline] = useState<{
    laneLeft: number;
    laneWidth: number;
  } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStart, setExportStart] = useState("0");
  const [exportEnd, setExportEnd] = useState("");
  const [exportError, setExportError] = useState("");
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [lastEditedKeyframeIds, setLastEditedKeyframeIds] = useState<string[]>([]);
  const previousBindingsRef = useRef(animation.bindings);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
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
  const objectMap = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const cameraMap = useMemo(
    () => new Map(cameras.map((camera) => [camera.id, camera])),
    [cameras],
  );

  const cameraCutClips = useMemo<TimelineCameraClip[]>(
    () =>
      animation.cameraCuts
        .map((cut) => {
          const startTime = cut.startTime ?? cut.time ?? 0;
          const endTime = cut.endTime ?? animation.duration;
          return {
            id: `camera-cut:${cut.id}`,
            cameraId: cut.cameraId,
            label: cameraMap.get(cut.cameraId)?.name ?? "未知机位",
            startTime,
            endTime,
            refs: [
              {
                kind: "cameraCut" as const,
                cutId: cut.id,
              },
            ],
          };
        })
        .sort((left, right) => left.startTime - right.startTime),
    [animation.cameraCuts, animation.duration, cameraMap],
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

    const objectChildren: TimelineTreeNode[] = objectBindings.map((binding) => ({
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
    }));

    const cameraChildren: TimelineTreeNode[] = cameraBindings.map((binding) => ({
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
    }));

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
            id: "group:object",
            label: "对象",
            subtitle: objectChildren.length ? `${objectChildren.length} 个对象轨道` : "暂无对象轨道",
            kind: "group",
            keyframes: buildDisplayKeyframes(objectChildren.flatMap((item) => item.keyframes)),
            children: objectChildren,
          },
          {
            id: "group:camera",
            label: "机位",
            subtitle: cameraChildren.length ? `${cameraChildren.length} 个机位轨道` : "暂无机位轨道",
            kind: "group",
            keyframes: buildDisplayKeyframes(cameraChildren.flatMap((item) => item.keyframes)),
            children: cameraChildren,
          },
        ],
      },
    ];
  }, [bindingRows]);

  const selectionLabel = useMemo(() => {
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
  }, [activeCamera, activeObject]);

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

  const handleCapture = () => {
    const result = captureCurrentKeyframe();
    if (result.ok) {
      if (activeObject) {
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
    setFeedback(result.ok ? "已添加机位切换" : result.message);
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
    if (previousBindingsRef.current === animation.bindings) {
      return;
    }
    previousBindingsRef.current = animation.bindings;
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
  }, [activeCamera, activeObject, animation.bindings, animation.currentTime, bindingRows]);

  useEffect(() => {
    if (!draggingKeyframe) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const relativeX = Math.min(
        draggingKeyframe.laneWidth,
        Math.max(0, event.clientX - draggingKeyframe.laneLeft),
      );
      const nextTime =
        (relativeX / Math.max(draggingKeyframe.laneWidth, 1)) * animation.duration;
      if (Math.abs(nextTime - draggingKeyframe.time) < 0.0001) {
        return;
      }
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
      setDraggingKeyframe(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [animation.duration, draggingKeyframe, moveSelectedTimelineKeyframe]);

  useEffect(() => {
    if (!resizingCameraClip) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const relativeX = Math.min(
        resizingCameraClip.laneWidth,
        Math.max(0, event.clientX - resizingCameraClip.laneLeft),
      );
      const nextTime =
        (relativeX / Math.max(resizingCameraClip.laneWidth, 1)) * animation.duration;
      resizeCameraCutClip(
        resizingCameraClip.cutId,
        resizingCameraClip.edge,
        nextTime,
      );
    };

    const handlePointerUp = () => {
      setResizingCameraClip(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [animation.duration, resizingCameraClip, resizeCameraCutClip]);

  const seekTimelineAtClientX = useCallback((
    clientX: number,
    laneLeft: number,
    laneWidth: number,
  ) => {
    const relativeX = Math.min(laneWidth, Math.max(0, clientX - laneLeft));
    setAnimationTime((relativeX / Math.max(laneWidth, 1)) * animation.duration);
  }, [animation.duration, setAnimationTime]);

  useEffect(() => {
    if (!seekingTimeline) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      seekTimelineAtClientX(
        event.clientX,
        seekingTimeline.laneLeft,
        seekingTimeline.laneWidth,
      );
    };

    const handlePointerUp = () => {
      setSeekingTimeline(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [animation.duration, seekingTimeline, setAnimationTime]);

  const handleTimelineSeekPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const laneRect = event.currentTarget.getBoundingClientRect();
    seekTimelineAtClientX(event.clientX, laneRect.left, laneRect.width);
    setSeekingTimeline({
      laneLeft: laneRect.left,
      laneWidth: laneRect.width,
    });
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

  const rulerTicks = useMemo(() => {
    const totalFrames = Math.max(1, Math.round(animation.duration * animation.fps));
    const step = Math.max(1, Math.ceil(totalFrames / 12));
    return Array.from({ length: Math.floor(totalFrames / step) + 1 }).map((_, index) => {
      const frame = Math.min(totalFrames, index * step);
      return {
        key: `frame-${frame}`,
        label: frame.toString(),
        left: `${(frame / totalFrames) * 100}%`,
      };
    });
  }, [animation.duration, animation.fps]);

  const timelineContentWidth = useMemo(
    () => Math.min(12000, Math.max(960, Math.round(animation.duration * animation.fps * 12))),
    [animation.duration, animation.fps],
  );

  const timelineStopTimes = useMemo(() => {
    const times = new Set<number>();
    bindingRows.forEach((binding) => {
      binding.keyframes.forEach((keyframe) => times.add(Number(keyframe.time.toFixed(4))));
      binding.channelRows.forEach((row) => {
        row.keyframes.forEach((keyframe) => times.add(Number(keyframe.time.toFixed(4))));
      });
    });
    cameraCutClips.forEach((clip) => {
      times.add(Number(clip.startTime.toFixed(4)));
      times.add(Number(clip.endTime.toFixed(4)));
    });
    return Array.from(times).sort((left, right) => left - right);
  }, [bindingRows, cameraCutClips]);

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

  const getExportUnitMax = () => Math.round(animation.duration * animation.fps);

  const openExportDialog = () => {
    setExportStart("0");
    setExportEnd(getExportUnitMax().toString());
    setExportError("");
    setExportDialogOpen(true);
  };

  useEffect(() => {
    if (!exportDialogOpen) {
      return;
    }
    setExportStart("0");
    setExportEnd(getExportUnitMax().toString());
    setExportError("");
  }, [animation.duration, animation.fps, exportDialogOpen]);

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
    const startFrame = Math.round(startValue);
    const endFrame = Math.round(endValue);
    const clampedStartFrame = Math.min(maxFrame, Math.max(0, startFrame));
    const clampedEndFrame = Math.min(maxFrame, Math.max(0, endFrame));

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

  const getClipTitle = (clip: TimelineCameraClip) =>
    `${clip.label} · ${formatTimecode(clip.startTime, animation.fps)} - ${formatTimecode(
      clip.endTime,
      animation.fps,
    )}`;

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
    setDraggingKeyframe({
      id: keyframe.id,
      refs: keyframe.refs,
      time: keyframe.time,
      laneLeft: laneRect.left,
      laneWidth: laneRect.width,
    });
  };

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
          } ${
            lastEditedKeyframeIds.includes(keyframe.id) ? "is-last-edited" : ""
          } ${selectedKeyframe?.id === keyframe.id ? "is-selected" : ""}`}
          key={keyframe.id}
          style={{
            left: `${(keyframe.time / Math.max(animation.duration, 0.001)) * 100}%`,
          }}
          title={getKeyframeTitle(keyframe)}
          type="button"
          onPointerDown={(event) => handleKeyframePointerDown(event, keyframe, editable)}
        />
      ))}
      {interactive ? (
        <input
          className="timeline-scrubber"
          max={animation.duration}
          min={0}
          step={1 / animation.fps}
          type="range"
          value={animation.currentTime}
          onInput={(event) => {
            setAnimationTime(Number((event.target as HTMLInputElement).value));
          }}
        />
      ) : null}
    </div>
  );

  const renderCameraLane = () => (
    <div
      className="timeline-track-lane timeline-camera-lane"
      onPointerDown={handleTimelineLanePointerDown}
    >
      {!cameraCutClips.length ? (
        <span className="timeline-camera-empty">未添加任何机位</span>
      ) : null}
      {cameraCutClips.map((clip) => {
        const left = (clip.startTime / Math.max(animation.duration, 0.001)) * 100;
        const width =
          ((clip.endTime - clip.startTime) / Math.max(animation.duration, 0.001)) * 100;
        const cutRef = clip.refs.find((ref) => ref.kind === "cameraCut");
        return (
          <div
            className={`timeline-camera-clip ${
              selectedKeyframe?.id === clip.id ? "is-selected" : ""
            }`}
            key={clip.id}
            role="button"
            style={{
              left: `${left}%`,
              width: `${Math.max(width, 2)}%`,
            }}
            tabIndex={0}
            title={getClipTitle(clip)}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const laneRect = event.currentTarget.parentElement?.getBoundingClientRect();
              setSelectedKeyframe({
                id: clip.id,
                refs: clip.refs,
                time: clip.startTime,
              });
              if (!laneRect) {
                return;
              }
              setDraggingKeyframe({
                id: clip.id,
                refs: clip.refs,
                time: clip.startTime,
                laneLeft: laneRect.left,
                laneWidth: laneRect.width,
              });
            }}
          >
            {cutRef?.kind === "cameraCut" ? (
              <>
                <span
                  className="timeline-camera-clip-handle is-start"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const laneRect = event.currentTarget
                      .closest(".timeline-camera-lane")
                      ?.getBoundingClientRect();
                    if (!laneRect) {
                      return;
                    }
                    setSelectedKeyframe({
                      id: clip.id,
                      refs: clip.refs,
                      time: clip.startTime,
                    });
                    setResizingCameraClip({
                      cutId: cutRef.cutId,
                      edge: "start",
                      laneLeft: laneRect.left,
                      laneWidth: laneRect.width,
                    });
                  }}
                />
                <strong>{clip.label}</strong>
                <span
                  className="timeline-camera-clip-handle is-end"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const laneRect = event.currentTarget
                      .closest(".timeline-camera-lane")
                      ?.getBoundingClientRect();
                    if (!laneRect) {
                      return;
                    }
                    setSelectedKeyframe({
                      id: clip.id,
                      refs: clip.refs,
                      time: clip.endTime,
                    });
                    setResizingCameraClip({
                      cutId: cutRef.cutId,
                      edge: "end",
                      laneLeft: laneRect.left,
                      laneWidth: laneRect.width,
                    });
                  }}
                />
              </>
            ) : (
              <strong>{clip.label}</strong>
            )}
          </div>
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
            (animation.currentTime / Math.max(animation.duration, 0.001)) * 100
          }%`,
        } as CSSProperties
      }
    >
      <span>{formatFrameLabel(animation.currentTime, animation.fps)}</span>
    </div>
  );

  const renderTreeNode = (node: TimelineTreeNode, depth = 0) => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = Boolean(expandedNodes[node.id]);
    const laneClassName = node.laneClassName ?? "timeline-track-lane";
    const labelClassName =
      node.kind === "channel" ? "timeline-track-meta timeline-node-meta" : "timeline-binding-toggle";
    const subtitleVisible = !(hasChildren && isExpanded);
    const suppressAggregatePreview =
      Boolean(draggingKeyframe) &&
      draggingKeyframe?.refs.length === 1 &&
      draggingKeyframe.refs[0]?.kind === "channel" &&
      hasChildren;
    const visibleKeyframes = suppressAggregatePreview ? [] : node.keyframes;

    return (
      <div className={`timeline-node-group depth-${depth}`} key={node.id}>
        <div className={`timeline-track-row timeline-node-row timeline-node-${node.kind}`}>
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
          {renderLane(
            visibleKeyframes,
            laneClassName,
            node.kind === "summary",
            Boolean(visibleKeyframes.length),
          )}
        </div>

        {hasChildren && isExpanded
          ? node.children?.map((child) => renderTreeNode(child, depth + 1))
          : null}
      </div>
    );
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
        <button className="timeline-toggle-button" type="button" onClick={onToggle}>
          <Video size={15} />
          <span>关键帧时间线</span>
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
            <KeyRound size={14} />
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
            <button className="timeline-editor-title" type="button" onClick={onToggle}>
              <Video size={15} />
              <strong>关键帧动画</strong>
              <ChevronDown size={15} />
            </button>
            <label className="timeline-fps-field">
              <span>帧率:</span>
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
            <div className="timeline-playback-group">
              <button type="button" onClick={() => moveToAdjacentKeyframe(-1)}>
                <SkipBack size={14} />
                <span>上一关键帧</span>
              </button>
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleAnimationPlayback();
                }}
              >
                {animation.isPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{animation.isPlaying ? "暂停" : "播放"}</span>
              </button>
              <button type="button" onClick={() => moveToAdjacentKeyframe(1)}>
                <SkipForward size={14} />
                <span>下一关键帧</span>
              </button>
            </div>
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
              <KeyRound size={14} />
              <span>手动插帧</span>
            </button>
            <button
              className="timeline-ghost-button"
              disabled={!selectedKeyframe}
              type="button"
              onClick={handleDeleteSelectedKeyframe}
            >
              <Trash2 size={14} />
              <span>删除</span>
            </button>
            <button
              className="timeline-ghost-button"
              type="button"
              onClick={openExportDialog}
            >
              <Download size={14} />
              <span>导出视频</span>
            </button>
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
                      setExportEnd(event.target.value);
                      setExportError("");
                    }}
                  />
                  <small>帧</small>
                </label>
              </div>
              <div className="timeline-export-summary">
                <span>帧率 {animation.fps} fps</span>
                <span>范围 0-{getExportUnitMax()} 帧</span>
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
            ref={timelineScrollRef}
            style={
              {
                "--timeline-content-width": `${timelineContentWidth}px`,
              } as CSSProperties
            }
          >
            <div className="timeline-left-head timeline-timecode-head">
              <span className="timeline-timecode-value">
                {formatTimecode(animation.currentTime, animation.fps)}
              </span>
            </div>
            <div className="timeline-ruler" onPointerDown={handleTimelineSeekPointerDown}>
              {rulerTicks.map((tick) => (
                <span key={tick.key} style={{ left: tick.left }}>
                  {tick.label}
                </span>
              ))}
            </div>
            <div className="timeline-camera-label" ref={cameraMenuRef}>
              <span>机位</span>
              <button
                className="timeline-camera-add-button"
                type="button"
                title="添加机位切换"
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
            {renderCameraLane()}
            {renderGlobalPlayhead()}
            <div className="timeline-track-list timeline-tree-list">
              {timelineTree.map((node) => renderTreeNode(node))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
