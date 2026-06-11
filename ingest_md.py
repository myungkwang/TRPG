"""마크다운(.md) 로어 문서를 RAG(pgvector)에 적재한다.

docs/lore/README.md 권장대로 '## 제목' 단위로 청킹해 검색 정확도를 높인다.
- 문서 맨 위 '# 제목' → documents.title
- 각 '## 소제목' 블록 → 하나의 chunk (chunks.section_title = 소제목)
- 한 섹션이 너무 길면 문자 단위로 추가 분할한다.

사용법:
    python ingest_md.py docs/lore/07-캐릭터생성.md      # 파일 1개
    python ingest_md.py docs/lore                       # 폴더 안 *.md 전부
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from db import get_conn
from llm import embed_text

MAX_CHARS = 1200
OVERLAP = 150


def _split_chars(text: str) -> list[str]:
    """긴 섹션을 MAX_CHARS 단위로 겹쳐가며 자른다 (ingest_docx와 동일 규칙)."""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + MAX_CHARS, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(text):
            break
        start = max(0, end - OVERLAP)
    return chunks


def parse_markdown(text: str) -> tuple[str, list[tuple[str, str]]]:
    """(문서제목, [(섹션제목, 본문), ...]) 로 파싱한다."""
    lines = text.splitlines()

    doc_title = ""
    sections: list[tuple[str, str]] = []
    cur_title = "intro"
    cur_body: list[str] = []

    def flush() -> None:
        body = "\n".join(cur_body).strip()
        if body:
            sections.append((cur_title, body))

    for line in lines:
        h1 = re.match(r"^#\s+(.*)", line)
        h2 = re.match(r"^##\s+(.*)", line)
        if h1 and not doc_title:
            doc_title = h1.group(1).strip()
            continue
        if h2:
            flush()
            cur_title = h2.group(1).strip()
            cur_body = []
            continue
        cur_body.append(line)
    flush()

    return doc_title, sections


def ingest_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    doc_title, sections = parse_markdown(text)
    if not doc_title:
        doc_title = path.stem
    if not sections:
        sections = [("body", text.strip())]

    total = 0
    with get_conn() as conn:
        doc_id = conn.execute(
            "INSERT INTO documents(title, source_path) VALUES (%s, %s) RETURNING id",
            (doc_title, str(path)),
        ).fetchone()[0]

        for section_title, body in sections:
            # 섹션 제목을 본문에 같이 임베딩해 맥락을 보존한다.
            for part in _split_chars(body):
                content = f"## {section_title}\n{part}" if section_title != "intro" else part
                emb = embed_text(content)
                conn.execute(
                    """
                    INSERT INTO chunks(document_id, section_title, content, embedding)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (doc_id, section_title, content, emb),
                )
                total += 1

    print(f"ingested '{doc_title}' (document_id={doc_id}, chunks={total}) <- {path.name}")
    return total


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("사용법: python ingest_md.py <파일.md | 폴더>")

    target = Path(sys.argv[1])
    if not target.exists():
        raise FileNotFoundError(target)

    files = sorted(target.glob("*.md")) if target.is_dir() else [target]
    files = [f for f in files if f.name.lower() != "readme.md"]
    if not files:
        raise SystemExit(f"적재할 .md 파일이 없습니다: {target}")

    grand = sum(ingest_file(f) for f in files)
    print(f"done. files={len(files)}, chunks={grand}")


if __name__ == "__main__":
    main()
