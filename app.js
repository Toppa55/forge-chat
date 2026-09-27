const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE = {
  project: "forge.project.v1",
  checkpoints: "forge.checkpoints.v1",
  usage: "forge.usage.v1",
  budget: "forge.budget.v1",
  model: "forge.model.v1",
};

const PRICE_PER_MILLION = {
  "gpt-6-astra": { input: 10, output: 50 },
  "gpt-6-sol": { input: 2, output: 10 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
};

const seedProject = {
  "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Northstar</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="dashboard">
    <header>
      <div>
        <span class="eyebrow">MONDAY OVERVIEW</span>
        <h1>Good morning.</h1>
      </div>
      <button id="focusButton">Start focus</button>
    </header>
    <section class="stats">
      <article><span>Focus time</span><strong>3h 24m</strong><i>+18% this week</i></article>
      <article><span>Tasks done</span><strong>12 / 16</strong><i>4 left today</i></article>
      <article><span>Momentum</span><strong>86%</strong><i>Strong pace</i></article>
    </section>
    <section class="focus-card">
      <span class="eyebrow">NEXT UP</span>
      <h2>Ship the first useful version.</h2>
      <p>Protect a clear block of time and finish the work that matters most.</p>
    </section>
  </main>
  <script src="app.js"><\/script>
</body>
</html>`,
  "styles.css": `:root { font-family: Inter, system-ui, sans-serif; color: #f4f5f7; background: #0c1018; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 80% 0%, #273044, transparent 36%), #0c1018; }
.dashboard { width: min(920px, calc(100% - 32px)); margin: auto; padding: 64px 0; }
header { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
.eyebrow { color: #ffb02e; font-size: 12px; font-weight: 800; letter-spacing: .14em; }
h1 { margin: 8px 0 0; font-size: clamp(38px, 8vw, 72px); letter-spacing: -.06em; }
button { border: 0; border-radius: 12px; padding: 13px 18px; background: #ffb02e; color: #201404; font-weight: 800; cursor: pointer; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 48px 0 14px; }
.stats article, .focus-card { padding: 22px; border: 1px solid #273044; border-radius: 18px; background: rgba(21, 27, 39, .82); }
.stats span, .stats i { display: block; color: #8994a8; font-size: 13px; font-style: normal; }
.stats strong { display: block; margin: 10px 0 18px; font-size: 28px; }
.focus-card { padding: 34px; }
.focus-card h2 { margin: 11px 0 8px; font-size: 28px; }
.focus-card p { max-width: 580px; margin: 0; color: #a9b3c2; line-height: 1.6; }
@media (max-width: 650px) { .dashboard { padding: 34px 0; } header { align-items: start; flex-direction: column; } .stats { grid-template-columns: 1fr; margin-top: 32px; } }`,
  "app.js": `const button = document.querySelector('#focusButton');
button.addEventListener('click', () => {
  button.textContent = button.textContent === 'Start focus' ? 'Focus running · 25:00' : 'Start focus';
});`,
};

let project = loadJSON(STORAGE.project, seedProject);
let checkpoints = loadJSON(STORAGE.checkpoints, []);
let usage = loadJSON(STORAGE.usage, { input: 0, output: 0, cost: 0 });
let activeFile = Object.keys(project)[0] || "index.html";
let contextEnabled = true;
let conversation = [];
let mediaRecorder = null;
let audioChunks = [];
let previewTimer = null;
let toastTimer = null;

const els = {
  model: $("#modelSelect"), messages: $("#messages"), form: $("#chatForm"), prompt: $("#promptInput"),
  send: $("#sendButton"), context: $("#contextToggle"), contextStatus: $("#contextStatus"),
  record: $("#recordButton"), recordLabel: $("#recordLabel"), editor: $("#codeEditor"), lines: $("#lineNumbers"),
  fileList: $("#fileList"), tabs: $("#editorTabs"), preview: $("#previewFrame"), saveState: $("#saveState"),
  settings: $("#settingsDialog"), usageDialog: $("#usageDialog"), restoreDialog: $("#restoreDialog"),
  improveDialog: $("#improveDialog"), apiKey: $("#apiKeyInput"), adminKey: $("#adminKeyInput"),
  budget: $("#budgetInput"), connection: $("#connectionStatus"), toast: $("#toast"),
};

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? structuredClone(fallback); }
  catch { return structuredClone(fallback); }
}

function saveProject() {
  localStorage.setItem(STORAGE.project, JSON.stringify(project));
  els.saveState.textContent = "All changes saved locally";
  updateContextStatus();
}

function getApiKey() { return sessionStorage.getItem("forge.apiKey") || ""; }
function getAdminKey() { return sessionStorage.getItem("forge.adminKey") || ""; }

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function openDialog(dialog) {
  if (dialog?.showModal) dialog.showModal();
}

function renderProject() {
  if (!project[activeFile]) activeFile = Object.keys(project)[0];
  els.fileList.innerHTML = Object.keys(project).map(name => `
    <button class="file-button ${name === activeFile ? "active" : ""}" type="button" data-file="${escapeAttr(name)}">
      <span class="file-glyph">${fileGlyph(name)}</span><span>${escapeHTML(name)}</span>
    </button>`).join("");
  els.tabs.innerHTML = `<button class="editor-tab active" type="button"><span class="file-glyph">${fileGlyph(activeFile)}</span>${escapeHTML(activeFile)}</button>`;
  els.editor.value = project[activeFile] || "";
  $("#languageStatus").textContent = languageFor(activeFile);
  updateLines();
  updatePreview();
  updateContextStatus();
}

function fileGlyph(name) {
  if (name.endsWith(".html")) return "◇";
  if (name.endsWith(".css")) return "#";
  if (name.endsWith(".js")) return "JS";
  return "·";
}

function languageFor(name) {
  if (name.endsWith(".html")) return "HTML";
  if (name.endsWith(".css")) return "CSS";
  if (name.endsWith(".js")) return "JavaScript";
  return "Plain text";
}

function updateLines() {
  const count = Math.max(1, els.editor.value.split("\n").length);
  els.lines.textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
}

function updateCursor() {
  const before = els.editor.value.slice(0, els.editor.selectionStart);
  const lines = before.split("\n");
  $("#cursorStatus").textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
}

function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const html = project["index.html"] || "<main><h1>Add index.html to preview your project.</h1></main>";
    const css = project["styles.css"] || "";
    const js = project["app.js"] || "";
    let doc = html.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i, `<style>${css}</style>`);
    doc = doc.replace(/<script[^>]*src=["']app\.js["'][^>]*><\/script>/i, `<script>${js.replace(/<\/script>/gi, "<\\/script>")}<\/script>`);
    els.preview.srcdoc = doc;
  }, 220);
}

function updateContextStatus() {
  els.contextStatus.textContent = `${Object.keys(project).length} files ${contextEnabled ? "synced" : "paused"}`;
}

function projectContext() {
  if (!contextEnabled) return "Workspace context is disabled.";
  const maxTotal = 50000;
  let total = 0;
  const chunks = [];
  for (const [name, content] of Object.entries(project)) {
    const room = maxTotal - total;
    if (room <= 0) break;
    const slice = content.slice(0, room);
    chunks.push(`FILE: ${name}\n${slice}`);
    total += slice.length;
  }
  return `The user is editing this live workspace. Treat it as current source of truth.\n\n${chunks.join("\n\n---\n\n")}`;
}

function addMessage(role, text, state = "") {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"} ${state}`;
  article.innerHTML = `
    <div class="message-avatar">${role === "user" ? "ME" : "F"}</div>
    <div class="message-body">
      <div class="message-meta"><strong>${role === "user" ? "You" : "Forge"}</strong><span>${state === "loading" ? "thinking" : "now"}</span></div>
      <p></p>
    </div>`;
  $("p", article).textContent = text;
  els.messages.appendChild(article);
  els.messages.scrollTop = els.messages.scrollHeight;
  return article;
}

function extractResponseText(data) {
  if (data.output_text) return data.output_text;
  return (data.output || []).flatMap(item => item.content || []).filter(part => part.type === "output_text").map(part => part.text).join("\n");
}

async function callOpenAI({ input, instructions, model = els.model.value, format }) {
  const key = getApiKey();
  if (!key) throw new Error("Add your OpenAI API key in Settings first.");
  const body = { model, input, instructions, store: false };
  if (format) body.text = { format };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `OpenAI request failed (${response.status}).`);
  trackUsage(data.usage, model);
  return data;
}

function trackUsage(apiUsage = {}, model) {
  const input = apiUsage.input_tokens || 0;
  const output = apiUsage.output_tokens || 0;
  const price = PRICE_PER_MILLION[model] || { input: 0, output: 0 };
  const cost = input / 1e6 * price.input + output / 1e6 * price.output;
  usage.input += input;
  usage.output += output;
  usage.cost += cost;
  localStorage.setItem(STORAGE.usage, JSON.stringify(usage));
  updateUsageUI();
}

function updateUsageUI(exactCost = null) {
  const used = exactCost ?? usage.cost;
  const budget = Math.max(0, Number(localStorage.getItem(STORAGE.budget) || 20));
  const remaining = Math.max(0, budget - used);
  $("#usageAmount").textContent = `$${used.toFixed(4)}`;
  $("#usedAmount").textContent = `$${used.toFixed(4)}`;
  $("#remainingAmount").textContent = `$${remaining.toFixed(2)}`;
  $("#tokenAmount").textContent = (usage.input + usage.output).toLocaleString();
  $("#inputTokens").textContent = usage.input.toLocaleString();
  $("#outputTokens").textContent = usage.output.toLocaleString();
  $("#usageBar").style.width = `${budget ? Math.min(100, used / budget * 100) : 0}%`;
}

async function sendChat(text) {
  addMessage("user", text);
  conversation.push({ role: "user", content: text });
  const loading = addMessage("assistant", "Working through that…", "loading");
  els.send.disabled = true;
  try {
    const input = conversation.slice(-12).map(item => ({ role: item.role, content: item.content }));
    const data = await callOpenAI({
      input,
      instructions: `You are Forge, a precise, practical personal AI assistant. Help the user plan and build. When code is relevant, refer to the live workspace context below and acknowledge manual edits as authoritative. Do not claim that browser-side files are already deployed.\n\n${projectContext()}`,
    });
    const answer = extractResponseText(data) || "I completed the request but received no text output.";
    loading.remove();
    addMessage("assistant", answer);
    conversation.push({ role: "assistant", content: answer });
  } catch (error) {
    loading.remove();
    addMessage("assistant", error.message);
    showToast(error.message);
    if (!getApiKey()) openSettings();
  } finally {
    els.send.disabled = false;
  }
}

function autoResizePrompt() {
  els.prompt.style.height = "auto";
  els.prompt.style.height = `${Math.min(160, els.prompt.scrollHeight)}px`;
}

function openSettings() {
  els.apiKey.value = getApiKey();
  els.adminKey.value = getAdminKey();
  els.budget.value = localStorage.getItem(STORAGE.budget) || "20";
  els.connection.className = `connection-test ${getApiKey() ? "success" : ""}`;
  els.connection.innerHTML = `<span></span>${getApiKey() ? "Key saved for this tab" : "Not connected"}`;
  openDialog(els.settings);
}

async function saveAndTestSettings(event) {
  event.preventDefault();
  const key = els.apiKey.value.trim();
  const adminKey = els.adminKey.value.trim();
  if (!key) { showToast("Enter an OpenAI API key."); return; }
  sessionStorage.setItem("forge.apiKey", key);
  if (adminKey) sessionStorage.setItem("forge.adminKey", adminKey); else sessionStorage.removeItem("forge.adminKey");
  localStorage.setItem(STORAGE.budget, String(Math.max(0, Number(els.budget.value || 0))));
  els.connection.className = "connection-test";
  els.connection.innerHTML = "<span></span>Testing connection…";
  $("#saveSettingsButton").disabled = true;
  try {
    const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "Could not verify this key.");
    els.connection.className = "connection-test success";
    els.connection.innerHTML = "<span></span>Connected to OpenAI";
    hydrateModels(data.data || []);
    if (adminKey) await fetchAdminUsage();
    setTimeout(() => els.settings.close(), 550);
    showToast("Connected. Your key is available for this tab only.");
  } catch (error) {
    els.connection.className = "connection-test error";
    els.connection.innerHTML = `<span></span>${escapeHTML(error.message)}`;
  } finally { $("#saveSettingsButton").disabled = false; updateUsageUI(); }
}

function hydrateModels(models) {
  const preferred = ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"];
  const available = new Set(models.map(m => m.id));
  const options = preferred.filter(id => available.has(id));
  if (!options.length) return;
  const current = els.model.value;
  els.model.innerHTML = options.map(id => `<option value="${id}">${modelLabel(id)}</option>`).join("");
  els.model.value = options.includes(current) ? current : options[0];
}

function modelLabel(id) {
  return ({ "gpt-6-astra": "GPT-6 Astra · strongest", "gpt-6-sol": "GPT-6 Sol · balanced", "gpt-6-luna": "GPT-6 Luna · fastest" })[id] || id;
}

async function fetchAdminUsage() {
  const key = getAdminKey();
  if (!key) return;
  const start = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
  const response = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${start}&bucket_width=1d`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Admin usage could not be loaded.");
  let total = 0;
  for (const bucket of data.data || []) for (const result of bucket.results || []) total += Number(result.amount?.value || 0);
  updateUsageUI(total);
  $("#usageSource").textContent = "Exact organization costs for this month from the OpenAI Admin API. Remaining is measured against your app budget.";
}

async function toggleRecording() {
  if (mediaRecorder?.state === "recording") { mediaRecorder.stop(); return; }
  if (!getApiKey()) { openSettings(); showToast("Connect your API key before dictating."); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { showToast("Speech recording is not supported in this browser."); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported(type)) || "";
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    audioChunks = [];
    mediaRecorder.ondataavailable = event => { if (event.data.size) audioChunks.push(event.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      els.record.classList.remove("recording");
      els.recordLabel.textContent = "Dictate";
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      await transcribe(blob);
    };
    mediaRecorder.start();
    els.record.classList.add("recording");
    els.recordLabel.textContent = "Stop";
    showToast("Listening… tap again to transcribe.");
  } catch (error) { showToast(error.message || "Microphone access was not available."); }
}

async function transcribe(blob) {
  els.record.disabled = true;
  els.recordLabel.textContent = "Writing…";
  try {
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.append("file", blob, `dictation.${extension}`);
    form.append("model", "gpt-transcribe");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${getApiKey()}` }, body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "Transcription failed.");
    els.prompt.value = `${els.prompt.value}${els.prompt.value ? " " : ""}${data.text || ""}`;
    autoResizePrompt();
    els.prompt.focus();
    showToast("Speech added to your message.");
  } catch (error) { showToast(error.message); }
  finally { els.record.disabled = false; els.recordLabel.textContent = "Dictate"; }
}

function createCheckpoint(label, fixed = false) {
  const point = { id: crypto.randomUUID(), label, createdAt: new Date().toISOString(), fixed, files: structuredClone(project) };
  checkpoints.unshift(point);
  checkpoints = checkpoints.slice(0, 20);
  localStorage.setItem(STORAGE.checkpoints, JSON.stringify(checkpoints));
  renderCheckpoints();
  return point;
}

function ensureFactoryCheckpoint() {
  if (!checkpoints.some(point => point.fixed)) {
    checkpoints.push({ id: "factory", label: "Factory workspace", createdAt: new Date().toISOString(), fixed: true, files: structuredClone(seedProject) });
    localStorage.setItem(STORAGE.checkpoints, JSON.stringify(checkpoints));
  }
}

function renderCheckpoints() {
  ensureFactoryCheckpoint();
  $("#checkpointList").innerHTML = checkpoints.map(point => `
    <div class="checkpoint-item">
      <div><strong>${escapeHTML(point.label)} ${point.fixed ? "· fixed" : ""}</strong><span>${new Date(point.createdAt).toLocaleString()} · ${Object.keys(point.files).length} files</span></div>
      <button class="secondary-button" type="button" data-restore="${point.id}">Restore</button>
    </div>`).join("");
}

function restoreCheckpoint(id) {
  const point = checkpoints.find(item => item.id === id);
  if (!point) return;
  createCheckpoint("Before restore");
  project = structuredClone(point.files);
  activeFile = Object.keys(project)[0];
  saveProject();
  renderProject();
  els.restoreDialog.close();
  showToast(`Restored “${point.label}”.`);
}

async function improveProject(event) {
  event.preventDefault();
  const request = $("#improvePrompt").value.trim();
  if (!request) { showToast("Describe the improvement first."); return; }
  if (!getApiKey()) { els.improveDialog.close(); openSettings(); return; }
  const button = $("#runImproveButton");
  button.disabled = true; button.textContent = "Designing upgrade…";
  try {
    const schema = {
      type: "json_schema",
      name: "workspace_upgrade",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          files: { type: "array", items: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
        },
        required: ["summary", "files"],
      },
    };
    const data = await callOpenAI({
      input: `Requested improvement: ${request}\n\n${projectContext()}`,
      instructions: "You are a senior frontend engineer improving a small browser project. Return complete replacement contents only for files that should change. Keep the project runnable as plain HTML, CSS, and JavaScript with no build step. Respect the user's request and preserve useful existing behavior.",
      format: schema,
    });
    const result = JSON.parse(extractResponseText(data));
    if (!result.files?.length) throw new Error("The AI did not propose any file changes.");
    createCheckpoint(`Before AI upgrade · ${request.slice(0, 42)}`);
    for (const file of result.files) {
      if (!file.path || file.path.includes("..") || file.path.startsWith("/")) continue;
      project[file.path] = file.content;
    }
    activeFile = result.files[0]?.path || activeFile;
    saveProject();
    renderProject();
    els.improveDialog.close();
    $("#improvePrompt").value = "";
    addMessage("assistant", `Workspace upgraded: ${result.summary}`);
    showToast("Upgrade applied. A restore point was saved first.");
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; button.textContent = "Create upgrade"; }
}

function setView(view) {
  $$("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (view === "history") { renderCheckpoints(); openDialog(els.restoreDialog); return; }
  document.body.dataset.mobileView = view;
  if (window.innerWidth > 760) {
    if (view === "chat") { $(".chat-panel").style.display = "flex"; $(".studio-panel").style.display = "flex"; }
    if (view === "code") { $(".chat-panel").style.display = "none"; $(".workspace").style.gridTemplateColumns = "64px 1fr"; }
  }
}

function resetDesktopView() {
  if (window.innerWidth > 760) {
    $(".chat-panel").style.display = "flex";
    $(".studio-panel").style.display = "flex";
    $(".workspace").style.gridTemplateColumns = "64px minmax(330px, 38vw) 1fr";
  } else {
    $(".chat-panel").style.display = "";
    $(".studio-panel").style.display = "";
    $(".workspace").style.gridTemplateColumns = "";
  }
}

function escapeHTML(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function escapeAttr(value = "") { return escapeHTML(value); }

els.form.addEventListener("submit", event => {
  event.preventDefault();
  const text = els.prompt.value.trim();
  if (!text) return;
  els.prompt.value = ""; autoResizePrompt(); sendChat(text);
});
els.prompt.addEventListener("input", autoResizePrompt);
els.prompt.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); els.form.requestSubmit(); } });
els.context.addEventListener("click", () => {
  contextEnabled = !contextEnabled;
  els.context.classList.toggle("active", contextEnabled);
  els.context.setAttribute("aria-pressed", String(contextEnabled));
  els.context.innerHTML = `<span class="mini-dot"></span> Workspace context ${contextEnabled ? "on" : "off"}`;
  updateContextStatus();
});
els.model.addEventListener("change", () => localStorage.setItem(STORAGE.model, els.model.value));
els.editor.addEventListener("input", () => {
  els.saveState.textContent = "Saving…";
  project[activeFile] = els.editor.value;
  updateLines(); updateCursor(); saveProject(); updatePreview();
});
els.editor.addEventListener("scroll", () => { els.lines.scrollTop = els.editor.scrollTop; });
els.editor.addEventListener("click", updateCursor);
els.editor.addEventListener("keyup", updateCursor);
els.editor.addEventListener("keydown", event => {
  if (event.key === "Tab") {
    event.preventDefault();
    const start = els.editor.selectionStart, end = els.editor.selectionEnd;
    els.editor.setRangeText("  ", start, end, "end");
    els.editor.dispatchEvent(new Event("input"));
  }
});
els.fileList.addEventListener("click", event => {
  const button = event.target.closest("[data-file]");
  if (!button) return;
  activeFile = button.dataset.file; renderProject();
});
$("#checkpointList").addEventListener("click", event => { const button = event.target.closest("[data-restore]"); if (button) restoreCheckpoint(button.dataset.restore); });
$("#settingsButton").addEventListener("click", openSettings);
$("#avatarButton").addEventListener("click", openSettings);
$("#usageButton").addEventListener("click", async () => { openDialog(els.usageDialog); if (getAdminKey()) try { await fetchAdminUsage(); } catch (error) { showToast(error.message); } });
$("#showKeyButton").addEventListener("click", () => { const show = els.apiKey.type === "password"; els.apiKey.type = show ? "text" : "password"; $("#showKeyButton").textContent = show ? "Hide" : "Show"; });
$("#settingsForm").addEventListener("submit", saveAndTestSettings);
els.record.addEventListener("click", toggleRecording);
$("#checkpointButton").addEventListener("click", () => { createCheckpoint("Manual save point"); showToast("Restore point saved."); });
$("#improveButton").addEventListener("click", () => openDialog(els.improveDialog));
$("#improveForm").addEventListener("submit", improveProject);
$("#refreshPreview").addEventListener("click", updatePreview);
$("#addFileButton").addEventListener("click", () => {
  const name = window.prompt("New file name", "notes.txt")?.trim();
  if (!name || name.includes("..") || name.startsWith("/") || project[name] !== undefined) return;
  project[name] = ""; activeFile = name; saveProject(); renderProject();
});
$("#newChatButton").addEventListener("click", () => { conversation = []; $$(".message", els.messages).slice(1).forEach(node => node.remove()); showToast("Started a fresh chat."); });
$$('[data-close]').forEach(button => button.addEventListener("click", () => $("#" + button.dataset.close)?.close()));
$$('[data-view]').forEach(button => button.addEventListener("click", () => { if (button.dataset.view === "chat") resetDesktopView(); setView(button.dataset.view); }));
$$('[data-prompt]').forEach(button => button.addEventListener("click", () => { els.prompt.value = button.dataset.prompt; autoResizePrompt(); els.prompt.focus(); }));
window.addEventListener("resize", resetDesktopView);

ensureFactoryCheckpoint();
els.model.value = localStorage.getItem(STORAGE.model) || "gpt-6-sol";
updateUsageUI();
renderProject();
renderCheckpoints();
document.body.dataset.mobileView = "chat";
if (!getApiKey()) setTimeout(openSettings, 650);
