export type StudioDownload = {url:string;name:string;label:string};

// Download links are valid only for the draft revision that produced them.
export class StudioDownloads {
  private files:StudioDownload[]=[];
  constructor(private urls:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>=URL) {}
  offer(blob:Blob,name:string,label:string) {
    this.files.filter(file=>file.label===label).forEach(file=>this.urls.revokeObjectURL(file.url));
    this.files=[...this.files.filter(file=>file.label!==label),{url:this.urls.createObjectURL(blob),name,label}];
    return [...this.files];
  }
  invalidate() {
    this.files.forEach(file=>this.urls.revokeObjectURL(file.url));
    this.files=[];
    return [] as StudioDownload[];
  }
}
