document.addEventListener("DOMContentLoaded", async () => {
  const apiUrlInput = document.getElementById("api-url");
  const msgEl = document.getElementById("msg");

  function showMsg(text, type) {
    msgEl.textContent = text;
    msgEl.className = `msg msg-${type}`;
    msgEl.classList.remove("hidden");
    if (type === "success") setTimeout(() => msgEl.classList.add("hidden"), 3000);
  }

  const settings = await getSettings();
  apiUrlInput.value = settings.apiUrl;

  document.getElementById("account-email").textContent = settings.email || "Not signed in";
  document.getElementById("account-team").textContent = settings.teamName || "None";

  document.getElementById("btn-save").addEventListener("click", async () => {
    const newUrl = apiUrlInput.value.trim().replace(/\/+$/, "");
    if (!newUrl) {
      showMsg("API URL is required.", "error");
      return;
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.apiUrl]: newUrl,
    });

    showMsg("Settings saved!", "success");
  });
});
