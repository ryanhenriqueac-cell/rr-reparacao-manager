import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const APP_KEYS = ["rr_clientes", "rr_veiculos", "rr_servicos", "rr_orcamentos", "rr_financeiro"];
const SYNC_FLAG = "rr_firebase_loaded_user";
const REMEMBER_KEY = "rr_firebase_remember";
const config = window.firebaseConfig || {};
const configReady = Boolean(config.apiKey && config.apiKey !== "COLE_AQUI" && config.projectId && config.projectId !== "COLE_AQUI");

let auth;
let db;
let currentUser = null;
let saveTimer = null;
let cloudReady = false;
let syncingFromCloud = false;

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
      setAppLocked(true);
      setUserStatus("");
      return;
    }

    setUserStatus(user.email);
    setAppLocked(false);
    await loadCloudData(user.uid);
    cloudReady = true;

    if (sessionStorage.getItem(SYNC_FLAG) !== user.uid) {
      sessionStorage.setItem(SYNC_FLAG, user.uid);
      window.location.reload();
    }
  });
}

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

  const bar = document.createElement("div");
  bar.id = "firebaseUserBar";
  bar.innerHTML = `
    <span id="firebaseUserStatus"></span>
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
  document.getElementById("toggleFirebasePassword").addEventListener("click", togglePasswordVisibility);
}

async function login() {
  const email = document.getElementById("firebaseEmail").value.trim();
  const password = document.getElementById("firebasePassword").value;
  try {
    showAuthMessage("Entrando...");
    await signInWithEmailAndPassword(auth, email, password);
    saveRememberedLogin(email, password);
  } catch (error) {
    showAuthMessage(firebaseError(error));
  }
}

async function createAccount() {
  const email = document.getElementById("firebaseEmail").value.trim();
  const password = document.getElementById("firebasePassword").value;
  try {
    showAuthMessage("Criando acesso...");
    await createUserWithEmailAndPassword(auth, email, password);
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

    const data = snap.data().data || {};
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
  if (!currentUser || !db) return;

  const data = {};
  APP_KEYS.forEach((key) => {
    data[key] = JSON.parse(localStorage.getItem(key)) || [];
  });

  await setDoc(doc(db, "workspaces", currentUser.uid), {
    owner: currentUser.uid,
    ownerEmail: currentUser.email,
    updatedAt: serverTimestamp(),
    data
  }, { merge: true });
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

function setUserStatus(email) {
  const status = document.getElementById("firebaseUserStatus");
  if (status) status.textContent = email ? "Status: Online" : "";
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
