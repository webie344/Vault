/* ===========================================================
   VAULT — app.js
   Fill in the CONFIG block below, then this file is complete.
   Firestore is called via its REST API (no SDK download needed),
   which keeps things light for on-device/mobile development.
   =========================================================== */

const CONFIG = {
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
  },
  cloudinary: {
    cloudName: "YOUR_CLOUD_NAME",
    uploadPreset: "YOUR_UNSIGNED_UPLOAD_PRESET", // create an unsigned preset in Cloudinary settings
  },
};

// Only apiKey, authDomain, and projectId are actually used below (auth +
// Firestore REST calls) — the rest are carried here so you can paste your
// full Firebase console snippet in as-is without editing it down.
firebase.initializeApp(CONFIG.firebase);
const auth = firebase.auth();

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/(default)/documents`;

/* ---------- PWA: register service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}

/* ---------- state ---------- */
let currentUser = null;
let items = [];      // {id, url, type, createdAt, publicId, albumId}
let albums = [];     // {id, name, createdAt, passcodeHash}
let authMode = "signin"; // "signin" | "signup"
let activeTab = "vault"; // "vault" | "albums" | "account"
let activeAlbumId = null;
let unlockedAlbums = new Set();
let activeItem = null;
let pendingPasscodeAlbum = null;

/* ---------- element refs ---------- */
const el = (id) => document.getElementById(id);

const lockScreen = el("lock-screen");
const vaultScreen = el("vault-screen");
const albumsScreen = el("albums-screen");
const albumDetailScreen = el("album-detail-screen");
const accountScreen = el("account-screen");
const settingsScreen = el("settings-screen");

const authForm = el("auth-form");
const emailInput = el("email-input");
const passwordInput = el("password-input");
const authSubmitBtn = el("auth-submit-btn");
const toggleAuthModeBtn = el("toggle-auth-mode-btn");

const grid = el("grid");
const emptyState = el("empty-state");
const itemCount = el("item-count");
const logoutBtn = el("logout-btn");

const fileInput = el("file-input");
const uploadBtn = el("upload-btn");
const uploadTray = el("upload-tray");
const uploadRingFill = el("upload-ring-fill");
const uploadTrayTitle = el("upload-tray-title");
const uploadTraySub = el("upload-tray-sub");

const viewer = el("viewer");
const viewerBackdrop = el("viewer-backdrop");
const viewerMedia = el("viewer-media");
const closeViewerBtn = el("close-viewer-btn");
const downloadBtn = el("download-btn");
const deleteBtn = el("delete-btn");

const confirmEl = el("confirm");
const confirmTitle = el("confirm-title");
const confirmCancel = el("confirm-cancel");
const confirmOk = el("confirm-ok");

const toastStack = el("toast-stack");

const tabbar = el("tabbar");
const tabVaultBtn = el("tab-vault-btn");
const tabAlbumsBtn = el("tab-albums-btn");
const tabAccountBtn = el("tab-account-btn");

const albumsList = el("albums-list");
const albumsEmpty = el("albums-empty");
const albumCount = el("album-count");
const newAlbumBtn = el("new-album-btn");

const albumSheet = el("album-sheet");
const createAlbumForm = el("create-album-form");
const albumNameInput = el("album-name-input");
const albumLockToggle = el("album-lock-toggle");
const albumPasscodeField = el("album-passcode-field");
const albumPasscodeInput = el("album-passcode-input");
const albumSheetCancel = el("album-sheet-cancel");

const passcodeSheet = el("passcode-sheet");
const passcodeSheetTitle = el("passcode-sheet-title");
const passcodeForm = el("passcode-form");
const passcodeAttemptInput = el("passcode-attempt-input");
const passcodeCancel = el("passcode-cancel");

const albumBackBtn = el("album-back-btn");
const albumDeleteBtn = el("album-delete-btn");
const albumDetailTitle = el("album-detail-title");
const albumDetailCount = el("album-detail-count");
const albumDetailGrid = el("album-detail-grid");
const albumDetailEmpty = el("album-detail-empty");
const albumFileInput = el("album-file-input");
const albumUploadBtn = el("album-upload-btn");

const accountEmail = el("account-email");
const accountAvatar = el("account-avatar");
const statItems = el("stat-items");
const statAlbums = el("stat-albums");
const openSettingsBtn = el("open-settings-btn");
const accountSignoutBtn = el("account-signout-btn");
const accountInstallBtn = el("account-install-btn");

const settingsBackBtn = el("settings-back-btn");
const passwordForm = el("password-form");
const currentPasswordInput = el("current-password-input");
const newPasswordInput = el("new-password-input");
const deleteConfirmPassword = el("delete-confirm-password");
const deleteAccountBtn = el("delete-account-btn");

const loadingScreen = el("loading-screen");
const installBanner = el("install-banner");
const installAcceptBtn = el("install-accept-btn");
const installDismissBtn = el("install-dismiss-btn");
const ptrIndicator = el("ptr-indicator");

/* ===========================================================
   TOASTS
   =========================================================== */
function toast(message, type = "default") {
  const node = document.createElement("div");
  node.className = `toast${type === "error" ? " toast--error" : ""}`;
  node.textContent = message;
  toastStack.appendChild(node);
  setTimeout(() => {
    node.classList.add("toast--leaving");
    node.addEventListener("animationend", () => node.remove());
  }, 3200);
}

/* ===========================================================
   CONFIRM DIALOG
   =========================================================== */
function askConfirm(message) {
  return new Promise((resolve) => {
    confirmTitle.textContent = message;
    confirmEl.classList.remove("confirm--hidden");
    const cleanup = (result) => {
      confirmEl.classList.add("confirm--hidden");
      confirmOk.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    confirmOk.addEventListener("click", onOk);
    confirmCancel.addEventListener("click", onCancel);
  });
}

/* ===========================================================
   AUTH — email/password via Firebase
   =========================================================== */
toggleAuthModeBtn.addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  authSubmitBtn.querySelector(".btn__label").textContent =
    authMode === "signin" ? "Unlock" : "Create vault";
  toggleAuthModeBtn.textContent =
    authMode === "signin" ? "Create an account instead" : "I already have an account";
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;

  authSubmitBtn.disabled = true;
  const label = authSubmitBtn.querySelector(".btn__label");
  const originalLabel = label.textContent;
  label.textContent = authMode === "signin" ? "Unlocking…" : "Creating…";

  try {
    if (authMode === "signin") {
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      await auth.createUserWithEmailAndPassword(email, password);
      toast("Vault created");
    }
    // onAuthStateChanged below handles the transition
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  } finally {
    authSubmitBtn.disabled = false;
    label.textContent = originalLabel;
  }
});

function friendlyAuthError(err) {
  const code = err.code || "";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Wrong email or password";
  if (code.includes("user-not-found")) return "No vault found for that email";
  if (code.includes("email-already-in-use")) return "That email already has a vault";
  if (code.includes("weak-password")) return "Password should be at least 6 characters";
  if (code.includes("invalid-email")) return "That email doesn't look right";
  if (code.includes("requires-recent-login")) return "Please sign out and back in, then try again";
  return "Something went wrong";
}

logoutBtn.addEventListener("click", async () => {
  const ok = await askConfirm("Lock the vault?");
  if (!ok) return;
  await auth.signOut();
});

accountSignoutBtn.addEventListener("click", async () => {
  const ok = await askConfirm("Sign out of your vault?");
  if (!ok) return;
  await auth.signOut();
});

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (user) {
    lockScreen.classList.add("screen--hidden");
    unlockedAlbums = new Set();

    // Show a branded loader while the vault's data is fetched, instead of
    // letting the grid flash empty before switchTab renders real content.
    [vaultScreen, albumsScreen, albumDetailScreen, accountScreen, settingsScreen].forEach((s) =>
      s.classList.add("screen--hidden")
    );
    tabbar.classList.add("screen--hidden");
    loadingScreen.classList.remove("screen--hidden");

    await Promise.all([loadItems(), loadAlbums()]);

    loadingScreen.classList.add("screen--hidden");
    switchTab("vault");
    populateAccount();
  } else {
    [vaultScreen, albumsScreen, albumDetailScreen, accountScreen, settingsScreen, loadingScreen].forEach((s) =>
      s.classList.add("screen--hidden")
    );
    tabbar.classList.add("screen--hidden");
    lockScreen.classList.remove("screen--hidden");
    authForm.reset();
    items = [];
    albums = [];
    renderGrid(grid, emptyState, itemCount, rootItems());
  }
});

/* ===========================================================
   TAB / SCREEN NAVIGATION
   =========================================================== */
const allScreens = { vault: vaultScreen, albums: albumsScreen, account: accountScreen };

function switchTab(tab) {
  activeTab = tab;
  tabbar.classList.remove("screen--hidden");
  Object.values(allScreens).forEach((s) => s.classList.add("screen--hidden"));
  albumDetailScreen.classList.add("screen--hidden");
  settingsScreen.classList.add("screen--hidden");
  allScreens[tab].classList.remove("screen--hidden");

  [tabVaultBtn, tabAlbumsBtn, tabAccountBtn].forEach((b) => b.classList.remove("is-active"));
  ({ vault: tabVaultBtn, albums: tabAlbumsBtn, account: tabAccountBtn }[tab]).classList.add("is-active");

  if (tab === "vault") renderGrid(grid, emptyState, itemCount, rootItems());
  if (tab === "albums") renderAlbums();
  if (tab === "account") populateAccount();
}

tabVaultBtn.addEventListener("click", () => switchTab("vault"));
tabAlbumsBtn.addEventListener("click", () => switchTab("albums"));
tabAccountBtn.addEventListener("click", () => switchTab("account"));

/* ===========================================================
   FIRESTORE — REST API helpers
   =========================================================== */
async function firestoreRequest(path, options = {}) {
  const token = await currentUser.getIdToken();
  const res = await fetch(`${FIRESTORE_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error(`Firestore ${res.status} on ${path}:`, bodyText);
    throw new Error(`Firestore error: ${res.status} — ${bodyText}`);
  }
  return res.json();
}

