if (!localStorage.getItem("access_token")) {
  location.href = "/login";
}
function getToken() {
  return localStorage.getItem("access_token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
async function login(username, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.detail || "로그인 실패");
    return false;
  }

  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));

  return true;
}

async function signup(username, password, name, email) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password, name, email }),
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.detail || "회원가입 실패");
    return false;
  }

  alert("회원가입 완료. 이제 로그인해주세요.");
  return true;
}

function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
  localStorage.removeItem("persona_session_id");
  location.reload();
}

function requireLogin() {
  if (!getToken()) {
    chatLog.innerHTML = "";
    addMsg("gm", "로그인이 필요합니다. 먼저 회원가입 또는 로그인을 해주세요.");
    input.disabled = true;
    return false;
  }

  input.disabled = false;
  return true;
}
let sessionId = localStorage.getItem("persona_session_id") || null;

const chatLog = document.querySelector("#chatLog");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#chatInput");

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "gm"}`;
  div.innerHTML = `<strong>${role === "user" ? "플레이어" : "GM"}</strong>${escapeHtml(text)}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;

  if (role !== "user" && window.playNpcEmotion) {
    window.playNpcEmotion(text);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));
}

function setStatus(session) {
  document.querySelector("#location").textContent = session.location;
  document.querySelector("#job").textContent = session.job;
  document.querySelector("#talent").textContent = session.talent_grade;
  document.querySelector("#hp").textContent = session.hp;
  document.querySelector("#mp").textContent = session.mp;
  document.querySelector("#stamina").textContent = session.stamina;
}

async function newSession() {
  chatLog.innerHTML = "";
  const res = await fetch("/api/session", {
    method: "POST",
    headers: {
      ...authHeaders(),
    },
  });
  const data = await res.json();
  sessionId = data.session.id;
  localStorage.setItem("persona_session_id", sessionId);
  setStatus(data.session);
  addMsg("gm", data.intro);
}

async function loadSession() {
  if (!sessionId) return newSession();
  const res = await fetch(`/api/session/${sessionId}`, {
    headers: {
      ...authHeaders(),
    },
  });
  const res = await fetch(`/api/session/${sessionId}`, {
    headers: {
      ...authHeaders(),
    },
  });
  if (!res.ok) return newSession();
  const data = await res.json();
  setStatus(data.session);
  chatLog.innerHTML = "";
  for (const h of data.history) addMsg(h.role === "assistant" ? "gm" : "user", h.content);
}

async function sendMessage(message) {
  addMsg("user", message);
  input.value = "";
  input.disabled = true;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ session_id: sessionId, message })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "요청 실패");
    setStatus(data.session);
    addMsg("gm", data.answer);
  } catch (e) {
    addMsg("gm", `오류: ${e.message}`);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

async function moveTo(location) {
  addMsg("user", `${location}으로 이동한다.`);
  const res = await fetch("/api/move", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, location })
  });
  const data = await res.json();
  if (!res.ok) return addMsg("gm", `오류: ${data.detail || "이동 실패"}`);
  setStatus(data.session);
  addMsg("gm", data.answer);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (message) sendMessage(message);
});

document.querySelector("#newSessionBtn").addEventListener("click", newSession);
document.querySelectorAll(".tile[data-location]").forEach(btn => {
  btn.addEventListener("click", () => moveTo(btn.dataset.location));
});

document.querySelector("#loginBtn")?.addEventListener("click", async () => {
  const username = document.querySelector("#loginUsername").value.trim();
  const password = document.querySelector("#loginPassword").value.trim();

  const ok = await login(username, password);

  if (ok) {
    location.reload();
  }
});

document.querySelector("#signupBtn")?.addEventListener("click", async () => {
  const username = document.querySelector("#signupUsername").value.trim();
  const password = document.querySelector("#signupPassword").value.trim();
  const name = document.querySelector("#signupName").value.trim();
  const email = document.querySelector("#signupEmail").value.trim();

  await signup(username, password, name, email);
});

document.querySelector("#logoutBtn")?.addEventListener("click", logout);

if (requireLogin()) {
  loadSession();
}
