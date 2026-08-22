"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { MathText } from "./components/MathText";
import { exportQuestionsToWord } from "../lib/export-word";
import { docxStemDisplayText, renderImportFile } from "../lib/file-import";
import { clipboardImage, compressDataUrl, cropDataUrl, cropExactDataUrl, fileToDataUrl, imageAspectRatio, type NormalizedBox } from "../lib/image-tools";
import { shouldAutoVectorizeDiagram } from "../lib/vector-diagram-reconstruction.mjs";
import { renderVectorDiagramPlan, VectorDiagramFitError } from "../lib/vector-diagram-renderer";
import { isGeometryQuestion, questionImages, resolveQuestionImageLayout } from "../lib/question-layout";
import { cleanRecognizedAnalysis, cleanRecognizedAnswer } from "../lib/recognition-cleanup.mjs";
import { authorizeDownload, createCloudCategory, createCloudQuestion, deleteCloudCategory, deleteCloudQuestion, fetchLibrary, fetchMe, importCloudLibrary, login, logout, register, updateCloudQuestion } from "../lib/api-client";
import type { AuthUser, Category, DiagramQuality, Difficulty, ImageLayout, LibraryData, Question, QuestionType, VectorDiagramPlan } from "../lib/types";

const questionTypes: QuestionType[] = ["单选题", "多选题", "填空题", "判断题", "解答题"];
const difficulties: Difficulty[] = ["基础", "中等", "提高"];
const emptyDraft = (): Question => ({ id: "", categoryId: "", type: "单选题", difficulty: "基础", stem: "", options: ["", "", "", ""], answer: "", analysis: "", source: "", createdAt: 0, updatedAt: 0 });

type RecognitionResult = {
  type: QuestionType; difficulty: Difficulty; stem: string; options: string[]; answer: string; analysis: string; source: string; tags: string[];
  suggested_category_id: string | null; diagram_bbox: NormalizedBox | null; confidence: number; warnings: string[];
  diagram_quality: DiagramQuality | null;
};

type OptimizationResult = {
  stem: string; options: string[]; answer: string; analysis: string; source: string; tags: string[];
  image_layout: ImageLayout; changes: string[];
};
type BatchQuestionResult = RecognitionResult & { question_number: string };
type BatchAnswerResult = { question_number: string; answer: string; analysis: string };
type BatchPageResult = { questions?: BatchQuestionResult[]; answers?: BatchAnswerResult[] };
type FileImportDraft = Question & { importId: string; selected: boolean; documentNumber: string };
type FileImportStep = "choose" | "rendering" | "recognizing" | "review";

const FILE_IMPORT_CONCURRENCY = 2;
const FILE_IMPORT_MAX_ATTEMPTS = 2;
const RETRYABLE_IMPORT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function uid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function explicitChoiceFromAnalysis(value: string) {
  return value.match(/(?:故选|答案(?:为)?)[：:]?\s*([A-F])(?=[。．，、\s]|$)/i)?.[1].toUpperCase() ?? "";
}

function isUsableImportedAnswer(value: string) {
  const answer = cleanRecognizedAnswer(value);
  return Boolean(answer) && !/(?:待|后续|补全|不完整|未知|未识别|无法确定|请校对)/.test(answer);
}

function explicitChoicesFromSourceText(value: string) {
  const answers = new Map<string, string>();
  let currentNumber = "";
  for (const line of value.split(/\n+/)) {
    const number = line.match(/^\s*(\d{1,3})[.．、]/)?.[1];
    if (number) currentNumber = number;
    const choice = explicitChoiceFromAnalysis(line);
    if (currentNumber && choice) answers.set(currentNumber, choice);
  }
  return answers;
}

function normalizeAnswerFields(rawAnswer: string, rawAnalysis: string) {
  let answer = cleanRecognizedAnswer(rawAnswer); let analysis = cleanRecognizedAnalysis(rawAnalysis);
  const combined = answer.match(/^([^。\n]{1,24})。\s*(.+)$/s);
  if (combined && !analysis) { answer = combined[1].trim(); analysis = combined[2].trim(); }
  if (!isUsableImportedAnswer(answer)) answer = explicitChoiceFromAnalysis(analysis);
  return { answer, analysis };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex; nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}