function docToItem(doc) {
  const f = doc.fields;
  const id = doc.name.split("/").pop();
  return {
    id,
    url: f.url?.stringValue,
    publicId: f.publicId?.stringValue,
    type: f.type?.stringValue,
    createdAt: f.createdAt?.timestampValue || f.createdAt?.integerValue,
    albumId: f.albumId?.stringValue || null,
  };
}

function docToAlbum(doc) {
  const f = doc.fields;
  const id = doc.name.split("/").pop();
  return {
    id,
    name: f.name?.stringValue || "Untitled",
    createdAt: f.createdAt?.timestampValue,
    passcodeHash: f.passcodeHash?.stringValue || null,
  };
}

async function loadItems() {
  try {
    // Query must be sent to the parent document's :runQuery endpoint, with
    // collectionId set to the bare subcollection name — a full path there
    // (e.g. "users/{uid}/items") is invalid and silently returns nothing.
    const data = await firestoreRequest(`/users/${currentUser.uid}:runQuery`, {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "items" }],
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        },
      }),
    });
    items = (data || []).filter((r) => r.document).map((r) => docToItem(r.document));
  } catch (err) {
    console.error("loadItems failed:", err);
    toast("Couldn't load your vault", "error");
  }
}

async function saveItemRecord({ url, publicId, type, albumId }) {
  const fields = {
    url: { stringValue: url },
    publicId: { stringValue: publicId },
    type: { stringValue: type },
    createdAt: { timestampValue: new Date().toISOString() },
  };
  if (albumId) fields.albumId = { stringValue: albumId };
  const doc = await firestoreRequest(`/users/${currentUser.uid}/items`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  return docToItem(doc);
}

async function deleteItemRecord(id) {
  await firestoreRequest(`/users/${currentUser.uid}/items/${id}`, { method: "DELETE" });
}

function rootItems() {
  return items.filter((it) => !it.albumId);
}
function itemsForAlbum(albumId) {
  return items.filter((it) => it.albumId === albumId);
}

/* ===========================================================
   GRID RENDERING (shared by Vault tab and Album detail)
   =========================================================== */
function renderGrid(gridEl, emptyEl, countEl, list) {
  gridEl.innerHTML = "";
  if (countEl) {
    countEl.textContent = list.length ? `${list.length} item${list.length === 1 ? "" : "s"}` : "Empty";
  }
  emptyEl.style.display = list.length ? "none" : "flex";

  list.forEach((item, i) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.animationDelay = `${Math.min(i, 10) * 40}ms`;

    if (item.type === "video") {
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      tile.appendChild(video);

      const mark = document.createElement("div");
      mark.className = "tile__video-mark";
      mark.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
      tile.appendChild(mark);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.loading = "lazy";
      img.alt = "";
      tile.appendChild(img);
    }

    tile.addEventListener("click", () => openViewer(item));
    gridEl.appendChild(tile);
  });
}

