import { useEffect, useState } from "react";
import { CameraInspector } from "../panels/CameraInspector";
import { ObjectInspector } from "../panels/ObjectInspector";
import { GroupInspector, SelectionInspector } from "../panels/SelectionInspector";
import { SnapshotPanel } from "../panels/SnapshotPanel";
import { WorldInspector } from "../panels/WorldInspector";
import { useProjectStore } from "../../store/projectStore";

type RightTab = "inspector" | "snapshots";

export function RightPanel() {
  const activeObjectId = useProjectStore((state) => state.activeObjectId);
  const activeGroupId = useProjectStore((state) => state.activeGroupId);
  const selectedObjectIds = useProjectStore((state) => state.selectedObjectIds);
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const objects = useProjectStore((state) => state.objects);
  const groups = useProjectStore((state) => state.groups);
  const cameras = useProjectStore((state) => state.cameras);
  const [activeTab, setActiveTab] = useState<RightTab>("inspector");
  const activeObject = activeObjectId
    ? objects.find((object) => object.id === activeObjectId)
    : undefined;
  const activeGroup = activeGroupId
    ? groups.find((group) => group.id === activeGroupId)
    : undefined;
  const activeCamera = selectedCameraId
    ? cameras.find((camera) => camera.id === selectedCameraId)
    : undefined;

  useEffect(() => {
    if (activeObjectId || activeGroupId || selectedCameraId) {
      setActiveTab("inspector");
    }
  }, [activeGroupId, activeObjectId, selectedCameraId]);

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
        ) : activeGroup ? (
          <GroupInspector group={activeGroup} />
        ) : selectedObjectIds.length > 1 ? (
          <SelectionInspector />
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
