#!/usr/bin/env python3
"""Compare a source question DOCX with a question-bank DOCX export."""

from __future__ import annotations

import argparse
import json
import re
from difflib import SequenceMatcher
from pathlib import Path
from zipfile import ZipFile

from lxml import etree


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"w": W}
ANSWER_MARKERS = ("参考答案与试题解析", "参考答案及解析", "答案与解析")


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def load(path: Path):
    with ZipFile(path) as archive:
        root = etree.fromstring(archive.read("word/document.xml"))
        names = archive.namelist()
    return root, names


def paragraphs(root):
    return root.xpath(".//w:body/w:p", namespaces=NS)


def text_of(node) -> str:
    return "".join(
        item.text or ""
        for item in node.iter()
        if isinstance(item.tag, str) and local(item.tag) in {"t", "instrText"}
    ).strip()


def has_drawing(node) -> bool:
    return any(local(item.tag) in {"drawing", "pict", "shape"} for item in node.iter())


def semantic(node):
    attrs = []
    for key, value in node.attrib.items():
        name = local(key)
        if name.startswith("rsid"):
            continue
        if key == f"{{{R}}}embed":
            value = "RID"
        attrs.append((name, value))
    children = tuple(semantic(child) for child in node if isinstance(child.tag, str))
    return local(node.tag), tuple(sorted(attrs)), node.text or "", node.tail or "", children


def section_type(value: str):
    if "多项选择题" in value or "多选题" in value:
        return "多选题"
    if "选择题" in value:
        return "单选题"
    if "填空题" in value:
        return "填空题"
    if "判断题" in value:
        return "判断题"
    if "解答题" in value:
        return "解答题"
    return None


def answer_start(texts: list[str]) -> int:
    return next(
        (index for index, value in enumerate(texts) if any(marker in value for marker in ANSWER_MARKERS)),
        len(texts),
    )


def extract_questions(root):
    items = paragraphs(root)
    texts = [text_of(item) for item in items]
    end = answer_start(texts)
    title = texts[0] if texts else ""
    questions = {}
    current_type = None
    current = None
    for index, (paragraph, value) in enumerate(zip(items[:end], texts[:end])):
        detected = section_type(value)
        if detected and re.match(r"^[一二三四五六七八九十]+[.．、]", value):
            current_type = detected
            current = None
            continue
        if index > 0 and value == title:
            continue
        match = re.match(r"^\s*(\d{1,3})[.．、]", value)
        if match and current_type:
            current = match.group(1)
            questions[current] = {"type": current_type, "paragraphs": [paragraph]}
            continue
        if current and (value or has_drawing(paragraph)):
            questions[current]["paragraphs"].append(paragraph)
    return questions


def extract_analyses(root):
    items = paragraphs(root)
    texts = [text_of(item) for item in items]
    start = answer_start(texts)
    result = {}
    current = None
    collecting = False
    for paragraph, value in zip(items[start:], texts[start:]):
        match = re.match(r"^\s*(\d{1,3})[.．、]", value)
        if match:
            current = match.group(1)
            collecting = False
        if re.match(r"^【(?:分析|解答|点评)】", value):
            collecting = True
        if current and collecting:
            result.setdefault(current, []).append(paragraph)
            if value.startswith("【点评】"):
                collecting = False
    return result


def normalized_text(nodes) -> str:
    value = "".join(text_of(node) for node in nodes)
    return re.sub(r"[\s\u3000，。；：,.!?！？$]", "", value)


def count_named(nodes, names: set[str]) -> int:
    return sum(
        1
        for node in nodes
        for item in node.iter()
        if isinstance(item.tag, str) and local(item.tag) in names
    )


def ratio(actual: int, expected: int) -> float:
    return 1.0 if expected == 0 else min(actual / expected, 1.0)


