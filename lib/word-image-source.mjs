const wordImageTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

function imageType(contentType) {
  const mimeType = contentType.toLowerCase().split(";", 1)[0].trim();
  const type = wordImageTypes[mimeType];
  if (!type) throw new Error(`Word 导出暂不支持 ${mimeType || "未知格式"} 图片`);
  return { mimeType, type };
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
  return data;
}

/**
 * Resolve both browser data URLs and cloud `/api/assets/...` URLs to bytes that
 * can be embedded in a DOCX package.
 *
 * @param {string} source
 * @param {typeof fetch} [fetchImage]
 */
export async function resolveWordImageSource(source, fetchImage = fetch) {
  const dataUrl = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i.exec(source);
  if (dataUrl) {
    const { mimeType, type } = imageType(dataUrl[1]);
    const data = decodeBase64(dataUrl[2]);
    if (!data.byteLength) throw new Error("Word 导出遇到了空图片");
    return { data, mimeType, type };
  }

  const response = await fetchImage(source);
  if (!response.ok) throw new Error(`Word 导出无法读取图片（HTTP ${response.status}）`);
  const { mimeType, type } = imageType(response.headers.get("Content-Type") ?? "");
  const data = new Uint8Array(await response.arrayBuffer());
  if (!data.byteLength) throw new Error("Word 导出读取到空图片");
  return { data, mimeType, type };
}
