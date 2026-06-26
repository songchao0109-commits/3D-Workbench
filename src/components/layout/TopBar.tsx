import { CircleHelp, LogOut, X } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";

export function TopBar() {
  const projectName = useProjectStore((state) => state.projectName);

  return (
    <header className="top-bar">
      <div className="product-title">{projectName}</div>
      <div className="top-actions">
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
