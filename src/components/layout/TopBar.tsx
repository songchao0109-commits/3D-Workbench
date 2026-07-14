import { CircleHelp, LogOut, RotateCcw, RotateCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { subscribeAppFeedback } from "../../app/appFeedback";
import { useProjectStore } from "../../store/projectStore";

export function TopBar() {
  const [feedback, setFeedback] = useState("");
  const projectName = useProjectStore((state) => state.projectName);
  const canUndo = useProjectStore((state) => state.history.past.length > 0);
  const canRedo = useProjectStore((state) => state.history.future.length > 0);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(""), 1800);
  };

  useEffect(() => subscribeAppFeedback(showFeedback), []);

  return (
    <header className="top-bar">
      <div className="product-title">{projectName}</div>
      <div className="top-actions">
        {feedback ? <span className="top-feedback">{feedback}</span> : null}
        <button className="ghost-icon" aria-label="撤销" disabled={!canUndo} onClick={undo}>
          <RotateCcw size={16} />
        </button>
        <button className="ghost-icon" aria-label="重做" disabled={!canRedo} onClick={redo}>
          <RotateCw size={16} />
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
