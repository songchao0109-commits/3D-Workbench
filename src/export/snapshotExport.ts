export function createSnapshotName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `snapshot-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}`;
}

export function exportCanvasWithAspectRatio(
  source: HTMLCanvasElement,
  aspectRatio?: number,
) {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return source.toDataURL("image/png");
  }
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > aspectRatio) {
    cropWidth = Math.round(sourceHeight * aspectRatio);
    offsetX = Math.round((sourceWidth - cropWidth) / 2);
  } else if (sourceRatio < aspectRatio) {
    cropHeight = Math.round(sourceWidth / aspectRatio);
    offsetY = Math.round((sourceHeight - cropHeight) / 2);
  }

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return source.toDataURL("image/png");
  }
  context.drawImage(
    source,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );
  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
