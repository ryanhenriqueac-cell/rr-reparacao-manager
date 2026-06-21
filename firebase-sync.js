import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const APP_KEYS = ["rr_clientes", "rr_veiculos", "rr_servicos", "rr_orcamentos", "rr_financeiro"];
const SYNC_FLAG = "rr_firebase_loaded_user";
const REMEMBER_KEY = "rr_firebase_remember";
const ADMIN_WORKSPACE_KEY = "rr_admin_workspace_id";
const config = window.firebaseConfig || {};
const adminAccess = window.rrAdminAccess || {};
const ADMIN_EMAILS = Array.isArray(adminAccess.adminEmails)
  ? adminAccess.adminEmails.map((email) => normalizeEmail(email)).filter(Boolean)
  : [];
const configReady = Boolean(config.apiKey && config.apiKey !== "COLE_AQUI" && config.projectId && config.projectId !== "COLE_AQUI");

let auth;
let db;
let currentUser = null;
let activeWorkspaceId = null;
let activeWorkspaceEmail = "";
let saveTimer = null;
let cloudReady = false;
let syncingFromCloud = false;
let adminWorkspaces = [];
window.rrFirebaseReady = false;

buildAuthShell();

if (!configReady) {
  showAuthMessage("Configure o Firebase em firebase-config.js para ativar login e banco online.");
  setAppLocked(true);
} else {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  patchLocalStorageSync();
  bindAuthEvents();

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    cloudReady = false;

    if (!user) {
      sessionStorage.removeItem(SYNC_FLAG);
      sessionStorage.removeItem(ADMIN_WORKSPACE_KEY);
      activeWorkspaceId = null;
      activeWorkspaceEmail = "";
      setAppLocked(true);
      setAdminSelecting(false);
      setUserStatus("");
      return;
    }

    activeWorkspaceId = getWorkspaceId(user);
    activeWorkspaceEmail = "";

    if (isAdminUser(user) && !activeWorkspaceId) {
      setAppLocked(false);
      setAdminSelecting(true);
      setUserStatus(user.email);
      await renderAdminDashboard();
      return;
    }

    setAdminSelecting(false);
    setUserStatus(user.email);
    setAppLocked(false);
    await loadCloudData(activeWorkspaceId);
    setUserStatus(user.email);
    cloudReady = true;
    window.rrFirebaseReady = true;

    if (sessionStorage.getItem(SYNC_FLAG) !== activeWorkspaceId) {
      sessionStorage.setItem(SYNC_FLAG, activeWorkspaceId);
      window.location.reload();
    }
  });
}

function createPublicShareId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

window.rrPublishPublicOrcamento = async (data) => {
  if (!currentUser || !db) throw new Error("Login indisponível para publicar orçamento.");
  const id = createPublicShareId();
  await setDoc(doc(db, "public_orcamentos", id), {
    owner: activeWorkspaceId || currentUser.uid,
    ownerUid: currentUser.uid,
    createdAt: serverTimestamp(),
    data
  });
  return id;
};

