const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const message = document.querySelector("#authMessage");

document.querySelector("#loginBtn").addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    message.textContent = data.detail || "로그인 실패";
    return;
  }

  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));
  localStorage.removeItem("persona_session_id");

  location.href = "/";
});

document.querySelector("#signupPageBtn").addEventListener("click", () => {
  location.href = "/signup";
});