export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"全部" | QuestionType>("全部");
  const [showSelected, setShowSelected] = useState(false);
  const [expandedAnswers, setExpandedAnswers] = useState<string[]>([]);
  const [questionDraft, setQuestionDraft] = useState<Question | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<"new" | "manage" | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryParent, setCategoryParent] = useState<string>("");
  const [exportDialog, setExportDialog] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [paperTitle, setPaperTitle] = useState("七年级数学专项练习");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [notice, setNotice] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authDialog, setAuthDialog] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authInvite, setAuthInvite] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isReconstructingDiagram, setIsReconstructingDiagram] = useState(false);
  const [enableVectorReconstruction, setEnableVectorReconstruction] = useState(true);
  const [recognitionError, setRecognitionError] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "screenshot">("manual");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState("");
  const [optimizationPreview, setOptimizationPreview] = useState<OptimizationResult | null>(null);
  const [cropDialog, setCropDialog] = useState(false);
  const [cropSelection, setCropSelection] = useState<NormalizedBox | null>(null);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [fileImportOpen, setFileImportOpen] = useState(false);
  const [fileImportStep, setFileImportStep] = useState<FileImportStep>("choose");
  const [fileImportName, setFileImportName] = useState("");
  const [fileImportCategory, setFileImportCategory] = useState("");
  const [fileImportProgress, setFileImportProgress] = useState({ current: 0, total: 0, label: "" });
  const [fileImportDrafts, setFileImportDrafts] = useState<FileImportDraft[]>([]);
  const [fileImportErrors, setFileImportErrors] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const questionImageRef = useRef<HTMLInputElement>(null);
  const manualImagesRef = useRef<HTMLInputElement>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);
  const cropStageRef = useRef<HTMLDivElement>(null);
  const fileImportAbortRef = useRef<AbortController | null>(null);

  async function refreshLibrary(preserveCategory = true) {
    const data = await fetchLibrary();
    setCategories(data.categories.sort((a, b) => a.createdAt - b.createdAt));
    setQuestions(data.questions.sort((a, b) => b.createdAt - a.createdAt));
    setActiveCategory((current) => preserveCategory && current && data.categories.some((item) => item.id === current) ? current : data.categories.find((item) => item.parentId === null)?.id ?? null);
  }

  useEffect(() => {
    Promise.all([fetchMe(), fetchLibrary()]).then(([auth, data]) => {
      setAuthUser(auth.user);
      setCategories(data.categories.sort((a, b) => a.createdAt - b.createdAt));
      setQuestions(data.questions.sort((a, b) => b.createdAt - a.createdAt));
      setActiveCategory(data.categories.find((item) => item.parentId === null)?.id ?? null);
    }).catch(() => setNotice("云端题库读取失败，请刷新页面重试")).finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 2600); return () => clearTimeout(timer); }, [notice]);

  const childrenOf = (id: string | null) => categories.filter((item) => item.parentId === id);
  const descendantsOf = (id: string): string[] => {
    const direct = childrenOf(id);
    return [id, ...direct.flatMap((item) => descendantsOf(item.id))];
  };
  const categoryById = (id: string | null) => categories.find((item) => item.id === id);
  const pathOf = (id: string) => {
    const names: string[] = []; let current = categoryById(id); let guard = 0;
    while (current && guard < 20) { names.unshift(current.name); current = categoryById(current.parentId); guard += 1; }
    return names.join(" / ");
  };
  const countFor = (id: string) => { const ids = descendantsOf(id); return questions.filter((q) => ids.includes(q.categoryId)).length; };

  const filteredQuestions = useMemo(() => {
    let result = questions;
    if (activeCategory) { const allowed = descendantsOf(activeCategory); result = result.filter((item) => allowed.includes(item.categoryId)); }
    if (showSelected) result = result.filter((item) => selectedIds.includes(item.id));
    if (typeFilter !== "全部") result = result.filter((item) => item.type === typeFilter);
    const keyword = query.trim().toLowerCase();
    if (keyword) result = result.filter((item) => `${item.stem} ${item.answer} ${item.analysis} ${item.source} ${(item.tags ?? []).join(" ")} ${pathOf(item.categoryId)}`.toLowerCase().includes(keyword));
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, categories, activeCategory, showSelected, typeFilter, query, selectedIds]);

  const selectedQuestions = selectedIds.map((id) => questions.find((item) => item.id === id)).filter(Boolean) as Question[];
  const allFilteredSelected = filteredQuestions.length > 0 && filteredQuestions.every((item) => selectedIds.includes(item.id));
  const activeName = showSelected ? "我的组卷" : activeCategory ? categoryById(activeCategory)?.name ?? "全部试题" : "全部试题";

  const requireLogin = () => { if (authUser) return true; setAuthMode("login"); setAuthDialog(true); setAuthError("请先登录后再使用这项功能"); return false; };
  const toggleSelected = (id: string) => { if (!requireLogin()) return; setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); };
  const toggleAllFiltered = () => {
    if (!requireLogin()) return;
    const visibleIds = filteredQuestions.map((item) => item.id);
    setSelectedIds((current) => allFilteredSelected ? current.filter((id) => !visibleIds.includes(id)) : [...current, ...visibleIds.filter((id) => !current.includes(id))]);
  };
  const openNewQuestion = () => { if (!requireLogin()) return; setRecognitionError(""); setOptimizationError(""); setOptimizationPreview(null); setEntryMode("manual"); setQuestionDraft({ ...emptyDraft(), categoryId: activeCategory ?? categories[0]?.id ?? "", imageLayout: "right", contentImages: [] }); };
  const openEditQuestion = (question: Question) => { if (!requireLogin() || !question.canEdit) { setNotice("你只能修改自己录入的题目"); return; } setRecognitionError(""); setOptimizationError(""); setOptimizationPreview(null); setEntryMode(question.originalImage ? "screenshot" : "manual"); setQuestionDraft({ ...question, options: [...question.options], contentImages: [...(question.contentImages ?? [])] }); };

  async function submitAuth() {
    setAuthSubmitting(true); setAuthError("");
    try {
      const result = authMode === "register" ? await register(authEmail, authPassword, authInvite) : await login(authEmail, authPassword);
      setAuthUser(result.user); setAuthDialog(false); setAuthPassword(""); setAuthInvite(""); await refreshLibrary();
      setNotice(authMode === "register" ? "注册成功，已登录云端题库" : "登录成功");
    } catch (error) { setAuthError(error instanceof Error ? error.message : "操作失败，请重试"); }
    finally { setAuthSubmitting(false); }
  }

  async function signOut() {
    try { await logout(); setAuthUser(null); setSelectedIds([]); setShowSelected(false); await refreshLibrary(); setNotice("已退出登录，当前为访客浏览"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "退出失败"); }
  }

  function openFileImport() {
    if (!requireLogin()) return;
    setQuestionDraft(null); setFileImportOpen(true); setFileImportStep("choose"); setFileImportName(""); setFileImportDrafts([]); setFileImportErrors([]);
    setFileImportCategory(activeCategory ?? categories[0]?.id ?? ""); setFileImportProgress({ current: 0, total: 0, label: "" });
  }

  function closeFileImport() { fileImportAbortRef.current?.abort(); fileImportAbortRef.current = null; setFileImportOpen(false); }

  async function handleImportDocument(file: File) {
    if (file.size > 80 * 1024 * 1024) { setFileImportErrors(["文件超过 80MB，请拆分后再导入"]); return; }
    const controller = new AbortController(); fileImportAbortRef.current = controller; setFileImportName(file.name); setFileImportDrafts([]); setFileImportErrors([]); setFileImportStep("rendering");
    try {
      const pages = await renderImportFile(file, (current, total) => setFileImportProgress({ current, total, label: `正在读取第 ${current}/${total} 页` }));
      if (controller.signal.aborted) return;
      const structuredQuestions = pages.find((page) => page.sourceQuestions?.length)?.sourceQuestions;
      if (structuredQuestions?.length) {
        setFileImportStep("recognizing"); setFileImportProgress({ current: structuredQuestions.length, total: structuredQuestions.length, label: `已按 Word 原始结构整理 ${structuredQuestions.length} 道题` });
        const sourcePage = pages.find((page) => page.sourceQuestions?.length) ?? pages[0]; const timestamp = Date.now();
        const imported = structuredQuestions.map<FileImportDraft>((item, index) => ({
          id: uid("q"), importId: uid("import"), selected: true, documentNumber: item.questionNumber,
          categoryId: fileImportCategory, type: item.type, difficulty: item.type === "解答题" ? "提高" : "中等",
          stem: item.stem, stemParagraphs: item.stemParagraphs, stemDocxXml: item.stemDocxXml, stemDocxAssets: item.stemDocxAssets, options: sourcePage.sourceOptions?.[item.questionNumber] ?? [],
          answer: sourcePage.sourceAnswers?.[item.questionNumber] ?? (item.type === "解答题" ? "见解析" : ""),
          analysis: sourcePage.sourceAnalyses?.[item.questionNumber] ?? "", analysisDocxXml: sourcePage.sourceAnalysisXml?.[item.questionNumber], analysisDocxAssets: sourcePage.sourceAnalysisAssets?.[item.questionNumber],
          source: "", tags: [], contentImages: sourcePage.sourceQuestionImages?.[item.questionNumber] ?? [], recognitionConfidence: 1,
          recognitionWarnings: ["题干、配图和解析均从 Word 原始结构读取"], importFileName: file.name, sourcePage: item.sourcePage,
          createdAt: timestamp - index, updatedAt: timestamp - index,
        }));
        setFileImportDrafts(imported); setFileImportStep("review"); return;
      }
      setFileImportStep("recognizing"); setFileImportProgress({ current: 0, total: pages.length, label: `准备并发识别 ${pages.length} 页` });
      let completed = 0;
      const categoryPayload = categories.map((item) => ({ id: item.id, path: pathOf(item.id) }));
      const recognizedPages = await mapWithConcurrency(pages, FILE_IMPORT_CONCURRENCY, async (page) => {
        let lastError = "本页识别失败";
        try {
          if (page.documentSection === "answers" && page.sourceAnalyses) return { page, result: { questions: [], answers: [] } as BatchPageResult };
          for (let attempt = 1; attempt <= FILE_IMPORT_MAX_ATTEMPTS; attempt += 1) {
            if (controller.signal.aborted) throw new DOMException("文件录入已取消", "AbortError");
            try {
              const response = await fetch("/api/recognize-batch", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ image: page.image, textHint: page.textHint, pageNumber: page.pageNumber, fileName: file.name, categories: categoryPayload }) });
              const payload = await response.json() as { result?: BatchPageResult; error?: string; code?: string };
              if (response.ok && payload.result) return { page, result: payload.result };
              lastError = payload.code === "MISSING_API_KEY" ? "尚未配置智能识别 API" : payload.error || `识别请求失败（${response.status}）`;
              if (!RETRYABLE_IMPORT_STATUSES.has(response.status) || attempt === FILE_IMPORT_MAX_ATTEMPTS) break;
            } catch (error) {
              if (controller.signal.aborted) throw error;
              lastError = error instanceof Error ? error.message : "识别失败";
              if (attempt === FILE_IMPORT_MAX_ATTEMPTS) break;
            }
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
          }
          return { page, error: lastError };
        } finally {
          completed += 1;
          setFileImportProgress({ current: completed, total: pages.length, label: `已识别 ${completed}/${pages.length} 页（同时处理 ${FILE_IMPORT_CONCURRENCY} 页）` });
        }
      });
      if (controller.signal.aborted) return;
      const imported: FileImportDraft[] = []; const pageErrors: string[] = []; const seen = new Set<string>(); const seenNumbers = new Set<string>(); const importStartedAt = Date.now();
      for (const recognized of recognizedPages.sort((a, b) => a.page.pageNumber - b.page.pageNumber)) {
        if ("error" in recognized) { pageErrors.push(`第 ${recognized.page.pageNumber} 页：${recognized.error}`); continue; }
        if (recognized.page.documentSection === "answers") continue;
        for (const item of recognized.result.questions ?? []) {
          const stemKey = item.stem.replace(/\s+/g, "").replace(/[，。；：,.!?！？]/g, "").slice(0, 100); const numberKey = `${item.type}:${item.question_number.trim()}`;
          if (!stemKey || seen.has(stemKey) || (item.question_number.trim() && seenNumbers.has(numberKey))) continue; seen.add(stemKey); if (item.question_number.trim()) seenNumbers.add(numberKey);
          let diagramImage: string | undefined;
          if (item.diagram_bbox && item.diagram_bbox.width > 20 && item.diagram_bbox.height > 20) { try { diagramImage = await cropDataUrl(recognized.page.image, item.diagram_bbox); } catch { item.warnings = [...item.warnings, "配图自动裁剪失败，请重新截图补充"]; } }
          let reconstruction: Partial<Question> = { diagramImage, diagramSource: diagramImage ? "extracted" : undefined, diagramQuality: item.diagram_quality ?? undefined };
          if (diagramImage && shouldAutoVectorizeDiagram(item.diagram_quality)) {
            setFileImportProgress((current) => ({ ...current, label: `正在为第 ${item.question_number || imported.length + 1} 题高清重绘配图` }));
            try {
              const rebuilt = await requestVectorDiagramReconstruction(item.stem, diagramImage, item.diagram_quality);
              if (rebuilt.skipped) item.warnings = [...item.warnings, rebuilt.reason];
              else reconstruction = { diagramOriginalImage: diagramImage, diagramImage: rebuilt.image, diagramSource: "svg-ai", diagramQuality: item.diagram_quality ?? undefined, vectorDiagramSvg: rebuilt.svg, vectorDiagramPlan: rebuilt.plan, diagramReconstructionConfidence: rebuilt.plan.confidence, diagramVisualFitScore: rebuilt.visualFitScore, diagramReconstructionWarnings: rebuilt.plan.warnings, diagramReconstructedAt: Date.now() };
            } catch (error) { item.warnings = [...item.warnings, `高清矢量重绘未完成：${error instanceof Error ? error.message : "未知错误"}`]; }
          }
          const timestamp = importStartedAt - imported.length; const categoryId = item.suggested_category_id && categories.some((entry) => entry.id === item.suggested_category_id) ? item.suggested_category_id : fileImportCategory;
          const normalized = normalizeAnswerFields(item.answer, item.analysis);
          imported.push({ id: uid("q"), importId: uid("import"), selected: true, documentNumber: item.question_number, categoryId, type: item.type, difficulty: item.difficulty, stem: item.stem, options: item.options, answer: normalized.answer, analysis: normalized.analysis, source: item.source, tags: item.tags, diagramBox: item.diagram_bbox ?? undefined, recognitionConfidence: item.confidence, recognitionWarnings: item.warnings, importFileName: file.name, sourcePage: recognized.page.pageNumber, createdAt: timestamp, updatedAt: timestamp, ...reconstruction });
        }
      }
      for (const recognized of recognizedPages) {
        if ("error" in recognized) continue;
        for (const answerItem of recognized.result.answers ?? []) {
          const target = imported.find((entry) => entry.documentNumber === answerItem.question_number);
          if (!target) continue;
          const normalized = normalizeAnswerFields(answerItem.answer, answerItem.analysis);
          if (isUsableImportedAnswer(normalized.answer)) target.answer = normalized.answer;
          if (normalized.analysis.length > target.analysis.length) target.analysis = normalized.analysis;
          if (!isUsableImportedAnswer(target.answer)) target.answer = explicitChoiceFromAnalysis(target.analysis);
        }
      }
      for (const recognized of recognizedPages) {
        if ("error" in recognized || !recognized.page.textHint) continue;
        for (const [questionNumber, answer] of explicitChoicesFromSourceText(recognized.page.textHint)) {
          const target = imported.find((entry) => entry.documentNumber === questionNumber);
          if (target) target.answer = answer;
        }
      }
      const sourceAnswers = recognizedPages.find((recognized) => !("error" in recognized) && recognized.page.sourceAnswers)?.page.sourceAnswers;
      for (const [questionNumber, answer] of Object.entries(sourceAnswers ?? {})) {
        const target = imported.find((entry) => entry.documentNumber === questionNumber);
        if (target) target.answer = answer;
      }
      const sourceAnalyses = recognizedPages.find((recognized) => !("error" in recognized) && recognized.page.sourceAnalyses)?.page.sourceAnalyses;
      for (const [questionNumber, analysis] of Object.entries(sourceAnalyses ?? {})) {
        const target = imported.find((entry) => entry.documentNumber === questionNumber);
        if (target && analysis.trim()) target.analysis = analysis.trim();
      }
      const sourceAnalysisXml = recognizedPages.find((recognized) => !("error" in recognized) && recognized.page.sourceAnalysisXml)?.page.sourceAnalysisXml;
      for (const [questionNumber, analysisDocxXml] of Object.entries(sourceAnalysisXml ?? {})) {
        const target = imported.find((entry) => entry.documentNumber === questionNumber);
        if (target && analysisDocxXml.length) target.analysisDocxXml = analysisDocxXml;
      }
      const sourceAnalysisAssets = recognizedPages.find((recognized) => !("error" in recognized) && recognized.page.sourceAnalysisAssets)?.page.sourceAnalysisAssets;
      for (const [questionNumber, analysisDocxAssets] of Object.entries(sourceAnalysisAssets ?? {})) {
        const target = imported.find((entry) => entry.documentNumber === questionNumber);
        if (target && Object.keys(analysisDocxAssets).length) target.analysisDocxAssets = analysisDocxAssets;
      }
      const sourceQuestionImages = recognizedPages.find((recognized) => !("error" in recognized) && recognized.page.sourceQuestionImages)?.page.sourceQuestionImages;
      for (const [questionNumber, contentImages] of Object.entries(sourceQuestionImages ?? {})) {
        const target = imported.find((entry) => entry.documentNumber === questionNumber);
        if (target && contentImages.length) { target.contentImages = contentImages; target.diagramImage = undefined; target.diagramBox = undefined; }
      }
      const sourceOptions = recognizedPages.find((recognized) => !("error" in recognized) && recognized.page.sourceOptions)?.page.sourceOptions;
      for (const [questionNumber, options] of Object.entries(sourceOptions ?? {})) {
        const target = imported.find((entry) => entry.documentNumber === questionNumber);
        if (target && options.length >= 2) target.options = options;
      }
      for (const target of imported) {
        if (!isUsableImportedAnswer(target.answer)) target.answer = explicitChoiceFromAnalysis(target.analysis);
      }
      setFileImportDrafts(imported); setFileImportErrors(pageErrors); setFileImportStep("review");
    } catch (error) { if (!controller.signal.aborted) { setFileImportErrors([error instanceof Error ? error.message : "无法读取这个文件"]); setFileImportStep("choose"); } }
    finally { if (fileImportAbortRef.current === controller) fileImportAbortRef.current = null; }
  }

  function updateImportDraft(importId: string, changes: Partial<FileImportDraft>) {
    setFileImportDrafts((current) => current.map((item) => item.importId === importId ? { ...item, ...changes, ...(changes.stem === undefined ? {} : { stemDocxXml: undefined, stemDocxAssets: undefined }) } : item));
  }

  async function saveImportedQuestions() {
    const selected = fileImportDrafts.filter((item) => item.selected && item.stem.trim() && item.categoryId);
    if (!selected.length) { setNotice("请至少选择一道题，并确认题干和分类"); return; }
    const saved: Question[] = selected.map((item) => {
      const question = { ...item } as Partial<FileImportDraft>;
      delete question.importId; delete question.selected; delete question.documentNumber;
      return { ...question, stem: item.stem.trim(), stemParagraphs: item.stem.split(/\r?\n/).filter((line) => line.length > 0), options: item.options.map((option) => option.trim()).filter(Boolean), updatedAt: Date.now() } as Question;
    });
    try {
      const uploaded = await Promise.all(saved.map(async (question) => (await createCloudQuestion(question)).question));
      setQuestions((current) => [...uploaded, ...current].sort((a, b) => b.createdAt - a.createdAt)); setFileImportOpen(false); setNotice(`已从文件录入 ${uploaded.length} 道云端试题`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "文件题目保存失败"); }
  }

  async function requestVectorDiagramReconstruction(stem: string, image: string, quality: DiagramQuality | undefined | null) {
    const aspectRatio = await imageAspectRatio(image);
    let previousPlan: VectorDiagramPlan | undefined; let fitFeedback: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/reconstruct-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, stem, qualityIssues: quality?.issues ?? [], imageAspectRatio: aspectRatio, previousPlan, fitFeedback }),
      });
      const payload = await response.json() as { result?: VectorDiagramPlan; skipped?: boolean; reason?: string; error?: string; code?: string };
      if (payload.skipped) return { skipped: true as const, reason: payload.reason || "这幅图不适合自动矢量重绘" };
      if (!response.ok || !payload.result) throw new Error(payload.code === "MISSING_API_KEY" ? "高清矢量重绘尚未配置" : payload.error || "没有生成可用的重绘方案");
      try {
        const rendered = await renderVectorDiagramPlan(payload.result, image);
        return { skipped: false as const, plan: payload.result, ...rendered };
      } catch (error) {
        if (!(error instanceof VectorDiagramFitError) || attempt === 1) throw error;
        previousPlan = payload.result; fitFeedback = error.feedback;
      }
    }
    throw new Error("高清矢量稿未达到原图视觉匹配要求");
  }

  async function recognizeImage(image: string) {
    if (!questionDraft) return;
    setIsRecognizing(true); setRecognitionError("");
    try {
      const response = await fetch("/api/recognize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, categories: categories.map((item) => ({ id: item.id, path: pathOf(item.id) })) }) });
      const payload = await response.json() as { result?: RecognitionResult; error?: string; code?: string };
      if (!response.ok || !payload.result) throw new Error(payload.code === "MISSING_API_KEY" ? "智能识别尚未配置。请关闭后通过“启动 Mitty 的宝藏题库”重新打开，并按提示填写 Sub2API 地址、Key 和视觉模型。" : payload.error || "识别失败，请重试");
      const result = payload.result;
      let diagramImage: string | undefined;
      if (result.diagram_bbox && result.diagram_bbox.width > 30 && result.diagram_bbox.height > 30) diagramImage = await cropDataUrl(image, result.diagram_bbox);
      let reconstruction: Partial<Question> = { diagramImage, diagramSource: diagramImage ? "extracted" : undefined, diagramQuality: result.diagram_quality ?? undefined };
      const warnings = [...result.warnings];
      if (diagramImage && enableVectorReconstruction && shouldAutoVectorizeDiagram(result.diagram_quality)) {
        setIsReconstructingDiagram(true);
        try {
          const rebuilt = await requestVectorDiagramReconstruction(result.stem, diagramImage, result.diagram_quality);
          if (rebuilt.skipped) warnings.push(rebuilt.reason);
          else reconstruction = { diagramOriginalImage: diagramImage, diagramImage: rebuilt.image, diagramSource: "svg-ai", vectorDiagramSvg: rebuilt.svg, vectorDiagramPlan: rebuilt.plan, diagramReconstructionConfidence: rebuilt.plan.confidence, diagramVisualFitScore: rebuilt.visualFitScore, diagramReconstructionWarnings: rebuilt.plan.warnings, diagramReconstructedAt: Date.now() };
        } catch (error) { warnings.push(`高清矢量重绘未完成：${error instanceof Error ? error.message : "未知错误"}`); }
        finally { setIsReconstructingDiagram(false); }
      }
      setQuestionDraft((current) => current ? { ...current, type: result.type, difficulty: result.difficulty, stem: result.stem, options: result.options.length ? result.options : [], answer: cleanRecognizedAnswer(result.answer), analysis: cleanRecognizedAnalysis(result.analysis), source: result.source, tags: result.tags, categoryId: result.suggested_category_id && categories.some((item) => item.id === result.suggested_category_id) ? result.suggested_category_id : current.categoryId, originalImage: image, diagramBox: result.diagram_bbox ?? undefined, recognitionConfidence: result.confidence, recognitionWarnings: warnings, ...reconstruction } : current);
      setNotice(reconstruction.diagramSource === "svg-ai" ? "识别完成，低质量配图已完成高清矢量重绘" : "识别完成，请检查后保存");
    } catch (error) { setRecognitionError(error instanceof Error ? error.message : "识别失败，请重试"); }
    finally { setIsRecognizing(false); }
  }

  async function reconstructCurrentDiagram() {
    if (!questionDraft?.stem.trim()) { setRecognitionError("请先确认题干内容"); return; }
    const original = questionDraft.diagramOriginalImage ?? questionDraft.diagramImage;
    if (!original) { setRecognitionError("没有可用于重绘的独立配图"); return; }
    setIsReconstructingDiagram(true); setRecognitionError("");
    try {
      if (questionDraft.vectorDiagramPlan?.strokes?.length) {
        const rendered = await renderVectorDiagramPlan(questionDraft.vectorDiagramPlan, original);
        setQuestionDraft({ ...questionDraft, diagramOriginalImage: original, diagramImage: rendered.image, diagramSource: "svg-ai", vectorDiagramSvg: rendered.svg, diagramVisualFitScore: rendered.visualFitScore, diagramReconstructedAt: Date.now() });
        setNotice("高清矢量图已重新渲染");
        return;
      }
      const rebuilt = await requestVectorDiagramReconstruction(questionDraft.stem, original, questionDraft.diagramQuality);
      if (rebuilt.skipped) throw new Error(rebuilt.reason);
      setQuestionDraft({ ...questionDraft, diagramOriginalImage: original, diagramImage: rebuilt.image, diagramSource: "svg-ai", vectorDiagramSvg: rebuilt.svg, vectorDiagramPlan: rebuilt.plan, diagramReconstructionConfidence: rebuilt.plan.confidence, diagramVisualFitScore: rebuilt.visualFitScore, diagramReconstructionWarnings: rebuilt.plan.warnings, diagramReconstructedAt: Date.now() });
      setNotice("高清矢量重绘已更新");
    } catch (error) { setRecognitionError(error instanceof Error ? error.message : "高清矢量重绘失败"); }
    finally { setIsReconstructingDiagram(false); }
  }

  async function handleQuestionImage(file: File) {
    if (!file.type.startsWith("image/")) { setRecognitionError("请选择图片文件"); return; }
    if (file.size > 15 * 1024 * 1024) { setRecognitionError("图片超过 15MB，请先裁剪或压缩"); return; }
    try { const image = await compressDataUrl(await fileToDataUrl(file)); setQuestionDraft((current) => current ? { ...current, originalImage: image, diagramImage: undefined, diagramOriginalImage: undefined, diagramSource: undefined, diagramQuality: undefined, diagramBox: undefined, geogebraBase64: undefined, geogebraPlan: undefined, vectorDiagramSvg: undefined, vectorDiagramPlan: undefined, diagramReconstructionConfidence: undefined, diagramVisualFitScore: undefined, diagramReconstructionWarnings: undefined, diagramReconstructedAt: undefined } : current); await recognizeImage(image); }
    catch { setRecognitionError("无法读取这张图片，请换一张重试"); }
  }

  async function handleManualImages(files: File[]) {
    const available = Math.max(0, 4 - (questionDraft?.contentImages?.length ?? 0));
    if (!available) { setNotice("每道题最多添加 4 张配图"); return; }
    const selected = files.filter((file) => file.type.startsWith("image/")).slice(0, available);
    if (!selected.length) { setOptimizationError("请选择 PNG、JPG 或 WebP 图片"); return; }
    if (selected.some((file) => file.size > 15 * 1024 * 1024)) { setOptimizationError("单张图片不能超过 15MB"); return; }
    try {
      const images = await Promise.all(selected.map(async (file) => compressDataUrl(await fileToDataUrl(file))));
      setQuestionDraft((current) => current ? { ...current, contentImages: [...(current.contentImages ?? []), ...images], imageLayout: current.imageLayout ?? "right" } : current);
      setOptimizationError(""); setNotice(`已添加 ${images.length} 张题目配图`);
    } catch { setOptimizationError("无法读取图片，请换一张重试"); }
  }

  async function optimizeDraft() {
    if (!questionDraft?.stem.trim()) { setOptimizationError("请先填写题干，再让 AI 优化"); return; }
    setIsOptimizing(true); setOptimizationError(""); setOptimizationPreview(null);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: questionDraft.type,
          stem: questionDraft.stem,
          options: questionDraft.options.filter(Boolean),
          answer: questionDraft.answer,
          analysis: questionDraft.analysis,
          source: questionDraft.source,
          tags: questionDraft.tags ?? [],
          images: questionImages(questionDraft),
        }),
      });
      const payload = await response.json() as { result?: OptimizationResult; error?: string; code?: string };
      if (!response.ok || !payload.result) throw new Error(payload.code === "MISSING_API_KEY" ? "AI 优化尚未配置，请检查 Sub2API 配置" : payload.error || "优化失败，请重试");
      setOptimizationPreview(payload.result);
    } catch (error) { setOptimizationError(error instanceof Error ? error.message : "优化失败，请重试"); }
    finally { setIsOptimizing(false); }
  }

  function applyOptimization() {
    if (!questionDraft || !optimizationPreview) return;
    setQuestionDraft({
      ...questionDraft,
      stem: optimizationPreview.stem,
      options: optimizationPreview.options.length ? optimizationPreview.options : questionDraft.options,
      answer: optimizationPreview.answer,
      analysis: optimizationPreview.analysis,
      source: optimizationPreview.source,
      tags: optimizationPreview.tags,
      imageLayout: questionImages(questionDraft).length ? optimizationPreview.image_layout : "below",
      optimizedAt: Date.now(),
    });
    setOptimizationPreview(null); setNotice("已采用 AI 优化结果");
  }

  function cropPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = cropStageRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000)), y: Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000)) };
  }

  function beginManualCrop() {
    if (!questionDraft?.originalImage) return; setCropSelection(questionDraft.diagramBox ?? null); setCropDialog(true);
  }

  async function applyManualCrop() {
    if (!questionDraft?.originalImage || !cropSelection || cropSelection.width < 10 || cropSelection.height < 10) { setNotice("请先框选完整配图"); return; }
    const diagramImage = await cropExactDataUrl(questionDraft.originalImage, cropSelection); setQuestionDraft({ ...questionDraft, diagramImage, diagramOriginalImage: undefined, diagramSource: "extracted", diagramBox: cropSelection, geogebraBase64: undefined, geogebraPlan: undefined, vectorDiagramSvg: undefined, vectorDiagramPlan: undefined, diagramReconstructionConfidence: undefined, diagramVisualFitScore: undefined, diagramReconstructionWarnings: undefined, diagramReconstructedAt: undefined }); setCropDialog(false); setNotice("配图已重新裁剪");
  }

  async function persistQuestion() {
    if (!questionDraft || !questionDraft.stem.trim() || !questionDraft.categoryId) { setNotice("请填写题干并选择分类"); return; }
    const timestamp = Date.now();
    const saved: Question = { ...questionDraft, id: questionDraft.id || uid("q"), stem: questionDraft.stem.trim(), options: questionDraft.options.map((item) => item.trim()).filter(Boolean), createdAt: questionDraft.createdAt || timestamp, updatedAt: timestamp };
    try {
      const result = questionDraft.id ? await updateCloudQuestion(saved) : await createCloudQuestion(saved);
      setQuestions((current) => [result.question, ...current.filter((item) => item.id !== result.question.id)].sort((a, b) => b.createdAt - a.createdAt));
      setQuestionDraft(null); setNotice(questionDraft.id ? "云端试题已更新" : "试题已保存到云端");
    } catch (error) { setNotice(error instanceof Error ? error.message : "试题保存失败"); }
  }

  async function duplicateQuestion(question: Question) {
    if (!requireLogin()) return;
    const copy = { ...question, id: uid("q"), stem: `${question.stem}（副本）`, createdAt: Date.now(), updatedAt: Date.now() };
    try { const result = await createCloudQuestion(copy); setQuestions((current) => [result.question, ...current]); setNotice("已复制到自己的云端题库"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "复制失败"); }
  }

  async function deleteQuestion(question: Question) {
    if (!window.confirm("确定删除这道试题吗？此操作无法撤销。")) return;
    try { await deleteCloudQuestion(question.id); setQuestions((current) => current.filter((item) => item.id !== question.id)); setSelectedIds((current) => current.filter((id) => id !== question.id)); setNotice("试题已删除"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); }
  }

  async function deleteSelectedQuestions() {
    const ids = selectedIds.filter((id) => questions.some((item) => item.id === id));
    if (!ids.length) { setBatchDeleteOpen(false); return; }
    const editableIds = ids.filter((id) => questions.find((item) => item.id === id)?.canEdit);
    if (!editableIds.length) { setBatchDeleteOpen(false); setNotice("所选题目中没有你可以删除的内容"); return; }
    try {
      await Promise.all(editableIds.map(deleteCloudQuestion));
      setQuestions((current) => current.filter((item) => !editableIds.includes(item.id)));
      setExpandedAnswers((current) => current.filter((id) => !editableIds.includes(id)));
      setSelectedIds((current) => current.filter((id) => !editableIds.includes(id))); setBatchDeleteOpen(false); setNotice(`已删除 ${editableIds.length} 道有权限的试题`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "批量删除失败"); }
  }

  async function createCategory() {
    if (!categoryName.trim()) { setNotice("请填写分类名称"); return; }
    const category: Category = { id: uid("cat"), name: categoryName.trim(), parentId: categoryParent || null, createdAt: Date.now() };
    try { const result = await createCloudCategory(category); setCategories((current) => [...current, result.category]); setCategoryName(""); setCategoryDialog(null); setActiveCategory(result.category.id); setNotice("云端分类已创建"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "分类创建失败"); }
  }

  async function deleteCategory(category: Category) {
    const categoryIds = descendantsOf(category.id); const questionIds = questions.filter((item) => categoryIds.includes(item.categoryId)).map((item) => item.id);
    if (!window.confirm(`删除“${category.name}”会同时删除其子分类和 ${questionIds.length} 道试题。确定继续吗？`)) return;
    try { await deleteCloudCategory(category.id); setCategories((current) => current.filter((item) => !categoryIds.includes(item.id))); setQuestions((current) => current.filter((item) => !questionIds.includes(item.id))); setSelectedIds((current) => current.filter((id) => !questionIds.includes(id))); setActiveCategory(categories.find((item) => item.parentId === null && !categoryIds.includes(item.id))?.id ?? null); setNotice("分类已删除"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "分类删除失败"); }
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ categories, questions }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Mitty宝藏题库备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("备份文件已导出");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try { const data = JSON.parse(await file.text()) as LibraryData; if (!Array.isArray(data.categories) || !Array.isArray(data.questions)) throw new Error("bad shape"); if (!window.confirm("导入后会把备份中的分类和题目追加到云端题库，是否继续？")) return; const result = await importCloudLibrary(data); await refreshLibrary(false); setSelectedIds([]); setCategoryDialog(null); setNotice(`已迁移 ${result.imported} 道题到云端`); } catch (error) { setNotice(error instanceof Error ? error.message : "无法识别这个备份文件"); } finally { event.target.value = ""; }
  }

  async function generateWord() {
    if (!selectedQuestions.length) return;
    try { await authorizeDownload(); await exportQuestionsToWord(selectedQuestions, paperTitle.trim() || "练习题", includeAnswers); setExportDialog(false); setNotice("Word 练习已生成"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "下载失败"); }
  }

  function renderTree(parentId: string | null, depth = 0) {
    return childrenOf(parentId).map((category) => (
      <div key={category.id}>
        <button className={`tree-row ${activeCategory === category.id && !showSelected ? "active-leaf" : ""}`} style={{ paddingLeft: 10 + depth * 17 }} onClick={() => { setActiveCategory(category.id); setShowSelected(false); }}>
          <span className="tree-dot">{childrenOf(category.id).length ? "◆" : "·"}</span><span className="tree-name">{category.name}</span><span className="count">{countFor(category.id)}</span>
        </button>
        {renderTree(category.id, depth + 1)}
      </div>
    ));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">题</span><div><strong>Mitty</strong><span>的宝藏题库</span></div></div>
        <nav aria-label="主导航"><button className={`nav-item ${!showSelected ? "active" : ""}`} onClick={() => setShowSelected(false)}>题库</button>{authUser && <button className={`nav-item ${showSelected ? "active" : ""}`} onClick={() => setShowSelected(true)}>我的组卷{selectedIds.length ? <i>{selectedIds.length}</i> : null}</button>}</nav>
        <div className="account-area">{authLoading ? <span className="guest-badge">正在连接云端…</span> : authUser ? <><span className="user-chip"><b>{authUser.local ? "本地管理员" : authUser.role === "admin" ? "管理员" : "会员"}</b>{authUser.local ? "无需登录" : authUser.email}</span>{!authUser.local && <button className="account-button" onClick={signOut}>退出</button>}<button className="primary-button" onClick={openNewQuestion}><span>＋</span> 新建试题</button></> : <><span className="guest-badge">访客 · 仅浏览</span><button className="account-button" onClick={() => { setAuthMode("login"); setAuthError(""); setAuthDialog(true); }}>登录 / 注册</button></>}</div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><div><span className="eyebrow">共享分类</span><h2>知识目录</h2></div>{authUser && <button className="icon-button" aria-label="添加分类" onClick={() => { setCategoryParent(activeCategory ?? ""); setCategoryDialog("new"); }}>＋</button>}</div>
          <div className="tree">{categories.length ? renderTree(null) : <p className="empty-tree">还没有分类，点击右上角＋创建</p>}</div>
          {authUser ? <button className="manage-button" onClick={() => setCategoryDialog("manage")}>⚙ 分类与数据管理</button> : <button className="manage-button" onClick={() => { setAuthMode("login"); setAuthDialog(true); }}>登录后录题与下载</button>}
        </aside>

        <section className="content">
          <div className="content-head">
            <div><p className="breadcrumb">{showSelected ? "组卷篮" : activeCategory ? pathOf(activeCategory) : "题库"}</p><h1>{activeName}</h1><p className="subtext">{filteredQuestions.length} 道试题 · 云端共享题库{authUser ? authUser.local ? " · localhost 本地管理员" : ` · 已登录为${authUser.role === "admin" ? "管理员" : "会员"}` : " · 访客可直接浏览"}</p></div>
            <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索试题" placeholder="搜索题干、答案、来源…" /></label>
          </div>
          <div className="filters">
            <button className={`filter ${typeFilter === "全部" ? "active" : ""}`} onClick={() => setTypeFilter("全部")}>全部题型 <span>{questions.length}</span></button>
            {questionTypes.map((type) => <button key={type} className={`filter ${typeFilter === type ? "active" : ""}`} onClick={() => setTypeFilter(type)}>{type.replace("单选题", "选择题")} <span>{questions.filter((item) => item.type === type).length}</span></button>)}
            {authUser && <button className={`select-visible ${allFilteredSelected ? "active" : ""}`} disabled={!filteredQuestions.length} onClick={toggleAllFiltered}>{allFilteredSelected ? "取消全选" : "全选当前结果"}</button>}
          </div>
          <div className="question-list">
            {!filteredQuestions.length && <div className="empty-state"><div>空</div><h3>{showSelected ? "还没有勾选试题" : "这里还没有试题"}</h3><p>{showSelected ? "回到题库勾选需要组卷的题目" : authUser ? "新建一道试题，开始完善共享题库" : "登录后可以录入第一道试题"}</p><button onClick={showSelected ? () => setShowSelected(false) : openNewQuestion}>{showSelected ? "返回题库" : authUser ? "新建试题" : "登录"}</button></div>}
            {filteredQuestions.map((question, index) => {
              const checked = selectedIds.includes(question.id); const answerOpen = expandedAnswers.includes(question.id); const images = questionImages(question); const imageLayout = resolveQuestionImageLayout(question);
              const displayStem = question.stemDocxXml?.length ? docxStemDisplayText(question.stemDocxXml) : question.stem;
              return <article className={`question-card ${checked ? "checked" : ""}`} key={question.id}>
                {authUser && <button className={`check ${checked ? "on" : ""}`} aria-label={`${checked ? "取消选择" : "选择"}第 ${index + 1} 题`} onClick={() => toggleSelected(question.id)}>{checked ? "✓" : ""}</button>}
                <div className="question-main">
                  <div className="meta"><span>{question.type}</span><span className={question.difficulty === "提高" ? "hard" : question.difficulty === "中等" ? "medium" : "easy"}>{question.difficulty}</span>{question.diagramSource === "svg-ai" ? <span className="geogebra-badge">高清矢量重绘</span> : question.diagramSource === "geogebra-ai" ? <span className="geogebra-badge">旧版 GeoGebra 重绘</span> : question.originalImage ? <span className="image-badge">图像识别</span> : images.length ? <span className="image-badge">题目配图</span> : null}{question.optimizedAt && <span className="optimized-badge">AI 已优化</span>}<em>{pathOf(question.categoryId)}</em></div>
                  <div className={`question-presentation ${images.length ? `with-images layout-${imageLayout}` : ""}`}>
                    <div className="question-copy">
                      <p className="stem"><b>{index + 1}.</b> {question.source && <span className="question-source">（{question.source}）</span>}<MathText text={displayStem} /></p>
                      {!!question.options.length && <div className="options">{question.options.map((option, optionIndex) => <span key={`${question.id}-${optionIndex}`}>{String.fromCharCode(65 + optionIndex)}. <MathText text={option} /></span>)}</div>}
                    </div>
                    {!!images.length && <div className={`question-images ${images.length > 1 ? "multiple" : ""}`}>{images.map((image, imageIndex) => <img className="question-diagram" src={image} alt={`题目配图 ${imageIndex + 1}`} key={`${question.id}-image-${imageIndex}`} />)}</div>}
                  </div>
                  {!!question.tags?.length && <div className="tag-row">{question.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                  {answerOpen && <div className="answer-box"><b>答案</b><p><MathText text={question.answer || "略"} /></p>{question.analysis && <><b>解析</b><p><MathText text={question.analysis} /></p></>}</div>}
                  <div className="question-actions"><button onClick={() => setExpandedAnswers((current) => current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id])}>{answerOpen ? "收起解析" : "查看解析"}</button>{question.createdByEmail && <small>由 {question.createdByEmail} 录入</small>}<span></span>{authUser && <button onClick={() => duplicateQuestion(question)}>复制到我的题库</button>}{question.canEdit && <><button onClick={() => openEditQuestion(question)}>编辑</button><button className="danger-text" onClick={() => deleteQuestion(question)}>删除</button></>}</div>
                </div>
              </article>;
            })}
          </div>
        </section>
      </section>

      {authUser && <aside className={`paper-dock ${selectedIds.length ? "visible" : ""}`}><div className="dock-count"><strong>{selectedIds.length}</strong><span>已选试题</span></div><div className="dock-title"><span>当前练习</span><b>{paperTitle}</b></div>{selectedIds.some((id) => questions.find((item) => item.id === id)?.canEdit) && <button className="dock-delete-button" onClick={() => setBatchDeleteOpen(true)}>删除可管理题目</button>}<button className="ghost-button" onClick={() => setSelectedIds([])}>清空</button><button className="export-button" onClick={() => setExportDialog(true)}>生成 Word <span>→</span></button></aside>}

      {questionDraft && <div className="modal-backdrop">
        <section className="modal question-modal" role="dialog" aria-modal="true" aria-label="试题编辑" onPaste={(event) => { const file = clipboardImage(event); if (file) { event.preventDefault(); if (entryMode === "screenshot") handleQuestionImage(file); else handleManualImages([file]); } }}>
          <div className="modal-head"><div><span className="eyebrow">智能录题</span><h2>{questionDraft.id ? "编辑并校对试题" : entryMode === "manual" ? "人工录入试题" : "截图自动录题"}</h2></div><button className="close" onClick={() => setQuestionDraft(null)}>×</button></div>
          <div className="entry-mode" role="tablist" aria-label="录题方式"><button className={entryMode === "manual" ? "active" : ""} onClick={() => setEntryMode("manual")}><b>人工录入</b><span>文字与配图自由组合</span></button><button className={entryMode === "screenshot" ? "active" : ""} onClick={() => setEntryMode("screenshot")}><b>AI 截图录入</b><span>识别单道题目截图</span></button><button onClick={openFileImport}><b>文件批量录入</b><span>PDF / Word 整份导入</span></button></div>
          {entryMode === "screenshot" && (!questionDraft.originalImage ? <button type="button" className="smart-capture" onClick={() => questionImageRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) handleQuestionImage(file); }}>
            <div className="capture-icon">⌘V</div><div><b>直接粘贴题目截图</b><p>也可以点击选择图片，或把图片拖到这里</p></div><span>自动识别题干、公式、答案与配图</span>
          </button> : <div className="recognition-source">
            <div className="source-image"><img src={questionDraft.originalImage} alt="原始题目截图" />{isRecognizing && <div className="recognizing"><i></i><b>正在识别题目…</b><span>文字、公式和配图会自动拆分</span></div>}</div>
            <div className="source-status"><span className="eyebrow">原始截图已保留</span><b>{isReconstructingDiagram ? "正在提取原图轮廓并生成矢量稿" : isRecognizing ? "识别处理中" : questionDraft.recognitionConfidence != null ? `识别可信度 ${Math.round(questionDraft.recognitionConfidence * 100)}%` : "等待识别"}</b><p>下面的结果可以逐项修改，保存后仍可对照原图。</p><div><button className="secondary" disabled={isRecognizing || isReconstructingDiagram} onClick={() => recognizeImage(questionDraft.originalImage!)}>重新识别</button><button className="text-button" onClick={() => setQuestionDraft({ ...questionDraft, originalImage: undefined, diagramImage: undefined, diagramOriginalImage: undefined, diagramSource: undefined, diagramQuality: undefined, diagramBox: undefined, geogebraBase64: undefined, geogebraPlan: undefined, vectorDiagramSvg: undefined, vectorDiagramPlan: undefined, diagramReconstructionConfidence: undefined, diagramVisualFitScore: undefined, diagramReconstructionWarnings: undefined, diagramReconstructedAt: undefined, recognitionConfidence: undefined, recognitionWarnings: [] })}>移除图片</button></div></div>
          </div>)}
          <input ref={questionImageRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleQuestionImage(file); event.target.value = ""; }} />
          <input ref={manualImagesRef} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { handleManualImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          {entryMode === "screenshot" && <label className="geogebra-toggle"><input type="checkbox" checked={enableVectorReconstruction} disabled={isRecognizing || isReconstructingDiagram} onChange={(event) => setEnableVectorReconstruction(event.target.checked)} /><span><b>低质量配图时，自动高清矢量重绘</b><small>直接复刻原图点线、标签、线宽与留白；GeoGebra 仅用于后台核对数学关系，原始配图始终保留。</small></span><em>{enableVectorReconstruction ? "已开启" : "已关闭"}</em></label>}
          {entryMode === "screenshot" && recognitionError && <div className="recognition-error"><b>暂时无法自动识别</b><span>{recognitionError}</span></div>}
          {entryMode === "screenshot" && !!questionDraft.recognitionWarnings?.length && <div className="recognition-warning"><b>请重点核对</b><span>{questionDraft.recognitionWarnings.join("；")}</span></div>}
          <div className="review-divider"><span>{entryMode === "manual" ? "录入题目内容" : "识别结果 · 保存前请检查"}</span></div>
          <div className="form-grid three"><label>题型<select value={questionDraft.type} onChange={(event) => setQuestionDraft({ ...questionDraft, type: event.target.value as QuestionType })}>{questionTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>难度<select value={questionDraft.difficulty} onChange={(event) => setQuestionDraft({ ...questionDraft, difficulty: event.target.value as Difficulty })}>{difficulties.map((item) => <option key={item}>{item}</option>)}</select></label><label>所属分类<select value={questionDraft.categoryId} onChange={(event) => setQuestionDraft({ ...questionDraft, categoryId: event.target.value })}><option value="">请选择</option>{categories.map((item) => <option key={item.id} value={item.id}>{pathOf(item.id)}</option>)}</select></label></div>
          <label className="field">题干<textarea rows={4} value={questionDraft.stem} onChange={(event) => setQuestionDraft({ ...questionDraft, stem: event.target.value, stemDocxXml: undefined, stemDocxAssets: undefined })} placeholder="识别后的题干会出现在这里，也可以直接输入…" /></label>
          <div className="formula-hint"><b>可编辑公式</b><span>计算式会自动转为 Word 公式；复杂分式、根式可用 $LaTeX$ 输入，如 $\frac&#123;1&#125;&#123;2&#125;$。</span></div>
          {entryMode === "manual" && <div className="manual-image-editor" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleManualImages(Array.from(event.dataTransfer.files)); }}>
            <div className="manual-image-head"><div><span className="eyebrow">题目配图（选填）</span><p>可添加几何图、函数图像或表格，最多 4 张；也支持直接粘贴。</p></div><button className="secondary" onClick={() => manualImagesRef.current?.click()}>＋ 添加图片</button></div>
            {questionDraft.contentImages?.length ? <div className="manual-image-grid">{questionDraft.contentImages.map((image, index) => <figure key={`manual-${index}`}><img src={image} alt={`人工添加的题目配图 ${index + 1}`} /><button aria-label={`移除第 ${index + 1} 张配图`} onClick={() => setQuestionDraft({ ...questionDraft, contentImages: questionDraft.contentImages?.filter((_, imageIndex) => imageIndex !== index) })}>×</button><figcaption>配图 {index + 1}</figcaption></figure>)}</div> : <button className="manual-image-empty" onClick={() => manualImagesRef.current?.click()}><span>＋</span> 点击、拖入或粘贴题目配图</button>}
          </div>}
          {entryMode === "screenshot" && questionDraft.diagramImage && (questionDraft.diagramSource === "svg-ai" && questionDraft.diagramOriginalImage ? <div className="diagram-review geogebra-review"><div><span className="eyebrow">原图坐标高清矢量重绘</span><p>最终图直接使用原图坐标，不再由几何引擎重新摆点。综合视觉匹配度 {Math.round((questionDraft.diagramVisualFitScore ?? 0) * 100)}%，关系识别可信度 {Math.round((questionDraft.diagramReconstructionConfidence ?? 0) * 100)}%。</p></div><div className="diagram-compare"><figure><img src={questionDraft.diagramOriginalImage} alt="重绘前的原始配图" /><figcaption>原始配图</figcaption></figure><figure><img src={questionDraft.diagramImage} alt="高清矢量重绘配图" /><figcaption>高清矢量重绘</figcaption></figure></div><div className="diagram-actions"><button className="secondary" disabled={isReconstructingDiagram} onClick={reconstructCurrentDiagram}>{isReconstructingDiagram ? "正在重绘…" : "重新渲染"}</button><button className="text-button" onClick={() => setQuestionDraft({ ...questionDraft, diagramImage: questionDraft.diagramOriginalImage, diagramOriginalImage: undefined, diagramSource: "extracted", vectorDiagramSvg: undefined, vectorDiagramPlan: undefined, diagramReconstructionConfidence: undefined, diagramVisualFitScore: undefined, diagramReconstructionWarnings: undefined, diagramReconstructedAt: undefined })}>使用原图</button></div></div> : <div className="diagram-review"><div><span className="eyebrow">清理后的独立配图</span><p>{isReconstructingDiagram ? "正在提取原图轮廓、标签位置和视觉比例…" : "已自动从截图中分离，保存后只展示这张图。"}</p></div><img src={questionDraft.diagramImage} alt="识别出的题目配图" /><div className="diagram-actions"><button className="secondary" onClick={beginManualCrop}>手动框选</button>{questionDraft.diagramQuality?.reconstructable && <button className="secondary" disabled={isReconstructingDiagram} onClick={reconstructCurrentDiagram}>高清矢量重绘</button>}<button className="text-button" onClick={() => setQuestionDraft({ ...questionDraft, diagramImage: undefined, diagramBox: undefined, diagramOriginalImage: undefined, diagramSource: undefined, vectorDiagramSvg: undefined, vectorDiagramPlan: undefined, diagramReconstructionConfidence: undefined, diagramVisualFitScore: undefined, diagramReconstructionWarnings: undefined, diagramReconstructedAt: undefined })}>移除</button></div></div>)}
          {!!questionImages(questionDraft).length && <div className="layout-choice"><div><span className="eyebrow">图文排列</span><p>{questionDraft.stemDocxXml?.length ? "文件录入题会按篇幅、分问和配图数量自动选择合适结构。" : isGeometryQuestion(questionDraft) ? "网页端题干左、配图右；导出 Word 时自动改为题干下、配图右。" : "网页端可左右展示以节省空间，Word 导出会使用更稳妥的上下结构。"}</p></div><div>{questionDraft.stemDocxXml?.length ? <button className="active">{resolveQuestionImageLayout(questionDraft) === "right" ? "网页 · 题干左配图右" : resolveQuestionImageLayout(questionDraft) === "below-right" ? "网页 · 题干上配图右下" : "网页 · 题干上配图左下"}</button> : isGeometryQuestion(questionDraft) ? <button className="active">网页 · 题干左配图右</button> : <><button className={(questionDraft.imageLayout ?? "right") === "right" ? "active" : ""} onClick={() => setQuestionDraft({ ...questionDraft, imageLayout: "right" })}>题干左 · 配图右</button><button className={questionDraft.imageLayout === "below" ? "active" : ""} onClick={() => setQuestionDraft({ ...questionDraft, imageLayout: "below" })}>题干上 · 配图下</button></>}</div></div>}
          {["单选题", "多选题"].includes(questionDraft.type) && <div className="field"><span>选项</span><div className="option-inputs">{questionDraft.options.map((option, index) => <label key={index}><b>{String.fromCharCode(65 + index)}</b><input value={option} onChange={(event) => { const options = [...questionDraft.options]; options[index] = event.target.value; setQuestionDraft({ ...questionDraft, options }); }} placeholder={`选项 ${String.fromCharCode(65 + index)}`} /></label>)}</div></div>}
          <div className="form-grid two"><label>答案<input value={questionDraft.answer} onChange={(event) => setQuestionDraft({ ...questionDraft, answer: event.target.value })} placeholder="如：B 或 √5" /></label><label>来源（选填）<input value={questionDraft.source} onChange={(event) => setQuestionDraft({ ...questionDraft, source: event.target.value })} placeholder="如：2024·武汉模拟" /></label></div>
          <label className="field">知识点标签（用逗号分隔）<input value={(questionDraft.tags ?? []).join("，")} onChange={(event) => setQuestionDraft({ ...questionDraft, tags: event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean) })} placeholder="如：手拉手模型，旋转型全等" /></label>
          <label className="field">解析（选填）<textarea rows={3} value={questionDraft.analysis} onChange={(event) => setQuestionDraft({ ...questionDraft, analysis: event.target.value })} placeholder="截图中有解析时会自动识别，也可以手工补充…" /></label>
          {optimizationError && <div className="recognition-error"><b>AI 优化未完成</b><span>{optimizationError}</span></div>}
          {optimizationPreview && <section className="optimization-preview">
            <div className="optimization-title"><div><span className="eyebrow">AI 优化预览</span><h3>确认无误后再采用</h3></div><span className="layout-recommendation">网页建议：{optimizationPreview.image_layout === "right" ? "题干左 · 配图右" : optimizationPreview.image_layout === "below-right" ? "题干上 · 配图右下" : "题干上 · 配图左下"}</span></div>
            <div className="optimization-compare"><div><b>优化前</b><p><MathText text={questionDraft.stem} /></p></div><div><b>优化后</b><p><MathText text={optimizationPreview.stem} /></p></div></div>
            <div className="optimization-changes"><b>本次调整</b><span>{optimizationPreview.changes.join("；")}</span></div>
            <div className="optimization-actions"><button className="text-button" onClick={() => setOptimizationPreview(null)}>暂不采用</button><button className="primary-button" onClick={applyOptimization}>采用优化结果</button></div>
          </section>}
          <div className="modal-actions"><small className="save-note">文字与配图将保存到共享云端题库</small><button className="ai-button" disabled={isRecognizing || isOptimizing || isReconstructingDiagram} onClick={optimizeDraft}>{isOptimizing ? <><i></i>AI 正在优化…</> : "✦ AI 优化排版"}</button><button className="secondary" onClick={() => setQuestionDraft(null)}>取消</button><button className="primary-button" disabled={isRecognizing || isOptimizing || isReconstructingDiagram} onClick={persistQuestion}>确认并保存</button></div>
        </section>
      </div>}

      {fileImportOpen && <div className="modal-backdrop"><section className="modal file-import-modal" role="dialog" aria-modal="true" aria-label="文件批量录入">
        <div className="modal-head"><div><span className="eyebrow">第三种录题方式</span><h2>PDF / Word 批量录入</h2></div><button className="close" onClick={closeFileImport}>×</button></div>
        {fileImportStep === "choose" && <>
          <div className="file-import-intro"><span>01</span><div><b>整份文件逐页识别</b><p>自动拆分题目、选项、答案和配图，识别后统一校对再保存。</p></div></div>
          <label className="field">默认存入分类<select value={fileImportCategory} onChange={(event) => setFileImportCategory(event.target.value)}><option value="">请选择分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{pathOf(item.id)}</option>)}</select></label>
          <button className="file-dropzone" onClick={() => fileImportRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) handleImportDocument(file); }}><strong>选择或拖入文件</strong><span>支持 PDF、Word（.docx），最多 40 页 / 80MB</span><small>旧版 .doc 请先在 Word 中另存为 .docx</small></button>
          <input ref={fileImportRef} hidden type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleImportDocument(file); event.target.value = ""; }} />
          {!!fileImportErrors.length && <div className="recognition-error"><b>文件未能读取</b><span>{fileImportErrors.join("；")}</span></div>}
          <div className="file-privacy-note">文件只在当前页面转换；正式题库仅保存你确认过的题目内容。</div>
        </>}
        {(fileImportStep === "rendering" || fileImportStep === "recognizing") && <div className="file-processing"><div className="file-spinner"><i></i><span>{fileImportStep === "rendering" ? "读取文件" : "AI 拆分题目"}</span></div><h3>{fileImportProgress.label}</h3><div className="progress-track"><i style={{ width: `${fileImportProgress.total ? fileImportProgress.current / fileImportProgress.total * 100 : 8}%` }}></i></div><p>{fileImportStep === "rendering" ? "正在把页面还原成清晰图片" : "正在识别题干、选项、答案、分类与配图"}</p><button className="secondary" onClick={closeFileImport}>取消导入</button></div>}
        {fileImportStep === "review" && <>
          <div className="file-review-summary"><div><strong>{fileImportDrafts.length}</strong><span>道待校对题目</span></div><p>{fileImportName} · 已选择 {fileImportDrafts.filter((item) => item.selected).length} 道</p><button className="secondary" onClick={() => setFileImportDrafts((current) => current.map((item) => ({ ...item, selected: !current.every((entry) => entry.selected) })))}>{fileImportDrafts.every((item) => item.selected) ? "取消全选" : "全部选择"}</button></div>
          {!!fileImportErrors.length && <div className="recognition-warning"><b>部分页面需留意</b><span>{fileImportErrors.join("；")}</span></div>}
          {!fileImportDrafts.length ? <div className="file-empty-result"><b>没有识别到完整题目</b><p>请确认文件页面清晰且包含题号，再重新选择文件。</p><button className="secondary" onClick={() => setFileImportStep("choose")}>重新选择</button></div> : <div className="file-draft-list">{fileImportDrafts.map((item, index) => <article className={`file-draft ${item.selected ? "selected" : ""}`} key={item.importId}>
            <div className="file-draft-head"><label><input type="checkbox" checked={item.selected} onChange={(event) => updateImportDraft(item.importId, { selected: event.target.checked })} /><b>第 {index + 1} 题</b></label><span>文件第 {item.sourcePage} 页 · 可信度 {Math.round((item.recognitionConfidence ?? 0) * 100)}%</span><button onClick={() => setFileImportDrafts((current) => current.filter((entry) => entry.importId !== item.importId))}>移除</button></div>
            <div className="file-draft-fields"><label>题型<select value={item.type} onChange={(event) => updateImportDraft(item.importId, { type: event.target.value as QuestionType })}>{questionTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>难度<select value={item.difficulty} onChange={(event) => updateImportDraft(item.importId, { difficulty: event.target.value as Difficulty })}>{difficulties.map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select></label><label className="wide">分类<select value={item.categoryId} onChange={(event) => updateImportDraft(item.importId, { categoryId: event.target.value })}><option value="">请选择</option>{categories.map((category) => <option key={category.id} value={category.id}>{pathOf(category.id)}</option>)}</select></label></div>
            <label className="field">题干<textarea rows={3} value={item.stem} onChange={(event) => updateImportDraft(item.importId, { stem: event.target.value })} /></label>
            {item.diagramImage && <div className={`file-draft-diagram ${item.diagramSource === "svg-ai" ? "reconstructed" : ""}`}><img src={item.diagramImage} alt={`第 ${index + 1} 题配图`} /><span>{item.diagramSource === "svg-ai" ? `高清矢量重绘 · 视觉匹配度 ${Math.round((item.diagramVisualFitScore ?? 0) * 100)}%` : "已自动分离配图"}</span></div>}
            {item.type === "单选题" || item.type === "多选题" ? <label className="field">选项（每行一个）<textarea rows={Math.max(2, item.options.length)} value={item.options.join("\n")} onChange={(event) => updateImportDraft(item.importId, { options: event.target.value.split("\n") })} /></label> : null}
            <div className="file-draft-answer"><label>答案<input value={item.answer} onChange={(event) => updateImportDraft(item.importId, { answer: event.target.value })} /></label><label>来源<input value={item.source} onChange={(event) => updateImportDraft(item.importId, { source: event.target.value })} /></label></div>
            {!!item.recognitionWarnings?.length && <p className="file-draft-warning">请核对：{item.recognitionWarnings.join("；")}</p>}
          </article>)}</div>}
          <div className="modal-actions file-import-actions"><button className="secondary" onClick={() => setFileImportStep("choose")}>重新选择文件</button><button className="primary-button" disabled={!fileImportDrafts.some((item) => item.selected)} onClick={saveImportedQuestions}>保存所选 {fileImportDrafts.filter((item) => item.selected).length} 道题</button></div>
        </>}
      </section></div>}

      {cropDialog && questionDraft?.originalImage && <div className="modal-backdrop"><section className="modal crop-modal" role="dialog" aria-modal="true" aria-label="手动裁剪配图">
        <div className="modal-head"><div><span className="eyebrow">配图校正</span><h2>拖动框选完整图形</h2></div><button className="close" onClick={() => setCropDialog(false)}>×</button></div>
        <p className="crop-help">从配图左上角拖到右下角，只框选需要进入试卷的图形和字母标注。</p>
        <div ref={cropStageRef} className="crop-stage" onPointerDown={(event) => { const point = cropPoint(event); setCropStart(point); setCropSelection({ ...point, width: 0, height: 0 }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!cropStart) return; const point = cropPoint(event); setCropSelection({ x: Math.min(cropStart.x, point.x), y: Math.min(cropStart.y, point.y), width: Math.abs(point.x - cropStart.x), height: Math.abs(point.y - cropStart.y) }); }} onPointerUp={() => setCropStart(null)}>
          <img src={questionDraft.originalImage} alt="原始题目截图，拖动选择配图" draggable={false} />
          {cropSelection && <div className="crop-selection" style={{ left: `${cropSelection.x / 10}%`, top: `${cropSelection.y / 10}%`, width: `${cropSelection.width / 10}%`, height: `${cropSelection.height / 10}%` }}><span></span><span></span><span></span><span></span></div>}
        </div>
        <div className="modal-actions"><button className="secondary" onClick={() => setCropDialog(false)}>取消</button><button className="primary-button" onClick={applyManualCrop}>使用这个范围</button></div>
      </section></div>}

      {categoryDialog && <div className="modal-backdrop"><section className="modal category-modal" role="dialog" aria-modal="true" aria-label="分类管理"><div className="modal-head"><div><span className="eyebrow">知识目录</span><h2>{categoryDialog === "new" ? "新建分类" : "分类与数据管理"}</h2></div><button className="close" onClick={() => setCategoryDialog(null)}>×</button></div>{categoryDialog === "new" ? <><label className="field">分类名称<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="例如：二次函数" /></label><label className="field">上级分类<select value={categoryParent} onChange={(event) => setCategoryParent(event.target.value)}><option value="">无（设为顶级分类）</option>{categories.map((item) => <option key={item.id} value={item.id}>{pathOf(item.id)}</option>)}</select></label><div className="modal-actions"><button className="secondary" onClick={() => setCategoryDialog(null)}>取消</button><button className="primary-button" onClick={createCategory}>创建分类</button></div></> : <><div className="manage-list">{categories.map((item) => <div key={item.id}><span><b>{item.name}</b><small>{pathOf(item.id)} · {countFor(item.id)} 题</small></span>{authUser?.role === "admin" && <button onClick={() => deleteCategory(item)}>删除</button>}</div>)}</div><div className="data-tools"><div><b>云端题库备份</b><small>导入会追加到云端；导出可保存一份本地副本。</small></div><button className="secondary" onClick={() => importRef.current?.click()}>迁移本地备份</button><button className="secondary" onClick={exportBackup}>导出备份</button><input ref={importRef} type="file" accept="application/json" hidden onChange={importBackup} /></div><div className="modal-actions"><button className="secondary" onClick={() => { setCategoryParent(activeCategory ?? ""); setCategoryDialog("new"); }}>＋ 新建分类</button><button className="primary-button" onClick={() => setCategoryDialog(null)}>完成</button></div></>}</section></div>}

      {exportDialog && <div className="modal-backdrop"><section className="modal export-modal" role="dialog" aria-modal="true" aria-label="生成 Word"><div className="modal-head"><div><span className="eyebrow">Word 组卷</span><h2>生成练习题</h2></div><button className="close" onClick={() => setExportDialog(false)}>×</button></div><div className="export-summary"><strong>{selectedIds.length}</strong><span>道试题将按勾选顺序排入文档</span></div><label className="field">练习标题<input value={paperTitle} onChange={(event) => setPaperTitle(event.target.value)} /></label><label className="toggle-row" aria-label="答案设置"><input type="checkbox" checked={includeAnswers} onChange={(event) => setIncludeAnswers(event.target.checked)} /><span><b>附带答案与解析</b><small>在练习题末尾另起一页</small></span></label><div className="modal-actions"><button className="secondary" onClick={() => setExportDialog(false)}>取消</button><button className="primary-button" onClick={generateWord}>下载 .docx</button></div></section></div>}

      {batchDeleteOpen && <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="批量删除试题"><div className="modal-head"><div><span className="eyebrow">危险操作</span><h2>批量删除试题</h2></div><button className="close" onClick={() => setBatchDeleteOpen(false)}>×</button></div><div className="delete-summary"><strong>{selectedIds.length}</strong><div><b>道已选试题将从题库中删除</b><p>已导出的 Word 不受影响，但题库中的数据删除后无法恢复。需要保留时，请先导出题库备份。</p></div></div><div className="modal-actions"><button className="secondary" onClick={() => setBatchDeleteOpen(false)}>取消</button><button className="danger-button" onClick={deleteSelectedQuestions}>确认删除 {selectedIds.length} 道</button></div></section></div>}
      {authDialog && <div className="modal-backdrop"><section className="modal auth-modal" role="dialog" aria-modal="true" aria-label={authMode === "login" ? "登录" : "注册"}>
        <div className="modal-head"><div><span className="eyebrow">Mitty 云端题库</span><h2>{authMode === "login" ? "邮箱登录" : "使用邀请码注册"}</h2></div><button className="close" onClick={() => setAuthDialog(false)}>×</button></div>
        <div className="auth-tabs"><button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>登录</button><button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>注册</button></div>
        <label className="field">邮箱<input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" /></label>
        <label className="field">密码<input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="至少 8 个字符" onKeyDown={(event) => { if (event.key === "Enter") submitAuth(); }} /></label>
        {authMode === "register" && <label className="field">邀请码<input value={authInvite} onChange={(event) => setAuthInvite(event.target.value)} placeholder="请输入管理员提供的邀请码" onKeyDown={(event) => { if (event.key === "Enter") submitAuth(); }} /></label>}
        {authError && <div className="recognition-error"><b>{authMode === "login" ? "登录未完成" : "注册未完成"}</b><span>{authError}</span></div>}
        <p className="auth-note">访客无需登录即可浏览题目；注册后可以录题、组卷和下载 Word。普通会员只能修改自己录入的题目。</p>
        <div className="modal-actions"><button className="secondary" onClick={() => setAuthDialog(false)}>取消</button><button className="primary-button" disabled={authSubmitting || !authEmail || !authPassword || (authMode === "register" && !authInvite)} onClick={submitAuth}>{authSubmitting ? "请稍候…" : authMode === "login" ? "登录" : "注册并登录"}</button></div>
      </section></div>}
      {notice && <div className="toast">✓ {notice}</div>}
    </main>
  );
}
