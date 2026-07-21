import { defaultProject } from "./defaultProject";
import type { ProjectState } from "./projectTypes";

export type SerializedProject = ProjectState & {
  exportedAt: string;
};

type SanitizeProjectOptions = {
  includeSnapshots?: boolean;
};

export function sanitizeProjectForSave(
  project: ProjectState,
  options: SanitizeProjectOptions = {},
): SerializedProject {
  const { includeSnapshots = true } = options;
  return {
    ...project,
    snapshots: includeSnapshots ? project.snapshots : [],
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
    selectedCameraIds: Array.isArray(parsed.selectedCameraIds)
      ? parsed.selectedCameraIds
      : parsed.selectedCameraId
        ? [parsed.selectedCameraId]
        : [],
    groups: Array.isArray(parsed.groups)
      ? parsed.groups.map((group) => ({
          ...group,
          objectIds: Array.isArray(group.objectIds) ? group.objectIds : [],
          cameraIds: Array.isArray(group.cameraIds) ? group.cameraIds : [],
        }))
      : [],
    cameraPreviewActive: false,
    importError: undefined,
  };
}

export function serializeProject(project: ProjectState, options?: SanitizeProjectOptions) {
  return JSON.stringify(sanitizeProjectForSave(project, options), null, 2);
}
