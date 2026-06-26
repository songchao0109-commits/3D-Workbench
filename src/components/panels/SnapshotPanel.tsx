import { Download, ImagePlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useProjectStore } from "../../store/projectStore";

type SnapshotFilter = "all" | "current";

function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function SnapshotPanel() {
  const snapshots = useProjectStore((state) => state.snapshots);
  const activeCameraId = useProjectStore((state) => state.activeCameraId);
  const cameras = useProjectStore((state) => state.cameras);
  const [filterMode, setFilterMode] = useState<SnapshotFilter>("all");

  const filteredSnapshots = useMemo(
    () =>
      filterMode === "current" && activeCameraId
        ? snapshots.filter((snapshot) => snapshot.cameraId === activeCameraId)
        : snapshots,
    [activeCameraId, filterMode, snapshots],
  );

  const handleExport = () => {
    window.dispatchEvent(new CustomEvent("snapshot-export-request"));
  };

  return (
    <section className="snapshot-panel">
      <div className="panel-heading">
        <div>
          <h2>快照管理</h2>
          <p>独立浏览快照，不影响属性编辑</p>
        </div>
        <button
          className="primary-small"
          type="button"
          disabled={!activeCameraId}
          onClick={handleExport}
        >
          <Download size={14} />
          拍摄快照
        </button>
      </div>

      <div className="segmented-control two-columns snapshot-filter-tabs">
        <button
          className={filterMode === "all" ? "is-active" : ""}
          type="button"
          onClick={() => setFilterMode("all")}
        >
          <span>全部</span>
        </button>
        <button
          className={filterMode === "current" ? "is-active" : ""}
          disabled={!activeCameraId}
          type="button"
          onClick={() => setFilterMode("current")}
        >
          <span>当前机位</span>
        </button>
      </div>

      {snapshots.length === 0 ? (
        <div className="empty-snapshot">
          <ImagePlus size={18} />
          <span>当前空间下还没有快照</span>
          <span>点击“拍摄快照”保存快照</span>
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <div className="empty-snapshot">
          <ImagePlus size={18} />
          <span>当前机位下还没有快照</span>
          <span>切换筛选或拍摄新快照</span>
        </div>
      ) : (
        <div className="snapshot-list">
          {filteredSnapshots.map((snapshot) => {
            const cameraName = snapshot.cameraId
              ? cameras.find((camera) => camera.id === snapshot.cameraId)?.name ??
                "未知机位"
              : "编辑视角";

            return (
              <a
                className="snapshot-item"
                download={`${snapshot.name}.png`}
                href={snapshot.imageDataUrl}
                key={snapshot.id}
                title="下载快照"
              >
                <img src={snapshot.imageDataUrl} alt={snapshot.name} />
                <div className="snapshot-item-body">
                  <div className="snapshot-item-title">{snapshot.name}</div>
                  <div className="snapshot-item-meta">
                    <span className="ghost-tag snapshot-tag">{cameraName}</span>
                    <span>{formatSnapshotTime(snapshot.createdAt)}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
