// ── Tooth Label Map ──

export const _toothLabels = {
  "UR-E":"Upper right 2nd molar","UR-D":"Upper right 1st molar","UR-C":"Upper right canine",
  "UR-B":"Upper right lateral","UR-A":"Upper right central","UL-A":"Upper left central",
  "UL-B":"Upper left lateral","UL-C":"Upper left canine","UL-D":"Upper left 1st molar",
  "UL-E":"Upper left 2nd molar","LR-E":"Lower right 2nd molar","LR-D":"Lower right 1st molar",
  "LR-C":"Lower right canine","LR-B":"Lower right lateral","LR-A":"Lower right central",
  "LL-A":"Lower left central","LL-B":"Lower left lateral","LL-C":"Lower left canine",
  "LL-D":"Lower left 1st molar","LL-E":"Lower left 2nd molar"
};

export const toothLabel = (id) => _toothLabels[id] || id;
