from __future__ import annotations

from db import get_conn
from llm import embed_text


def retrieve_context(query: str, limit: int = 5) -> list[dict]:
    query_embedding = embed_text(query)
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT c.id, d.title, c.section_title, c.content,
                   1 - (c.embedding <=> %s::vector) AS similarity
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
            """,
            (query_embedding, query_embedding, limit),
        ).fetchall()

    return [
        {
            "chunk_id": row[0],
            "document_title": row[1],
            "section_title": row[2],
            "content": row[3],
            "similarity": float(row[4]),
        }
        for row in rows
    ]