/* ===========================================================
   UPLOAD — Cloudinary unsigned upload
   =========================================================== */
uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = "";
  if (!files.length) return;
  await uploadFiles(files, null);
});

albumUploadBtn.addEventListener("click", () => albumFileInput.click());
albumFileInput.addEventListener("change", async () => {
  const files = Array.from(albumFileInput.files || []);
  albumFileInput.value = "";
  if (!files.length || !activeAlbumId) return;
  await uploadFiles(files, activeAlbumId);
});

async function uploadFiles(files, albumId) {
  uploadTray.classList.remove("upload-tray--hidden");
  const circumference = 97.4;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isVideo = file.type.startsWith("video");
    uploadTrayTitle.textContent = "Storing…";
    uploadTraySub.textContent = `${i + 1} of ${files.length}`;
    uploadRingFill.style.strokeDashoffset = circumference;

    try {
      const result = await uploadToCloudinary(file, isVideo, (pct) => {
        uploadRingFill.style.strokeDashoffset = String(circumference * (1 - pct));
      });
      const newItem = await saveItemRecord({
        url: result.secure_url,
        publicId: result.public_id,
        type: isVideo ? "video" : "image",
        albumId,
      });
      items.unshift(newItem);
      if (albumId) {
        renderGrid(albumDetailGrid, albumDetailEmpty, albumDetailCount, itemsForAlbum(albumId));
      } else {
        renderGrid(grid, emptyState, itemCount, rootItems());
      }
    } catch (err) {
      toast(`Couldn't store ${file.name}`, "error");
    }
  }

  uploadTray.classList.add("upload-tray--hidden");
  toast("Added to your vault");
}

