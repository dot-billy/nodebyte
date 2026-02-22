document.addEventListener("DOMContentLoaded", async () => {
  const viewLogin = document.getElementById("view-login");
  const viewMain = document.getElementById("view-main");
  const loginError = document.getElementById("login-error");
  const mainMsg = document.getElementById("main-msg");
  const teamSelect = document.getElementById("team-select");

  let allNodes = [];
  let teams = [];

  function showView(view) {
    viewLogin.classList.toggle("hidden", view !== "login");
    viewMain.classList.toggle("hidden", view !== "main");
  }

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = `msg msg-${type}`;
    el.classList.remove("hidden");
    if (type === "success") setTimeout(() => el.classList.add("hidden"), 3000);
  }

  // ------ Tabs ------
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");

      if (tab.dataset.tab === "nodes") loadNodes();
    });
  });

  // ------ Auth check ------
  const settings = await getSettings();
  if (!settings.accessToken) {
    showView("login");
  } else {
    await showMainView();
  }

  // ------ Login ------
  document.getElementById("btn-login").addEventListener("click", handleLogin);
  document.getElementById("login-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  async function handleLogin() {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) return;

    loginError.classList.add("hidden");
    const btn = document.getElementById("btn-login");
    btn.disabled = true;
    btn.textContent = "Signing in...";

    try {
      await api.login(email, password);

      const s = await getSettings();
      if (!s.teamId) {
        const t = await api.listTeams();
        if (t.length > 0) {
          await api.selectTeam(t[0].id, t[0].name);
        }
      }

      await showMainView();
    } catch (err) {
      showMsg(loginError, err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  }

  // ------ Logout ------
  document.getElementById("btn-logout").addEventListener("click", async () => {
    await api.logout();
    showView("login");
  });

  // ------ Settings ------
  document.getElementById("btn-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("btn-open-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // ------ Team switcher ------
  teamSelect.addEventListener("change", async () => {
    const selected = teamSelect.options[teamSelect.selectedIndex];
    if (!selected || !selected.value) return;
    await api.selectTeam(selected.value, selected.textContent);
    allNodes = [];
    renderNodesList(allNodes);
    if (document.getElementById("tab-nodes").classList.contains("active")) {
      loadNodes();
    }
  });

  // ------ Add node ------
  document.getElementById("btn-add").addEventListener("click", async () => {
    const btn = document.getElementById("btn-add");
    btn.disabled = true;

    const name = document.getElementById("node-name").value.trim();
    const kind = document.getElementById("node-kind").value;
    const tags = document.getElementById("node-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const notes = document.getElementById("node-notes").value.trim() || null;
    const url = document.getElementById("site-url").textContent;

    if (!name) {
      showMsg(mainMsg, "Name is required.", "error");
      btn.disabled = false;
      return;
    }

    try {
      await api.createNode({ name, kind, url, tags, notes });
      showMsg(mainMsg, `"${name}" added!`, "success");
      document.getElementById("node-tags").value = "";
      document.getElementById("node-notes").value = "";
    } catch (err) {
      showMsg(mainMsg, err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // ------ Nodes search ------
  document.getElementById("nodes-search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderNodesList(allNodes);
      return;
    }
    const filtered = allNodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        (n.hostname && n.hostname.toLowerCase().includes(q)) ||
        (n.ip && n.ip.includes(q)) ||
        (n.url && n.url.toLowerCase().includes(q)) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
    renderNodesList(filtered);
  });

  // ------ Helpers ------
  async function showMainView() {
    showView("main");

    const s = await getSettings();

    try {
      teams = await api.listTeams();
      teamSelect.innerHTML = "";
      for (const team of teams) {
        const opt = document.createElement("option");
        opt.value = team.id;
        opt.textContent = team.name;
        if (team.id === s.teamId) opt.selected = true;
        teamSelect.appendChild(opt);
      }
    } catch {
      teamSelect.innerHTML = '<option value="">Error</option>';
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const url = new URL(tab.url || "about:blank");
        document.getElementById("site-title").textContent = tab.title || url.hostname;
        document.getElementById("site-url").textContent = tab.url;
        document.getElementById("site-favicon").src = tab.favIconUrl || "";
        document.getElementById("site-favicon").style.display = tab.favIconUrl ? "block" : "none";

        const suggestedName = (tab.title || url.hostname)
          .replace(/[^\w\s.-]/g, "")
          .trim()
          .substring(0, 80);
        document.getElementById("node-name").value = suggestedName;
      }
    } catch {}
  }

  async function loadNodes() {
    const loading = document.getElementById("nodes-loading");
    const listEl = document.getElementById("nodes-list");
    const countEl = document.getElementById("nodes-count");
    loading.classList.remove("hidden");
    listEl.classList.add("hidden");
    countEl.classList.add("hidden");

    const s = await getSettings();
    if (!s.teamId) {
      loading.textContent = "No team selected.";
      return;
    }

    try {
      allNodes = await api.listNodes(s.teamId, { limit: 200 });
      loading.classList.add("hidden");
      listEl.classList.remove("hidden");
      renderNodesList(allNodes);
    } catch (err) {
      loading.textContent = `Error: ${err.message}`;
    }
  }

  function renderNodesList(nodes) {
    const listEl = document.getElementById("nodes-list");
    const countEl = document.getElementById("nodes-count");

    listEl.innerHTML = "";

    if (nodes.length === 0) {
      listEl.classList.remove("hidden");
      countEl.classList.add("hidden");
      return;
    }

    for (const node of nodes) {
      const item = document.createElement("div");
      item.className = "node-item";

      const kindClass = `kind-${node.kind || "other"}`;

      const detail = node.url || node.hostname || node.ip || "";
      const nameTag = node.url
        ? `<a href="${escapeHtml(node.url)}" target="_blank" class="node-item-name">${escapeHtml(node.name)}</a>`
        : `<div class="node-item-name">${escapeHtml(node.name)}</div>`;

      item.innerHTML = `
        <div class="node-item-info">
          ${nameTag}
          <div class="node-item-detail">${escapeHtml(detail)}</div>
        </div>
        <span class="kind-badge ${kindClass}">${escapeHtml(node.kind)}</span>
      `;

      listEl.appendChild(item);
    }

    countEl.textContent = `${nodes.length} node${nodes.length !== 1 ? "s" : ""}`;
    countEl.classList.remove("hidden");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
});
