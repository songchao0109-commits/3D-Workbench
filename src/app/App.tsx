import { useEffect, useState } from "react";
import { BottomToolbar } from "../components/layout/BottomToolbar";
import { LeftPanel } from "../components/layout/LeftPanel";
import { RightPanel } from "../components/layout/RightPanel";
import { TimelinePanel } from "../components/panels/TimelinePanel";
import { TopBar } from "../components/layout/TopBar";
import { Viewport3D } from "../components/viewport/Viewport3D";
import { useProjectStore } from "../store/projectStore";

export function App() {
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(420);
  const isPlaying = useProjectStore((state) => state.animation.isPlaying);

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