function buildAuthShell() {
  const shell = document.createElement("div");
  shell.id = "firebaseAuthShell";
  shell.innerHTML = `
    <div class="auth-card">
      <img src="assets/logo-rr.png" alt="RR Reparação Automotiva">
      <h1>RR Reparação Manager</h1>
      <p>Entre para sincronizar clientes, orçamentos e financeiro na nuvem.</p>
      <form id="firebaseLoginForm">
        <input id="firebaseEmail" type="email" placeholder="E-mail" autocomplete="email" required>
        <div class="password-field">
          <input id="firebasePassword" type="password" placeholder="Senha" autocomplete="current-password" required>
          <button type="button" id="toggleFirebasePassword" aria-label="Mostrar senha" title="Mostrar senha">&#128065;</button>
        </div>
        <label class="remember-login">
          <input id="firebaseRemember" type="checkbox">
          <span>Lembrar meu acesso neste computador</span>
        </label>
        <button class="btn btn-primary" type="submit">Entrar</button>
        <button class="btn btn-muted" type="button" id="firebaseCreateAccount">Criar acesso</button>
      </form>
      <span id="firebaseAuthMessage"></span>
    </div>
  `;
  document.body.appendChild(shell);
  hydrateRememberedLogin();

  const adminShell = document.createElement("div");
  adminShell.id = "firebaseAdminShell";
  adminShell.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-header">
        <img src="assets/logo-rr.png" alt="RR ReparaÃ§Ã£o Automotiva">
        <div>
          <span>Admin RR</span>
          <h1>Painel de acessos</h1>
          <p>Escolha um cadastro para abrir o sistema completo.</p>
        </div>
      </div>
      <input id="firebaseAdminSearch" class="admin-search" type="search" placeholder="Buscar por e-mail" autocomplete="off">
      <div id="firebaseAdminMessage" class="admin-message"></div>
      <div id="firebaseAdminList" class="admin-workspace-list"></div>
      <button class="btn btn-muted" type="button" id="firebaseAdminLogout">Sair</button>
    </div>
  `;
  document.body.appendChild(adminShell);

  const bar = document.createElement("div");
  bar.id = "firebaseUserBar";
  bar.innerHTML = `
    <span id="firebaseUserStatus"></span>
    <button class="btn btn-muted" type="button" id="firebaseAdminBack" hidden>Admin</button>
    <button class="btn btn-muted" type="button" id="firebaseLogout">Sair</button>
  `;
  document.body.appendChild(bar);
}

function bindAuthEvents() {
  document.getElementById("firebaseLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await login();
  });

  document.getElementById("firebaseCreateAccount").addEventListener("click", createAccount);
  document.getElementById("firebaseLogout").addEventListener("click", () => signOut(auth));
  document.getElementById("firebaseAdminLogout").addEventListener("click", () => signOut(auth));
  document.getElementById("firebaseAdminBack").addEventListener("click", backToAdminDashboard);
  document.getElementById("toggleFirebasePassword").addEventListener("click", togglePasswordVisibility);
}

async function login() {
  const emailInput = document.getElementById("firebaseEmail");
  const email = normalizeEmail(emailInput.value);
  const password = document.getElementById("firebasePassword").value;
  try {
    emailInput.value = email;
    showAuthMessage("Entrando...");
    await signInWithEmailAndPassword(auth, email, password);
    saveRememberedLogin(email, password);
  } catch (error) {
    showAuthMessage(firebaseError(error));
  }
}

async function createAccount() {
  const emailInput = document.getElementById("firebaseEmail");
  const email = normalizeEmail(emailInput.value);
  const password = document.getElementById("firebasePassword").value;
  try {
    emailInput.value = email;
    if (!email) {
      showAuthMessage("Informe um e-mail para criar o acesso.");
      return;
    }
    showAuthMessage("Criando acesso...");
    const existingMethods = await fetchSignInMethodsForEmail(auth, email);
    if (existingMethods.length) {
      showAuthMessage("Este e-mail já tem acesso. Use Entrar ou recupere a senha no Firebase.");
      return;
    }
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    currentUser = credential.user;
    activeWorkspaceId = getWorkspaceId(currentUser) || currentUser.uid;
    activeWorkspaceEmail = currentUser.email;
    saveRememberedLogin(email, password);
    await saveCloudData();
  } catch (error) {
    showAuthMessage(firebaseError(error));
  }
}

function hydrateRememberedLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY)) || {};
    if (!saved.email || !saved.password) return;
    document.getElementById("firebaseEmail").value = saved.email;
    document.getElementById("firebasePassword").value = saved.password;
    document.getElementById("firebaseRemember").checked = true;
  } catch (error) {
    localStorage.removeItem(REMEMBER_KEY);
  }
}

function saveRememberedLogin(email, password) {
  const remember = document.getElementById("firebaseRemember").checked;
  if (!remember) {
    localStorage.removeItem(REMEMBER_KEY);
    return;
  }
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }));
}

function togglePasswordVisibility() {
  const password = document.getElementById("firebasePassword");
  const button = document.getElementById("toggleFirebasePassword");
  const visible = password.type === "text";
  password.type = visible ? "password" : "text";
  button.innerHTML = visible ? "&#128065;" : "&#9679;";
  button.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
  button.title = visible ? "Mostrar senha" : "Ocultar senha";
}

async function loadCloudData(uid) {
  try {
    showAuthMessage("Sincronizando dados...");
    const snap = await getDoc(doc(db, "workspaces", uid));
    if (!snap.exists()) {
      await saveCloudData();
      showAuthMessage("");
      return;
    }

    const cloudData = snap.data() || {};
    activeWorkspaceEmail = cloudData.ownerEmail || activeWorkspaceEmail;
    const data = cloudData.data || {};
    syncingFromCloud = true;
    APP_KEYS.forEach((key) => {
      localStorage.setItem(key, JSON.stringify(Array.isArray(data[key]) ? data[key] : []));
    });
    syncingFromCloud = false;
    showAuthMessage("");
  } catch (error) {
    syncingFromCloud = false;
    showAuthMessage(firebaseError(error));
  }
}

async function saveCloudData() {
  if (!currentUser || !db || !activeWorkspaceId) return;

  const data = {};
  APP_KEYS.forEach((key) => {
    data[key] = JSON.parse(localStorage.getItem(key)) || [];
  });

  await setDoc(doc(db, "workspaces", activeWorkspaceId), {
    owner: activeWorkspaceId,
    ownerUid: currentUser.uid,
    ownerEmail: activeWorkspaceEmail || currentUser.email,
    activeByAdmin: isAdminUser(currentUser),
    updatedAt: serverTimestamp(),
    data
  }, { merge: true });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminUser(user) {
  return ADMIN_EMAILS.includes(normalizeEmail(user?.email));
}

function getWorkspaceId(user) {
  if (!isAdminUser(user)) return user.uid;
  return sessionStorage.getItem(ADMIN_WORKSPACE_KEY) || "";
}

async function renderAdminDashboard() {
  if (!isAdminUser(currentUser)) return;
  const list = document.getElementById("firebaseAdminList");
  const message = document.getElementById("firebaseAdminMessage");
  const search = document.getElementById("firebaseAdminSearch");
  if (!list || !message) return;

  message.textContent = "Carregando cadastros...";
  list.innerHTML = "";
  if (search) search.value = "";

  try {
    const snap = await getDocs(collection(db, "workspaces"));
    adminWorkspaces = dedupeWorkspaces(snap.docs
      .map((item) => ({ id: item.id, ...(item.data() || {}) }))
      .filter((item) => item.ownerEmail || item.ownerUid || item.owner)
      .filter((item) => !ADMIN_EMAILS.includes(normalizeEmail(item.ownerEmail)))
      .sort((a, b) => String(a.ownerEmail || a.id).localeCompare(String(b.ownerEmail || b.id))));

    renderAdminWorkspaceList();
    if (search) search.oninput = renderAdminWorkspaceList;
  } catch (error) {
    message.textContent = firebaseError(error);
  }
}

function renderAdminWorkspaceList() {
  const list = document.getElementById("firebaseAdminList");
  const message = document.getElementById("firebaseAdminMessage");
  const search = document.getElementById("firebaseAdminSearch");
  if (!list || !message) return;

  const query = normalizeEmail(search?.value || "");
  const filtered = adminWorkspaces.filter((workspace) => normalizeEmail(workspace.ownerEmail || workspace.id).includes(query));

  if (!adminWorkspaces.length) {
    message.textContent = "Nenhum cadastro encontrado ainda.";
    list.innerHTML = "";
    return;
  }

  message.textContent = query
    ? `${filtered.length} de ${adminWorkspaces.length} cadastro(s) encontrado(s).`
    : `${adminWorkspaces.length} cadastro(s) encontrado(s).`;

  if (!filtered.length) {
    list.innerHTML = `<div class="admin-empty">Nenhum e-mail encontrado para essa busca.</div>`;
    return;
  }

  list.innerHTML = filtered.map((workspace) => {
    const email = workspace.ownerEmail || "Sem e-mail salvo";
    const clientes = Array.isArray(workspace.data?.rr_clientes) ? workspace.data.rr_clientes.length : 0;
    const orcamentos = Array.isArray(workspace.data?.rr_orcamentos) ? workspace.data.rr_orcamentos.length : 0;
    return `
      <button class="admin-workspace-item" type="button" data-workspace-id="${escapeHtml(workspace.id)}" data-workspace-email="${escapeHtml(email)}">
        <strong>${escapeHtml(email)}</strong>
        <span>${clientes} clientes | ${orcamentos} orçamentos</span>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-workspace-id]").forEach((button) => {
    button.addEventListener("click", () => openAdminWorkspace(button.dataset.workspaceId, button.dataset.workspaceEmail));
  });
}

