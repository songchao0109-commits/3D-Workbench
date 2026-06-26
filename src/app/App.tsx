import { BottomToolbar } from "../components/layout/BottomToolbar";
import { LeftPanel } from "../components/layout/LeftPanel";
import { RightPanel } from "../components/layout/RightPanel";
import { TopBar } from "../components/layout/TopBar";
import { Viewport3D } from "../components/viewport/Viewport3D";

export function App() {
  return (
    <main className="workbench-shell">
      <TopBar />
      <section className="workbench-main">
        <LeftPanel />
        <div className="viewport-wrap">
          <Viewport3D />
          <BottomToolbar />
        </div>
        <RightPanel />
      </section>
    </main>
  );
}
