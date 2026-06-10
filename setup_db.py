from db import get_conn

DDL = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    source_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
    section_title TEXT,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(30) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(30) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
ON chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    player_name TEXT DEFAULT '당신',
    hp INT DEFAULT 20,
    mp INT DEFAULT 10,
    stamina INT DEFAULT 10,
    str INT DEFAULT 3,
    dex INT DEFAULT 3,
    int_stat INT DEFAULT 3,
    cha INT DEFAULT 3,
    talent_grade TEXT DEFAULT '반각자',
    job TEXT DEFAULT '변경 탐사꾼',
    location TEXT DEFAULT '재끝 진료소',
    inventory JSONB DEFAULT '{"동화": 30, "은화": 0, "금화": 0, "영정": 1, "items": ["d12 주사위"]}',
    flags JSONB DEFAULT '{}',
    relations JSONB DEFAULT '{"린": 0, "카르가스": 0, "제국 영석공사": 0}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_events (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE game_events
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 70%에서 확정된 엔딩(분기/서술/이미지)을 저장. 100%에서 그대로 공개.
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS ending JSONB;

-- 도감(계정 단위 영구 누적). 회차가 바뀌어도(베드엔딩 반복 등) 발견물이 쌓인다.
--   kind: 'clue'(해금단서) | 'ending'(도달한 엔딩) | 'character'(만난 인물)
--   key : 항목 식별자(단서명·엔딩명·인물id), data: 표시용 스냅샷(name/desc 등)
CREATE TABLE IF NOT EXISTS user_codex (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    unlocked_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, kind, key)
);
"""

def main():
    with get_conn() as conn:
        conn.execute(DDL)
    print("DB schema ready.")

if __name__ == "__main__":
    main()
