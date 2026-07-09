import { defaultProject } from "./defaultProject";
import type { ProjectState } from "./projectTypes";

export type SerializedProject = ProjectState & {
  exportedAt: string;
};

export function sanitizeProjectForSave(project: ProjectState): SerializedProject {
  return {
    ...project,
    cameraPreviewActive: false,
    importError: undefined,
    exportedAt: new Date().toISOString(),
  };
}

export function parseProjectJson(value: string): ProjectState {
  const parsed = JSON.parse(value) as Partial<SerializedProject>;
  if (parsed.schemaVersion !== "0.1") {
    throw new Error("项目文件版本不受支持");
  }
  if (!Array.isArray(parsed.objects) || !Array.isArray(parsed.cameras)) {
    throw new Error("项目文件缺少必要的对象或机位数据");
  }
  return {
    ...defaultProject,
    ...parsed,
    selectedObjectIds: Array.isArray(parsed.selectedObjectIds)
      ? parsed.selectedObjectIds
      : [],
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    cameraPreviewActive: false,
    importError: undefined,
  };
}

export function serializeProject(project: ProjectState) {
  return JSON.stringify(sanitizeProjectForSave(project), null, 2);
}