function uploadToCloudinary(file, isVideo, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/${isVideo ? "video" : "image"}/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CONFIG.cloudinary.uploadPreset);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
  });
}

/* ===========================================================
   VIEWER
   =========================================================== */
function openViewer(item) {
  activeItem = item;
  viewerMedia.innerHTML = "";

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    viewerMedia.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = "";
    viewerMedia.appendChild(img);
  }

  viewer.classList.remove("viewer--hidden");
  viewer.setAttribute("aria-hidden", "false");
}

function closeViewer() {
  viewer.classList.add("viewer--hidden");
  viewer.setAttribute("aria-hidden", "true");
  viewerMedia.innerHTML = "";
  activeItem = null;
}

closeViewerBtn.addEventListener("click", closeViewer);
viewerBackdrop.addEventListener("click", closeViewer);

downloadBtn.addEventListener("click", () => {
  if (!activeItem) return;
  // fl_attachment forces Cloudinary to serve the file as a download
  const downloadUrl = activeItem.url.includes("/upload/")
    ? activeItem.url.replace("/upload/", "/upload/fl_attachment/")
    : activeItem.url;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Downloading to your device");
});

deleteBtn.addEventListener("click", async () => {
  if (!activeItem) return;
  const ok = await askConfirm("Remove this from your vault?");
  if (!ok) return;

  const id = activeItem.id;
  const albumId = activeItem.albumId;
  try {
    await deleteItemRecord(id);
    items = items.filter((it) => it.id !== id);
    if (albumId) {
      renderGrid(albumDetailGrid, albumDetailEmpty, albumDetailCount, itemsForAlbum(albumId));
    } else {
      renderGrid(grid, emptyState, itemCount, rootItems());
    }
    closeViewer();
    toast("Removed");
  } catch (err) {
    toast("Couldn't remove it", "error");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!viewer.classList.contains("viewer--hidden")) closeViewer();
  }
});

/* ===========================================================
   PASSCODE HASHING (SHA-256 via Web Crypto)
   =========================================================== */
