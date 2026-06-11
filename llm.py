from __future__ import annotations

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

def embed_text(text: str) -> list[float]:
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    return response.data[0].embedding

def chat(messages: list[dict], temperature: float = 0.8) -> str:
    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def chat_with_tools(messages: list[dict], tools: list[dict], temperature: float = 0.8):
    """툴(function calling)을 줘서 호출한다. 응답 메시지 객체를 그대로 돌려준다.

    반환값의 .tool_calls 가 있으면 모델이 도구를 부른 것이고, 없으면 .content 가 최종 서술.
    """
    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        tools=tools,
        temperature=temperature,
    )
    return response.choices[0].message
