const message = document.querySelector("#authMessage");

document.querySelector("#signupBtn").addEventListener("click", async () => {
  const username = document.querySelector("#username").value.trim();
  const password = document.querySelector("#password").value.trim();
  const name = document.querySelector("#name").value.trim();
  const email = document.querySelector("#email").value.trim();

  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, name, email }),
  });

  const data = await response.json();

  if (!response.ok) {
    message.textContent = data.detail || "회원가입 실패";
    return;
  }

  alert("회원가입 완료. 로그인해주세요.");
  location.href = "/login";
});

document.querySelector("#backLoginBtn").addEventListener("click", () => {
  location.href = "/login";
});