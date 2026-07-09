import { useEffect, useRef, useState } from "react";
import { emitAppFeedback } from "./appFeedback";
import { BottomToolbar } from "../components/layout/BottomToolbar";
import { LeftPanel } from "../components/layout/LeftPanel";
import { RightPanel } from "../components/layout/RightPanel";
import { TimelinePanel } from "../components/panels/TimelinePanel";
import { TopBar } from "../components/layout/TopBar";
import { Viewport3D } from "../components/viewport/Viewport3D";
import { parseProjectJson, serializeProject } from "../domain/projectSerialization";
import { useProjectStore } from "../store/projectStore";

const autosaveKey = "3d-workbench-autosave-v1";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function App() {
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(420);
  const isPlaying = useProjectStore((state) => state.animation.isPlaying);
  const autosaveRestoreAttemptedRef = useRef(false);

  useEffect(() => {
    if (autosaveRestoreAttemptedRef.current) {
      return;
    }
    autosaveRestoreAttemptedRef.current = true;
    const saved = window.localStorage.getItem(autosaveKey);
    if (saved && window.confirm("检测到自动保存的项目，是否恢复？")) {
      try {
        useProjectStore.getState().replaceProject(parseProjectJson(saved));
        emitAppFeedback("已恢复自动保存项目");
      } catch {
        window.localStorage.removeItem(autosaveKey);
        emitAppFeedback("自动保存恢复失败，已忽略损坏记录");
      }
    }
  }, []);

  useEffect(() => {
    let timeoutId = 0;
    const unsubscribe = useProjectStore.subscribe((state) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        try {
          window.localStorage.setItem(
            autosaveKey,
            serializeProject(state, { includeSnapshots: false }),
          );
        } catch {
          emitAppFeedback("自动保存空间不足，本次未保存快照数据");
        }
      }, 600);
    });
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const store = useProjectStore.getState();
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z" && event.shiftKey) {
        event.preventDefault();
        store.redo();
        return;
      }
      if (modifier && key === "z") {
        event.preventDefault();
        store.undo();
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        store.redo();
        return;
      }
      if (modifier && key === "c") {
        event.preventDefault();
        store.copySelection();
        return;
      }
      if (modifier && key === "v") {
        event.preventDefault();
        store.pasteClipboard();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        store.removeSelection();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    let intervalId = 0;
    let lastTime = performance.now();

    intervalId = window.setInterval(() => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      useProjectStore.getState().stepAnimation(deltaSeconds);
    }, 1000 / 30);

    return () => window.clearInterval(intervalId);
  }, [isPlaying]);

  return (
    <main className="workbench-shell">
      <TopBar />
      <section className="workbench-main">
        <LeftPanel />
        <div className={`viewport-wrap ${timelineExpanded ? "timeline-expanded" : ""}`}>
          <Viewport3D />
          <TimelinePanel
            expanded={timelineExpanded}
            height={timelineHeight}
            onHeightChange={setTimelineHeight}
            onToggle={() => setTimelineExpanded((current) => !current)}
          />
          <BottomToolbar lifted={timelineExpanded} liftedHeight={timelineHeight} />
        </div>
        <RightPanel />
      </section>
    </main>
  );
}