function getWorkspaceDataScore(workspace) {
  return APP_KEYS.reduce((total, key) => {
    const items = workspace.data?.[key];
    return total + (Array.isArray(items) ? items.length : 0);
  }, 0);
}

function dedupeWorkspaces(workspaces) {
  const byEmail = new Map();
  workspaces.forEach((workspace) => {
    const email = normalizeEmail(workspace.ownerEmail);
    const key = email || workspace.id;
    const current = byEmail.get(key);
    if (!current || getWorkspaceDataScore(workspace) > getWorkspaceDataScore(current)) {
      byEmail.set(key, workspace);
    }
  });
  return Array.from(byEmail.values());
}

async function openAdminWorkspace(workspaceId, workspaceEmail = "") {
  activeWorkspaceId = workspaceId;
  activeWorkspaceEmail = workspaceEmail;
  sessionStorage.setItem(ADMIN_WORKSPACE_KEY, workspaceId);
  sessionStorage.removeItem(SYNC_FLAG);
  setAdminSelecting(false);
  await loadCloudData(workspaceId);
  cloudReady = true;
  window.rrFirebaseReady = true;
  window.location.reload();
}

function backToAdminDashboard() {
  if (!isAdminUser(currentUser)) return;
  sessionStorage.removeItem(ADMIN_WORKSPACE_KEY);
  sessionStorage.removeItem(SYNC_FLAG);
  window.location.reload();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function patchLocalStorageSync() {
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (APP_KEYS.includes(key) && cloudReady && !syncingFromCloud) scheduleCloudSave();
  };
}

function scheduleCloudSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCloudData().catch((error) => showAuthMessage(firebaseError(error)));
  }, 450);
}

function setAppLocked(locked) {
  document.body.classList.toggle("auth-locked", locked);
  document.body.classList.toggle("auth-ready", !locked);
}

function setAdminSelecting(selecting) {
  document.body.classList.toggle("admin-selecting", selecting);
}

function setUserStatus(email) {
  const status = document.getElementById("firebaseUserStatus");
  const adminBack = document.getElementById("firebaseAdminBack");
  const adminViewing = currentUser && isAdminUser(currentUser) && activeWorkspaceId;
  if (status) {
    const detail = adminViewing ? `Admin: ${activeWorkspaceEmail || activeWorkspaceId}` : "Status: Online";
    status.textContent = email ? detail : "";
  }
  if (adminBack) adminBack.hidden = !adminViewing;
  document.body.classList.toggle("firebase-logged-in", Boolean(email));
}

function showAuthMessage(message) {
  const element = document.getElementById("firebaseAuthMessage");
  if (element) element.textContent = message;
}

function firebaseError(error) {
  const code = error?.code || "";
  console.error("Firebase error:", error);
  if (code.includes("auth/unauthorized-domain")) return "Domínio não autorizado. Adicione ryanhenriqueac-cell.github.io no Firebase Authentication.";
  if (code.includes("auth/operation-not-allowed")) return "E-mail/senha não está ativo no Firebase Authentication.";
  if (code.includes("auth/network-request-failed")) return "Falha de internet ao conectar no Firebase.";
  if (code.includes("auth/invalid-api-key")) return "Chave apiKey inválida no firebase-config.js.";
  if (code.includes("auth/configuration-not-found")) return "Configuração de autenticação não encontrada no Firebase.";
  if (code.includes("auth/invalid-credential")) return "E-mail ou senha inválidos.";
  if (code.includes("auth/email-already-in-use")) return "Este e-mail já tem acesso.";
  if (code.includes("auth/weak-password")) return "Use uma senha com pelo menos 6 caracteres.";
  if (code.includes("permission-denied")) return "Sem permissão no Firestore. Confira as regras de segurança.";
  return `Erro no Firebase: ${code || error?.message || "sem código"}.`;
}
