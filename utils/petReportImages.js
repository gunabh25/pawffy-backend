function fileToDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function filesToDataUrls(files = []) {
  return files.map(fileToDataUrl);
}

module.exports = { fileToDataUrl, filesToDataUrls };
