import { useEffect, useState } from "react";
import { CameraInspector } from "../panels/CameraInspector";
import { ObjectInspector } from "../panels/ObjectInspector";
import { SnapshotPanel } from "../panels/SnapshotPanel";
import { WorldInspector } from "../panels/WorldInspector";
import { useProjectStore } from "../../store/projectStore";

type RightTab = "inspector" | "snapshots";

export function RightPanel() {
  const activeObjectId = useProjectStore((state) => state.activeObjectId);
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const objects = useProjectStore((state) => state.objects);
  const cameras = useProjectStore((state) => state.cameras);
  const [activeTab, setActiveTab] = useState<RightTab>("inspector");
  const activeObject = activeObjectId
    ? objects.find((object) => object.id === activeObjectId)
    : undefined;
  const activeCamera = selectedCameraId
    ? cameras.find((camera) => camera.id === selectedCameraId)
    : undefined;

  useEffect(() => {
    if (activeObjectId || selectedCameraId) {
      setActiveTab("inspector");
    }
  }, [activeObjectId, selectedCameraId]);

  return (
    <aside className="right-panel">
      <div className="panel-tabs">
        <button
          className={activeTab === "inspector" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("inspector")}
        >
          属性
        </button>
        <button
          className={activeTab === "snapshots" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("snapshots")}
        >
          快照
        </button>
      </div>
      <div className="right-panel-content">
        {activeTab === "snapshots" ? (
          <SnapshotPanel />
        ) : activeObject ? (
          <ObjectInspector object={activeObject} />
        ) : activeCamera ? (
          <CameraInspector />
        ) : (
          <WorldInspector />
        )}
      </div>
    </aside>
  );
}
