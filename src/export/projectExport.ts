import type { ProjectState } from "../domain/projectTypes";
import { serializeProject } from "../domain/projectSerialization";
import { downloadBlobFile } from "./animationExport";

function safeFilenamePart(value: string) {
  return value.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "-").replace(/-+/g, "-") || "project";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function createProjectExportName(projectName: string, date = new Date()) {
  return `${safeFilenamePart(projectName)}-${date.getFullYear()}${pad(
    date.getMonth() + 1,
  )}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}.3dwb.json`;
}

export function downloadProjectFile(project: ProjectState) {
  const blob = new Blob([serializeProject(project)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlobFile(blob, createProjectExportName(project.projectName));
}
