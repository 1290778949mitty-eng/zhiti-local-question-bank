export function deduplicatePublicationAssets(items) {
  const assetsByHash = new Map();
  for (const item of items) {
    if (!assetsByHash.has(item.hash)) assetsByHash.set(item.hash, item);
  }
  return [...assetsByHash.values()];
}
