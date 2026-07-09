import { CircleHelp, FolderOpen, LogOut, RotateCcw, RotateCw, Save, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { subscribeAppFeedback } from "../../app/appFeedback";
import { parseProjectJson } from "../../domain/projectSerialization";
import { downloadProjectFile } from "../../export/projectExport";
import { useProjectStore } from "../../store/projectStore";

export function TopBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState("");
  const projectName = useProjectStore((state) => state.projectName);
  const canUndo = useProjectStore((state) => state.history.past.length > 0);
  const canRedo = useProjectStore((state) => state.history.future.length > 0);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const replaceProject = useProjectStore((state) => state.replaceProject);

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(""), 1800);
  };

  useEffect(() => subscribeAppFeedback(showFeedback), []);

  const handleSave = () => {
    downloadProjectFile(useProjectStore.getState());
    showFeedback("项目已保存");
  };

  const handleOpen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      replaceProject(parseProjectJson(await file.text()));
      showFeedback("项目已打开");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "项目打开失败");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <header className="top-bar">
      <div className="product-title">{projectName}</div>
      <div className="top-actions">
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept=".json,.3dwb.json,application/json"
          onChange={handleOpen}
        />
        {feedback ? <span className="top-feedback">{feedback}</span> : null}
        <button className="ghost-icon" aria-label="撤销" disabled={!canUndo} onClick={undo}>
          <RotateCcw size={16} />
        </button>
        <button className="ghost-icon" aria-label="重做" disabled={!canRedo} onClick={redo}>
          <RotateCw size={16} />
        </button>
        <button className="ghost-icon" aria-label="保存项目" onClick={handleSave}>
          <Save size={16} />
        </button>
        <button
          className="ghost-icon"
          aria-label="打开项目"
          onClick={() => fileInputRef.current?.click()}
        >
          <FolderOpen size={16} />
        </button>
        <button className="ghost-icon" aria-label="帮助">
          <CircleHelp size={16} />
        </button>
        <div className="top-divider" />
        <button className="exit-button" type="button">
          <X size={15} />
          <span>退出</span>
          <LogOut size={0} aria-hidden />
        </button>
      </div>
    </header>
  );
}
