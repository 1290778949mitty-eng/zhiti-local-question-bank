export type QuestionType = "单选题" | "多选题" | "填空题" | "判断题" | "解答题";
export type Difficulty = "基础" | "中等" | "提高";
export type ImageLayout = "right" | "below" | "below-right";
export type DiagramKind = "geometry" | "coordinate" | "function" | "unsupported";
export type DiagramSource = "extracted" | "geogebra-ai" | "svg-ai" | "manual";

export type DiagramQuality = {
  score: number;
  reconstructable: boolean;
  kind: DiagramKind;
  issues: string[];
};

export type GeoGebraStyle = {
  target: string;
  color: string;
  lineStyle: number;
  lineThickness: number;
  pointSize: number;
  labelVisible: boolean;
};

export type GeoGebraPointRole = "base" | "midpoint" | "intersection" | "dependent";

export type GeoGebraReferencePoint = {
  label: string;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  markerVisible: boolean;
  role: GeoGebraPointRole;
};

export type GeoGebraPlan = {
  diagramType: Exclude<DiagramKind, "unsupported">;
  confidence: number;
  commands: string[];
  styles: GeoGebraStyle[];
  view: { xMin: number; xMax: number; yMin: number; yMax: number };
  sourceAspectRatio: number;
  referencePoints: GeoGebraReferencePoint[];
  expectedLabels: string[];
  constraints: string[];
  warnings: string[];
};

export type VectorDiagramPoint = { x: number; y: number };

export type VectorDiagramStroke = {
  id: string;
  points: VectorDiagramPoint[];
  closed: boolean;
  width: number;
  color: string;
  dash: number[];
};

export type VectorDiagramEllipse = {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  width: number;
  color: string;
  dash: number[];
};

export type VectorDiagramLabel = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  italic: boolean;
  bold: boolean;
  anchor: "start" | "middle" | "end";
};

export type VectorDiagramMarker = {
  x: number;
  y: number;
  radius: number;
  color: string;
};

export type VectorDiagramPlan = {
  diagramType: Exclude<DiagramKind, "unsupported">;
  confidence: number;
  sourceAspectRatio: number;
  strokes: VectorDiagramStroke[];
  ellipses: VectorDiagramEllipse[];
  labels: VectorDiagramLabel[];
  markers: VectorDiagramMarker[];
  expectedLabels: string[];
  constraints: string[];
  geogebraCommands: string[];
  warnings: string[];
};

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
};

export type Question = {
  id: string;
  categoryId: string;
  type: QuestionType;
  difficulty: Difficulty;
  stem: string;
  stemParagraphs?: string[];
  stemDocxXml?: string[];
  stemDocxAssets?: Record<string, string>;
  options: string[];
  answer: string;
  analysis: string;
  analysisDocxXml?: string[];
  analysisDocxAssets?: Record<string, string>;
  source: string;
  tags?: string[];
  contentImages?: string[];
  imageLayout?: ImageLayout;
  optimizedAt?: number;
  originalImage?: string;
  diagramImage?: string;
  diagramOriginalImage?: string;
  diagramSource?: DiagramSource;
  diagramQuality?: DiagramQuality;
  geogebraBase64?: string;
  geogebraPlan?: GeoGebraPlan;
  vectorDiagramSvg?: string;
  vectorDiagramPlan?: VectorDiagramPlan;
  diagramReconstructionConfidence?: number;
  diagramVisualFitScore?: number;
  diagramReconstructionWarnings?: string[];
  diagramReconstructedAt?: number;
  diagramBox?: { x: number; y: number; width: number; height: number };
  recognitionConfidence?: number;
  recognitionWarnings?: string[];
  importFileName?: string;
  sourcePage?: number;
  createdAt: number;
  updatedAt: number;
};

export type LibraryData = { categories: Category[]; questions: Question[] };