def compare(source_path: Path, output_path: Path) -> dict:
    source_root, source_names = load(source_path)
    output_root, output_names = load(output_path)
    source_questions = extract_questions(source_root)
    output_questions = extract_questions(output_root)
    source_analyses = extract_analyses(source_root)
    output_analyses = extract_analyses(output_root)

    similarities = []
    source_question_paragraphs = 0
    output_question_paragraphs = 0
    exact_question_paragraphs = 0
    for number, source in source_questions.items():
        left = source["paragraphs"]
        right = output_questions.get(number, {}).get("paragraphs", [])
        source_question_paragraphs += len(left)
        output_question_paragraphs += len(right)
        exact_question_paragraphs += sum(semantic(a) == semantic(b) for a, b in zip(left, right))
        similarities.append(SequenceMatcher(None, normalized_text(left), normalized_text(right)).ratio())

    source_analysis_nodes = [node for nodes in source_analyses.values() for node in nodes]
    output_analysis_nodes = [node for nodes in output_analyses.values() for node in nodes]
    source_question_nodes = [node for item in source_questions.values() for node in item["paragraphs"]]
    output_question_nodes = [node for item in output_questions.values() for node in item["paragraphs"]]
    source_relevant = source_question_nodes + source_analysis_nodes
    output_relevant = output_question_nodes + output_analysis_nodes

    metrics = {
        "question_count": [len(output_questions), len(source_questions)],
        "question_paragraphs": [output_question_paragraphs, source_question_paragraphs],
        "question_paragraphs_semantic_exact": [exact_question_paragraphs, source_question_paragraphs],
        "analysis_paragraphs": [len(output_analysis_nodes), len(source_analysis_nodes)],
        "drawings": [
            count_named(output_relevant, {"drawing", "pict", "shape"}),
            count_named(source_relevant, {"drawing", "pict", "shape"}),
        ],
        "math_objects": [
            count_named(output_relevant, {"oMath", "oMathPara"}),
            count_named(source_relevant, {"oMath", "oMathPara"}),
        ],
        "tables": [
            len(output_root.xpath(".//w:body/w:tbl", namespaces=NS)),
            len(source_root.xpath(".//w:body/w:tbl", namespaces=NS)),
        ],
        "media_files": [
            sum(name.startswith(("media/", "word/media/")) for name in output_names),
            sum(name.startswith(("media/", "word/media/")) for name in source_names),
        ],
    }
    text_similarity = sum(similarities) / len(similarities) if similarities else 0.0
    score = (
        ratio(*metrics["question_count"]) * 10
        + text_similarity * 30
        + ratio(*metrics["question_paragraphs"]) * 15
        + ratio(*metrics["analysis_paragraphs"]) * 20
        + ratio(*metrics["drawings"]) * 10
        + ratio(*metrics["math_objects"]) * 10
        + ratio(*metrics["tables"]) * 5
    )
    output_xml = etree.tostring(output_root, encoding="unicode")
    return {
        "score": round(score, 2),
        "question_text_similarity": round(text_similarity * 100, 2),
        "question_similarity_min": round((min(similarities) if similarities else 0.0) * 100, 2),
        "metrics": {
            key: {"output": value[0], "source": value[1]} for key, value in metrics.items()
        },
        "placeholder_remaining": "__ZHITI_RAW_" in output_xml,
        "footer_noise": "声明：试题解析著作权" in output_xml or "weixin.jyeoo.com" in output_xml,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--threshold", type=float, default=90.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = compare(args.source, args.output)
    result["threshold"] = args.threshold
    result["passed"] = result["score"] >= args.threshold and not result["placeholder_remaining"]
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(
            f"completion_score={result['score']:.2f}% "
            f"threshold={args.threshold:.2f}% passed={result['passed']}"
        )
        print(
            f"question_text_similarity={result['question_text_similarity']:.2f}% "
            f"min={result['question_similarity_min']:.2f}%"
        )
        for name, values in result["metrics"].items():
            print(f"{name}={values['output']}/{values['source']}")
        print(f"placeholder_remaining={result['placeholder_remaining']}")
        print(f"footer_noise={result['footer_noise']}")
    return 0 if result["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
