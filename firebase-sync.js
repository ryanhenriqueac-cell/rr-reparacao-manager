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
        <input id="firebasePassword" type="password" placeholder="Senha" autocomplete="current-password" required>
        <button class="btn btn-primary" type="submit">Entrar</button>
        <button class="btn btn-muted" type="button" id="firebaseCreateAccount">Criar acesso</button>
      </form>
      <span id="firebaseAuthMessage"></span>
    </div>
  `;
  document.body.appendChild(shell);

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
}

async function login() {
  const email = document.getElementById("firebaseEmail").value.trim();
  const password = document.getElementById("firebasePassword").value;
  try {
    showAuthMessage("Entrando...");
    await signInWithEmailAndPassword(auth, email, password);
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
    await saveCloudData();
  } catch (error) {
    showAuthMessage(firebaseError(error));
  }
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
  if (status) status.textContent = email ? `Online: ${email}` : "";
  document.body.classList.toggle("firebase-logged-in", Boolean(email));
}

function showAuthMessage(message) {
  const element = document.getElementById("firebaseAuthMessage");
  if (element) element.textContent = message;
}

function firebaseError(error) {
  const code = error?.code || "";
  if (code.includes("auth/invalid-credential")) return "E-mail ou senha inválidos.";
  if (code.includes("auth/email-already-in-use")) return "Este e-mail já tem acesso.";
  if (code.includes("auth/weak-password")) return "Use uma senha com pelo menos 6 caracteres.";
  if (code.includes("permission-denied")) return "Sem permissão no Firestore. Confira as regras de segurança.";
  return "Erro no Firebase. Verifique configuração, internet e regras.";
}
