export type PublicationAssetManifest = {
  localId: string;
  hash: string;
  contentType: string;
  byteSize: number;
};

export function deduplicatePublicationAssets(items: PublicationAssetManifest[]): PublicationAssetManifest[];