async function hashPasscode(code) {
  const data = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ===========================================================
   ALBUMS — Firestore REST helpers
   =========================================================== */
async function loadAlbums() {
  try {
    const data = await firestoreRequest(`/users/${currentUser.uid}:runQuery`, {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "albums" }],
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        },
      }),
    });
    albums = (data || []).filter((r) => r.document).map((r) => docToAlbum(r.document));
  } catch (err) {
    console.error("loadAlbums failed:", err);
    toast("Couldn't load albums", "error");
  }
}

async function createAlbumRecord({ name, passcodeHash }) {
  const fields = {
    name: { stringValue: name },
    createdAt: { timestampValue: new Date().toISOString() },
  };
  if (passcodeHash) fields.passcodeHash = { stringValue: passcodeHash };
  const doc = await firestoreRequest(`/users/${currentUser.uid}/albums`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  return docToAlbum(doc);
}

async function deleteAlbumRecord(id) {
  await firestoreRequest(`/users/${currentUser.uid}/albums/${id}`, { method: "DELETE" });
}

/* ===========================================================
   ALBUMS — rendering
   =========================================================== */
function renderAlbums() {
  albumsList.innerHTML = "";
  albumCount.textContent = albums.length ? `${albums.length} album${albums.length === 1 ? "" : "s"}` : "No albums";
  albumsEmpty.style.display = albums.length ? "none" : "flex";

  albums.forEach((album, i) => {
    const card = document.createElement("div");
    card.className = "album-card";
    card.style.animationDelay = `${Math.min(i, 10) * 40}ms`;

    const count = itemsForAlbum(album.id).length;

    card.innerHTML = `
      <div class="album-card__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="14" height="14" rx="2.5"/><path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3H19a2 2 0 0 1 2 2v12.5a1.5 1.5 0 0 1-1.5 1.5H18"/></svg>
      </div>
      <div class="album-card__body">
        <p class="album-card__name"></p>
        <p class="album-card__meta">${count} item${count === 1 ? "" : "s"}</p>
      </div>
      ${album.passcodeHash ? `<div class="album-card__lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>` : ""}
    `;
    card.querySelector(".album-card__name").textContent = album.name;
    card.addEventListener("click", () => openAlbum(album));
    albumsList.appendChild(card);
  });
}

function openAlbum(album) {
  if (album.passcodeHash && !unlockedAlbums.has(album.id)) {
    pendingPasscodeAlbum = album;
    passcodeSheetTitle.textContent = album.name;
    passcodeAttemptInput.value = "";
    passcodeSheet.classList.remove("confirm--hidden");
    setTimeout(() => passcodeAttemptInput.focus(), 50);
    return;
  }
  enterAlbumDetail(album);
}

function enterAlbumDetail(album) {
  activeAlbumId = album.id;
  albumDetailTitle.textContent = album.name;
  Object.values(allScreens).forEach((s) => s.classList.add("screen--hidden"));
  settingsScreen.classList.add("screen--hidden");
  albumDetailScreen.classList.remove("screen--hidden");
  tabbar.classList.add("screen--hidden");
  renderGrid(albumDetailGrid, albumDetailEmpty, albumDetailCount, itemsForAlbum(album.id));
}

albumBackBtn.addEventListener("click", () => {
  activeAlbumId = null;
  switchTab("albums");
});

albumDeleteBtn.addEventListener("click", async () => {
  if (!activeAlbumId) return;
  const album = albums.find((a) => a.id === activeAlbumId);
  const itemsInAlbum = itemsForAlbum(activeAlbumId);
  const ok = await askConfirm(
    itemsInAlbum.length
      ? `Delete "${album?.name}" and its ${itemsInAlbum.length} item${itemsInAlbum.length === 1 ? "" : "s"}?`
      : `Delete "${album?.name}"?`
  );
  if (!ok) return;

  try {
    await deleteAlbumRecord(activeAlbumId);
    await Promise.all(itemsInAlbum.map((it) => deleteItemRecord(it.id)));
    items = items.filter((it) => it.albumId !== activeAlbumId);
    albums = albums.filter((a) => a.id !== activeAlbumId);
    unlockedAlbums.delete(activeAlbumId);
    activeAlbumId = null;
    switchTab("albums");
    toast("Album deleted");
  } catch (err) {
    toast("Couldn't delete album", "error");
  }
});

/* ---------- create album sheet ---------- */
newAlbumBtn.addEventListener("click", () => {
  createAlbumForm.reset();
  albumPasscodeField.classList.remove("is-visible");
  albumSheet.classList.remove("confirm--hidden");
  setTimeout(() => albumNameInput.focus(), 50);
});

albumSheetCancel.addEventListener("click", () => {
  albumSheet.classList.add("confirm--hidden");
});

albumLockToggle.addEventListener("change", () => {
  albumPasscodeField.classList.toggle("is-visible", albumLockToggle.checked);
});

createAlbumForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = albumNameInput.value.trim();
  if (!name) return;

  const wantsLock = albumLockToggle.checked;
  const code = albumPasscodeInput.value.trim();
  if (wantsLock && (code.length < 4 || code.length > 6)) {
    toast("Passcode should be 4–6 digits", "error");
    return;
  }

  const submitBtn = el("album-sheet-create");
  submitBtn.disabled = true;

  try {
    const passcodeHash = wantsLock ? await hashPasscode(code) : null;
    const newAlbum = await createAlbumRecord({ name, passcodeHash });
    albums.unshift(newAlbum);
    albumSheet.classList.add("confirm--hidden");
    renderAlbums();
    toast("Album created");
  } catch (err) {
    toast("Couldn't create album", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------- passcode prompt sheet ---------- */
passcodeCancel.addEventListener("click", () => {
  passcodeSheet.classList.add("confirm--hidden");
  pendingPasscodeAlbum = null;
});

passcodeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingPasscodeAlbum) return;
  const attempt = passcodeAttemptInput.value.trim();

  try {
    const hash = await hashPasscode(attempt);
    if (hash === pendingPasscodeAlbum.passcodeHash) {
      unlockedAlbums.add(pendingPasscodeAlbum.id);
      passcodeSheet.classList.add("confirm--hidden");
      const album = pendingPasscodeAlbum;
      pendingPasscodeAlbum = null;
      enterAlbumDetail(album);
    } else {
      toast("Wrong passcode", "error");
    }
  } catch (err) {
    toast("Couldn't check passcode", "error");
  }
});

/* ===========================================================
   ACCOUNT
   =========================================================== */
function populateAccount() {
  if (!currentUser) return;
  accountEmail.textContent = currentUser.email || "—";
  accountAvatar.textContent = (currentUser.email || "?").charAt(0);
  statItems.textContent = String(items.length);
  statAlbums.textContent = String(albums.length);
}

openSettingsBtn.addEventListener("click", () => {
  Object.values(allScreens).forEach((s) => s.classList.add("screen--hidden"));
  settingsScreen.classList.remove("screen--hidden");
  tabbar.classList.add("screen--hidden");
});

settingsBackBtn.addEventListener("click", () => {
  passwordForm.reset();
  deleteConfirmPassword.value = "";
  switchTab("account");
});

/* ---------- change password ---------- */
passwordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  if (!currentPassword || !newPassword) return;

  const submitBtn = el("password-submit-btn");
  submitBtn.disabled = true;
  const label = submitBtn.querySelector(".btn__label");
  const original = label.textContent;
  label.textContent = "Updating…";

  try {
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
    await currentUser.reauthenticateWithCredential(credential);
    await currentUser.updatePassword(newPassword);
    passwordForm.reset();
    toast("Password updated");
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  } finally {
    submitBtn.disabled = false;
    label.textContent = original;
  }
});

/* ---------- delete account ---------- */
deleteAccountBtn.addEventListener("click", async () => {
  const password = deleteConfirmPassword.value;
  if (!password) {
    toast("Enter your password to confirm", "error");
    return;
  }
  const ok = await askConfirm("Permanently delete your account?");
  if (!ok) return;

  deleteAccountBtn.disabled = true;
  try {
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
    await currentUser.reauthenticateWithCredential(credential);

    // Clean up Firestore records before removing the auth account.
    await Promise.all(items.map((it) => deleteItemRecord(it.id).catch(() => {})));
    await Promise.all(albums.map((a) => deleteAlbumRecord(a.id).catch(() => {})));
    await currentUser.delete();
    toast("Account deleted");
    // onAuthStateChanged handles returning to the lock screen
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  } finally {
    deleteAccountBtn.disabled = false;
  }
});

/* ===========================================================
   PWA — install prompt
   Chrome no longer shows its own install banner automatically;
   it fires 'beforeinstallprompt' and expects the page to offer
   its own UI, then call .prompt() when the person chooses to.
   =========================================================== */
let deferredInstallPrompt = null;
let installDismissedThisSession = false;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  accountInstallBtn.classList.remove("list-row--hidden");
  if (!installDismissedThisSession && currentUser) {
    installBanner.classList.remove("install-banner--hidden");
  }
});

async function runInstallPrompt() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBanner.classList.add("install-banner--hidden");
}

installAcceptBtn.addEventListener("click", runInstallPrompt);
accountInstallBtn.addEventListener("click", runInstallPrompt);

installDismissBtn.addEventListener("click", () => {
  installDismissedThisSession = true;
  installBanner.classList.add("install-banner--hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installBanner.classList.add("install-banner--hidden");
  accountInstallBtn.classList.add("list-row--hidden");
  toast("Vault installed");
});

/* ===========================================================
   PULL TO REFRESH
   Chrome's native pull-to-refresh reloads the whole page (loses
   in-memory state, feels generic). overscroll-behavior-y:contain
   in the CSS suppresses that; this replaces it with an in-app
   gesture that just re-fetches the current screen's data.
   =========================================================== */
let ptrStartY = null;
let ptrPulling = false;
let ptrRefreshing = false;
const PTR_THRESHOLD = 64;

function anyOverlayOpen() {
  return (
    !viewer.classList.contains("viewer--hidden") ||
    !confirmEl.classList.contains("confirm--hidden") ||
    !albumSheet.classList.contains("confirm--hidden") ||
    !passcodeSheet.classList.contains("confirm--hidden") ||
    !loadingScreen.classList.contains("screen--hidden")
  );
}

document.addEventListener(
  "touchstart",
  (e) => {
    if (!currentUser || anyOverlayOpen() || ptrRefreshing) return;
    if (window.scrollY <= 0) {
      ptrStartY = e.touches[0].clientY;
      ptrPulling = true;
    }
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (!ptrPulling || ptrStartY === null) return;
    const dy = e.touches[0].clientY - ptrStartY;
    if (dy <= 0) return;
    if (window.scrollY > 0) {
      ptrPulling = false;
      return;
    }
    e.preventDefault();
    const dist = Math.min(dy * 0.5, 90);
    ptrIndicator.style.transform = `translateX(-50%) translateY(${dist - 12}px)`;
    ptrIndicator.style.opacity = String(Math.min(dist / 50, 1));
    ptrIndicator.classList.toggle("ptr-ready", dist >= PTR_THRESHOLD);
  },
  { passive: false }
);

document.addEventListener("touchend", async () => {
  if (!ptrPulling) return;
  const shouldRefresh = ptrIndicator.classList.contains("ptr-ready");
  ptrPulling = false;
  ptrStartY = null;

  if (shouldRefresh) {
    ptrRefreshing = true;
    ptrIndicator.classList.add("ptr-spinning");
    ptrIndicator.style.transform = "translateX(-50%) translateY(18px)";
    ptrIndicator.style.opacity = "1";
    await refreshCurrentView();
    ptrIndicator.classList.remove("ptr-spinning", "ptr-ready");
    ptrRefreshing = false;
  }

  ptrIndicator.style.transform = "translateX(-50%) translateY(-50px)";
  ptrIndicator.style.opacity = "0";
});

async function refreshCurrentView() {
  try {
    if (activeAlbumId) {
      await loadItems();
      renderGrid(albumDetailGrid, albumDetailEmpty, albumDetailCount, itemsForAlbum(activeAlbumId));
    } else if (activeTab === "albums") {
      await Promise.all([loadAlbums(), loadItems()]);
      renderAlbums();
    } else if (activeTab === "vault") {
      await loadItems();
      renderGrid(grid, emptyState, itemCount, rootItems());
    } else {
      await Promise.all([loadItems(), loadAlbums()]);
      populateAccount();
    }
  } catch (err) {
    toast("Couldn't refresh", "error");
  }
}
