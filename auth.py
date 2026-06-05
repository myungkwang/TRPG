import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, Header

SECRET_KEY = "change-this-secret-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]{3,19}$")
PASSWORD_RE = re.compile(r"^[A-Za-z0-9]{4,30}$")
NAME_RE = re.compile(r"^[가-힣A-Za-z]{2,30}$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def validate_signup(username: str, password: str, name: str, email: str):
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "아이디는 영문 시작, 영문+숫자 4~20자여야 합니다.")
    if not PASSWORD_RE.match(password):
        raise HTTPException(400, "비밀번호는 영문 또는 숫자 4~30자여야 합니다.")
    if not NAME_RE.match(name):
        raise HTTPException(400, "이름은 한글 또는 영문 2~30자여야 합니다.")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "이메일 형식이 올바르지 않습니다.")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: str, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "username": username,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_user_id_from_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "로그인이 필요합니다.")

    token = authorization.replace("Bearer ", "").strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        UUID(user_id)
        return user_id
    except Exception:
        raise HTTPException(401, "유효하지 않은 로그인 정보입니다.")