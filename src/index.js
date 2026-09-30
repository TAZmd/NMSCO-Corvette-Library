import { verifyKey, InteractionType, InteractionResponseType } from "discord-interactions";

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json" }
  });
}

function slugify(s) {
  return (
    (s || "corvette")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "corvette"
  );
}

function validatePatreonUrl(raw) {
  const url = (raw || "").toString().trim();
  if (!url) return { ok: true, url: "" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { ok: false, error: "Patreon link is not a valid URL" };
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || (host !== "patreon.com" && host !== "www.patreon.com")) {
    return { ok: false, error: "the link must be a patreon.com link" };
  }
  return { ok: true, url: parsed.toString() };
}

const TIER_RED = new Set([
  "BUILD_REFINER1", "BUILD_REFINER2", "BUILD_REFINER3", "FRE_ROOM_REFINE",
  "BASE_FLAG", "SET_B_MONU", "SET_MONUMENT", "SET_T_MONU", "SET_F_MONU",
  "SET_INT_SHIPSAL", "SET_CONSTRUCT", "SET_INT_SUMMARY", "SET_MAYORTERM"
]);
const TIER_ORANGE = new Set([
  "BUILDBEACON", "MESSAGEMODULE", "NPCBUILDERTERM", "NPCFARMTERM", "NPCSCIENCETERM",
  "NPCVEHICLETERM", "NPCWEAPONTERM", "SUMMON_GARAGE", "GARAGE_B", "GARAGE_FLOAT",
  "GARAGE_FREIGHT", "GARAGE_L", "GARAGE_M", "GARAGE_MECH", "GARAGE_S", "GARAGE_SUB"
]);

function normalizeId(id) {
  return (id || "").toString().replace(/^\^/, "").toUpperCase();
}

function tierPenalty(id) {
  const n = normalizeId(id);
  if (TIER_RED.has(n)) return 0.5;
  if (TIER_ORANGE.has(n)) return 0.75;
  return 1.0;
}

// Weight per category sums to 10 - a ship with every utility present scores exactly 10.
const UTILITY_CATALOG = {
  mostRequired: {
    weight: 6.0,
    items: [
      { label: "Teleporter", chain: [["TELEPORTER"]] },
      { label: "Room Scanner", chain: [["FRE_ROOM_SCAN"]] },
      { label: "Build Terminal", chain: [["BUILDTERMINAL"]] },
      { label: "1x1 Magnet Base", chain: [["B_MAG_1X1"]] }
    ]
  },
  goodToHave: {
    weight: 3.0,
    items: [
      { label: "Storage containers", countPrefixes: ["B_WALL_CARG", "CONTAINER"] },
      { label: "Tech Wall", chain: [["B_WALL_TECH1"]] },
      { label: "Refiner", chain: [["FRE_ROOM_REFINE", "BUILD_REFINER3", "B_WALL_TECH0"], ["BUILD_REFINER2"], ["BUILD_REFINER1"]] },
      { label: "Weapon Case", chain: [["SET_WEAPONBOX"]] },
      { label: "Kitchen", chain: [["B_WALL_KITC0"], ["COOKER"]] },
      { label: "Weapon Rack", chain: [["WEAPONRACK"]] },
      { label: "Staff Set", chain: [["SET_STAFFBUILD"]] },
      { label: "Shield Station", chain: [["SHIELDSTATION"]] },
      { label: "Health Station", chain: [["HEALTHSTATION"]] },
      { label: "Signal Booster", chain: [["BUILDSIGNAL"]] },
      { label: "Game Table", chain: [["GAMETABLE"]] },
      { label: "Exocraft Upgrade Tree", chain: [["AM_EXOCRAFTTREE"]] },
      { label: "Ship Upgrade Tree", chain: [["AM_SHIPTREE"]] },
      { label: "Suit Upgrade Tree", chain: [["AM_SUITTREE"]] },
      { label: "Weapon Upgrade Tree", chain: [["AM_WEAPONTREE"]] },
      { label: "Expedition Upgrade Tree", chain: [["S9_BUILDERTREE"]] }
    ]
  },
  overboard: {
    weight: 1.0,
    items: [
      { label: "Extraction Room", chain: [["FRE_ROOM_EXTR"]] },
      { label: "Harvester", chain: [["BUILDHARVESTER"]] },
      { label: "Gas Harvester", chain: [["BUILDGASHARVEST"]] },
      { label: "Oxygen Harvester", chain: [["O2_HARVESTER"]] },
      { label: "Antimatter Harvester", chain: [["BUILDANTIMATTER"]] },
      { label: "Dressing Table", chain: [["DRESSING_TABLE"]] },
      { label: "Creature Farm", chain: [["CREATURE_FARM"]] },
      { label: "Creature Feeder", chain: [["CREATURE_FEED"]] },
      { label: "Nip Plant", chain: [["NIPPLANT"]] },
      { label: "Fish Pond", chain: [["SET_FISHPOND"]] }
    ]
  }
};

function scoreShip(objectIds) {
  const normIds = objectIds.map(normalizeId);
  const present = new Set(normIds);
  let score = 0;
  const utilities = [];

  function scanItem(item) {
    if (item.countPrefixes) {
      let count = 0;
      for (const id of normIds) {
        if (item.countPrefixes.some((p) => id.startsWith(p))) count++;
      }
      if (count > 0) {
        utilities.push({ label: `${count} ${item.label}` });
        return 1;
      }
      return 0;
    }
    for (let lvl = 0; lvl < item.chain.length; lvl++) {
      for (const candidate of item.chain[lvl]) {
        const cnorm = normalizeId(candidate);
        if (present.has(cnorm)) {
          const levelValue = 1 - lvl / item.chain.length;
          const value = levelValue * tierPenalty(cnorm);
          utilities.push({ label: item.label, value: Math.round(value * 100) / 100 });
          return value;
        }
      }
    }
    return 0;
  }

  for (const catKey of ["mostRequired", "goodToHave", "overboard"]) {
    const cat = UTILITY_CATALOG[catKey];
    const perItem = cat.weight / cat.items.length;
    for (const item of cat.items) score += scanItem(item) * perItem;
  }

  return { score: Math.round(score * 10) / 10, utilities };
}

function readUint16LE(view, off) {
  return view.getUint16(off, true);
}
function readUint32LE(view, off) {
  return view.getUint32(off, true);
}

async function extractZipEntry(bytes, entryName) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxBack = Math.min(bytes.length, 66000);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
    if (readUint32LE(view, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const totalEntries = readUint16LE(view, eocdOffset + 10);
  const cdOffset = readUint32LE(view, eocdOffset + 16);
  let offset = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (readUint32LE(view, offset) !== 0x02014b50) return null;
    const method = readUint16LE(view, offset + 10);
    const compSize = readUint32LE(view, offset + 20);
    const nameLen = readUint16LE(view, offset + 28);
    const extraLen = readUint16LE(view, offset + 30);
    const commentLen = readUint16LE(view, offset + 32);
    const localOffset = readUint32LE(view, offset + 42);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLen));

    if (name.toLowerCase() === entryName.toLowerCase()) {
      if (readUint32LE(view, localOffset) !== 0x04034b50) return null;
      const lNameLen = readUint16LE(view, localOffset + 26);
      const lExtraLen = readUint16LE(view, localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const compData = bytes.slice(dataStart, dataStart + compSize);

      if (method === 0) return new TextDecoder().decode(compData);
      if (method === 8) {
        const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const buf = await new Response(stream).arrayBuffer();
        return new TextDecoder().decode(buf);
      }
      return null;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function computeShipMeta(objectsText) {
  try {
    const arr = JSON.parse(objectsText);
    if (!Array.isArray(arr)) return { objectCount: 0, score: 0, utilities: [] };
    const ids = arr.map((o) => o && o.ObjectID).filter(Boolean);
    const { score, utilities } = scoreShip(ids);
    return { objectCount: arr.length, score, utilities };
  } catch (err) {
    return { objectCount: 0, score: 0, utilities: [] };
  }
}

// Whatever gets submitted - a real .nmsship zip, a plain .json, or a .txt paste of the
// objects array - is reduced to just that plain objects.json text right away. Nothing
// beyond that array is ever stored, and no zip container is ever written to the repo.
async function normalizeShipBytes(bytes) {
  if (bytes.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zipCheck = validateZipEntries(bytes);
    if (!zipCheck.ok) return { ok: false, error: zipCheck.error };
    const objectsText = await extractZipEntry(bytes, "objects.json");
    if (!objectsText) return { ok: false, error: "could not read objects.json from the zip" };
    try {
      JSON.parse(objectsText);
    } catch (e) {
      return { ok: false, error: "objects.json inside the zip is not valid JSON" };
    }
    return { ok: true, objectsText };
  }

  const text = new TextDecoder().decode(bytes);
  let objectsText = text;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      objectsText = text;
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.Objects)) {
      objectsText = JSON.stringify(parsed.Objects);
    } else {
      return { ok: false, error: "file is not a list of objects" };
    }
  } catch (e) {
    return { ok: false, error: "file is not valid JSON" };
  }
  return { ok: true, objectsText };
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validateZipEntries(bytes) {
  const allowed = new Set(["objects.json", "so.json"]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxBack = Math.min(bytes.length, 66000);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
    if (readUint32LE(view, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return { ok: false, error: "not a valid zip file (no end record found)" };

  const totalEntries = readUint16LE(view, eocdOffset + 10);
  const cdOffset = readUint32LE(view, eocdOffset + 16);
  if (totalEntries > 20) return { ok: false, error: "too many files inside the zip" };

  let offset = cdOffset;
  const entries = [];
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.length) return { ok: false, error: "corrupt zip directory" };
    if (readUint32LE(view, offset) !== 0x02014b50) return { ok: false, error: "corrupt zip directory" };

    const compSize = readUint32LE(view, offset + 20);
    const uncompSize = readUint32LE(view, offset + 24);
    const nameLen = readUint16LE(view, offset + 28);
    const extraLen = readUint16LE(view, offset + 30);
    const commentLen = readUint16LE(view, offset + 32);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLen));

    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return { ok: false, error: `unexpected path inside zip: ${name}` };
    }
    if (!allowed.has(name.toLowerCase())) {
      return { ok: false, error: `unexpected file inside zip: ${name}` };
    }
    if (uncompSize > 5 * 1024 * 1024) {
      return { ok: false, error: `${name} is too large once unpacked` };
    }
    if (compSize > 0 && uncompSize / compSize > 200) {
      return { ok: false, error: `${name} looks suspicious (unusual compression ratio)` };
    }

    entries.push({ name, compSize, uncompSize });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  if (!entries.some((e) => e.name.toLowerCase() === "objects.json")) {
    return { ok: false, error: "zip does not contain objects.json" };
  }
  return { ok: true, entries };
}

async function checkRateLimit(ip) {
  const cache = caches.default;
  const key = new Request(`https://ratelimit.internal/${encodeURIComponent(ip)}`);
  const cached = await cache.match(key);
  if (cached) return false;
  await cache.put(key, new Response("1", { headers: { "Cache-Control": "max-age=60" } }));
  return true;
}

// One download counts per (ship, visitor) per day - stops someone inflating a ship's
// count, and therefore its place in "Most downloaded", by repeatedly clicking Import/Download.
async function checkDownloadDedup(ip, id) {
  const cache = caches.default;
  const key = new Request(`https://downloadDedup.internal/${encodeURIComponent(id)}/${encodeURIComponent(ip)}`);
  const cached = await cache.match(key);
  if (cached) return false;
  await cache.put(key, new Response("1", { headers: { "Cache-Control": "max-age=86400" } }));
  return true;
}

async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token || "");
  if (ip) form.append("remoteip", ip);
  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const data = await resp.json();
  return !!data.success;
}

async function discordApi(path, env, opts = {}) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...opts,
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
}

async function ghRequest(path, env, opts = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "corvette-library-bot",
      Accept: "application/vnd.github+json",
      ...(opts.headers || {})
    }
  });
}

async function putFile(path, contentB64, message, env) {
  const resp = await ghRequest(`/contents/${path}`, env, {
    method: "PUT",
    body: JSON.stringify({ message, content: contentB64 })
  });
  if (!resp.ok) {
    throw new Error(`GitHub PUT ${path} failed: ${resp.status} ${await resp.text()}`);
  }
}

async function stageSubmission({ name, submitter, patreonUrl, shipBytes, imageBuf }, env) {
  const norm = await normalizeShipBytes(shipBytes);
  if (!norm.ok) return { ok: false, error: norm.error };

  const meta = computeShipMeta(norm.objectsText);
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

  const info = {
    name, id: slug, submitter: submitter || "", patreonUrl: patreonUrl || "",
    objectCount: meta.objectCount, score: meta.score, utilities: meta.utilities,
    stagedAt: new Date().toISOString()
  };

  await putFile(`pending/${slug}/ship.json`, utf8ToBase64(norm.objectsText), `Pending: ${name}`, env);
  await putFile(`pending/${slug}/preview.png`, arrayBufferToBase64(imageBuf), `Pending preview: ${name}`, env);
  await putFile(`pending/${slug}/info.json`, utf8ToBase64(JSON.stringify(info, null, 2)), `Pending info: ${name}`, env);

  return { ok: true, slug, meta };
}

async function deleteFile(path, message, env) {
  const getResp = await ghRequest(`/contents/${path}`, env, { method: "GET" });
  if (!getResp.ok) return;
  const data = await getResp.json();
  await ghRequest(`/contents/${path}`, env, {
    method: "DELETE",
    body: JSON.stringify({ message, sha: data.sha })
  });
}

async function promotePendingToLibrary(slug, env) {
  const shipResp = await ghRequest(`/contents/pending/${slug}/ship.json`, env, { method: "GET" });
  const imgResp = await ghRequest(`/contents/pending/${slug}/preview.png`, env, { method: "GET" });
  const infoResp = await ghRequest(`/contents/pending/${slug}/info.json`, env, { method: "GET" });
  if (!shipResp.ok || !imgResp.ok || !infoResp.ok) throw new Error("pending files not found");

  const shipData = await shipResp.json();
  const imgData = await imgResp.json();
  const infoData = await infoResp.json();

  const shipContentB64 = shipData.content.replace(/\n/g, "");
  const imgContentB64 = imgData.content.replace(/\n/g, "");
  const stagedInfo = JSON.parse(decodeBase64Utf8(infoData.content));
  const shipBytes = Uint8Array.from(atob(shipContentB64), (c) => c.charCodeAt(0));
  const shipHash = await sha256HexBytes(shipBytes);

  await putFile(`ships/${slug}/ship.json`, shipContentB64, `Add ${stagedInfo.name}`, env);
  await putFile(`ships/${slug}/preview.png`, imgContentB64, `Add preview for ${stagedInfo.name}`, env);

  const info = { ...stagedInfo, sha256: shipHash, downloads: 0, approvedAt: new Date().toISOString() };
  delete info.stagedAt;
  await putFile(`ships/${slug}/info.json`, utf8ToBase64(JSON.stringify(info, null, 2)), `Add info for ${stagedInfo.name}`, env);

  const idxResp = await ghRequest(`/contents/index.json`, env, { method: "GET" });
  if (!idxResp.ok) throw new Error("Could not read index.json");
  const idxData = await idxResp.json();
  let list = [];
  try {
    list = JSON.parse(decodeBase64Utf8(idxData.content));
    if (!Array.isArray(list)) list = [];
  } catch (e) {
    list = [];
  }
  list.push({
    id: slug, name: stagedInfo.name, sha256: shipHash, submitter: stagedInfo.submitter || "",
    patreonUrl: stagedInfo.patreonUrl || "",
    objectCount: stagedInfo.objectCount, score: stagedInfo.score, utilities: stagedInfo.utilities,
    downloads: 0, approvedAt: info.approvedAt
  });
  const updResp = await ghRequest(`/contents/index.json`, env, {
    method: "PUT",
    body: JSON.stringify({
      message: `Add ${stagedInfo.name} to index`,
      content: utf8ToBase64(JSON.stringify(list, null, 2)),
      sha: idxData.sha
    })
  });
  if (!updResp.ok) throw new Error(`index.json update failed: ${updResp.status} ${await updResp.text()}`);

  await deleteFile(`pending/${slug}/ship.json`, `Clean up pending ${stagedInfo.name}`, env);
  await deleteFile(`pending/${slug}/preview.png`, `Clean up pending ${stagedInfo.name}`, env);
  await deleteFile(`pending/${slug}/info.json`, `Clean up pending ${stagedInfo.name}`, env);

  return stagedInfo.name;
}

async function promotePendingToLibraryTry(slug, env) {
  try {
    const name = await promotePendingToLibrary(slug, env);
    return { ok: true, name };
  } catch (err) {
    console.error("promotePendingToLibrary failed: " + (err && err.message ? err.message : String(err)));
    return { ok: false, name: null };
  }
}

async function rejectPending(slug, env) {
  try {
    await deleteFile(`pending/${slug}/ship.json`, "Reject submission", env);
    await deleteFile(`pending/${slug}/preview.png`, "Reject submission", env);
    await deleteFile(`pending/${slug}/info.json`, "Reject submission", env);
  } catch (err) {
    console.error("rejectPending failed: " + (err && err.message ? err.message : String(err)));
  }
}

function uploadPageHtml(siteKey) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Submit a Corvette</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
body{font-family:sans-serif;background:#1e1e1e;color:#ddd;max-width:480px;margin:40px auto;padding:0 16px}
label{display:block;margin-top:14px;font-size:14px}
input[type=text],input[type=file]{width:100%;padding:8px;margin-top:4px;background:#2a2a2e;border:1px solid #444;color:#ddd;border-radius:4px;box-sizing:border-box}
button{margin-top:20px;padding:10px 18px;background:#3a6ea5;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:15px}
button:disabled{opacity:.5}
#status{margin-top:16px;font-size:14px}
</style>
</head>
<body>
<h2>Submit a Corvette</h2>
<form id="f">
<label>Your name (builder)<input type="text" name="builder" required maxlength="80"></label>
<label>Ship name<input type="text" name="name" required maxlength="80"></label>
<label>Patreon link (optional)<input type="text" name="patreon" placeholder="https://www.patreon.com/yourname" maxlength="200"></label>
<label>Ship file (.nmsship, .json or .txt)<input type="file" name="ship" accept=".nmsship,.json,.txt" required></label>
<label>Preview image<input type="file" name="image" accept="image/*" required></label>
<div class="cf-turnstile" data-sitekey="${siteKey}" style="margin-top:16px"></div>
<button type="submit">Submit for approval</button>
</form>
<div id="status"></div>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const status = document.getElementById('status');
  btn.disabled = true;
  status.textContent = 'Uploading...';
  try {
    const form = new FormData(e.target);
    const imageInput = e.target.querySelector('input[name="image"]');
    if (imageInput.files && imageInput.files[0]) {
      const compressed = await compressImage(imageInput.files[0]);
      form.set('image', compressed, 'preview.jpg');
    }
    const resp = await fetch('/upload', { method: 'POST', body: form });
    const text = await resp.text();
    status.textContent = text;
    if (resp.ok) e.target.reset();
  } catch (err) {
    status.textContent = 'Something went wrong. Please try again.';
  }
  btn.disabled = false;
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('compression failed')), 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
</script>
</body>
</html>`;
}

async function handleUploadPage(env) {
  return new Response(uploadPageHtml(env.TURNSTILE_SITE_KEY || ""), {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function handleUploadSubmit(request, env, ctx) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return new Response("Invalid form submission.", { status: 400 });
  }

  const turnstileToken = form.get("cf-turnstile-response");
  const turnstileOk = await verifyTurnstile(turnstileToken, ip, env);
  if (!turnstileOk) {
    return new Response("Verification failed - please try again.", { status: 400 });
  }

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return new Response("Please wait a minute before submitting again.", { status: 429 });
  }

  const name = (form.get("name") || "Unnamed Corvette").toString().slice(0, 80);
  const builder = (form.get("builder") || "").toString().trim().slice(0, 80);
  const shipFile = form.get("ship");
  const imageFile = form.get("image");

  if (!builder) {
    return new Response("Could not accept this submission: your name is required.", { status: 400 });
  }

  const problems = [];
  if (!(shipFile instanceof File)) problems.push("no ship file attached");
  if (!(imageFile instanceof File)) problems.push("no image attached");
  if (shipFile instanceof File && shipFile.size > 3 * 1024 * 1024) problems.push("ship file is larger than 3 MB");
  if (shipFile instanceof File && !/\.(nmsship|json|txt)$/i.test(shipFile.name)) {
    problems.push("ship file must be .nmsship, .json or .txt");
  }
  if (imageFile instanceof File && imageFile.size > 10 * 1024 * 1024) problems.push("image is larger than 10 MB");
  if (imageFile instanceof File && !/^image\//.test(imageFile.type || "")) problems.push("image attachment is not an image");

  if (problems.length) {
    return new Response(`Could not accept this submission: ${problems.join(", ")}.`, { status: 400 });
  }

  const patreonCheck = validatePatreonUrl(form.get("patreon"));
  if (!patreonCheck.ok) {
    return new Response(`Could not accept this submission: ${patreonCheck.error}.`, { status: 400 });
  }

  const shipBytes = new Uint8Array(await shipFile.arrayBuffer());
  const imageBuf = await imageFile.arrayBuffer();

  const staged = await stageSubmission(
    { name, submitter: builder, patreonUrl: patreonCheck.url, shipBytes, imageBuf },
    env
  );
  if (!staged.ok) {
    return new Response(`Could not accept this ship file: ${staged.error}.`, { status: 400 });
  }
  const slug = staged.slug;

  const branch = env.GITHUB_BRANCH || "main";
  const imageRawUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${branch}/pending/${slug}/preview.png`;

  ctx.waitUntil(
    (async () => {
      const embed = {
        title: name,
        color: 0x5b9bd5,
        image: { url: imageRawUrl },
        fields: [
          { name: "Submitted by", value: `${builder} (via website)`, inline: true },
          { name: "Objects", value: `${staged.meta.objectCount} \u00b7 utility score ${staged.meta.score}/10`, inline: true }
        ]
      };
      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "Approve", custom_id: `approve:${slug}` },
            { type: 2, style: 4, label: "Reject", custom_id: `reject:${slug}` }
          ]
        }
      ];
      const postResp = await discordApi(`/channels/${env.APPROVAL_CHANNEL_ID}/messages`, env, {
        method: "POST",
        body: JSON.stringify({ embeds: [embed], components })
      });
      if (!postResp.ok) {
        console.error("post to approval channel failed (web): " + postResp.status + " " + (await postResp.text()));
      }
    })()
  );

  return new Response("Thanks! Your Corvette was submitted for approval.", { status: 200 });
}

async function handleTrackDownload(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid request.", { status: 400 });
  }
  const id = (body.id || "").toString();
  if (!id) return new Response("Missing id.", { status: 400 });

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const allowed = await checkDownloadDedup(ip, id);
  if (!allowed) {
    return json({ ok: true, deduped: true });
  }

  try {
    const idxResp = await ghRequest(`/contents/index.json`, env, { method: "GET" });
    if (!idxResp.ok) throw new Error("Could not read index.json");
    const idxData = await idxResp.json();
    let list = JSON.parse(decodeBase64Utf8(idxData.content));
    if (!Array.isArray(list)) list = [];

    const entry = list.find((e) => e.id === id);
    if (!entry) return new Response("Unknown ship id.", { status: 404 });
    entry.downloads = (entry.downloads || 0) + 1;

    const updResp = await ghRequest(`/contents/index.json`, env, {
      method: "PUT",
      body: JSON.stringify({
        message: `Track download: ${id}`,
        content: utf8ToBase64(JSON.stringify(list, null, 2)),
        sha: idxData.sha
      })
    });
    if (!updResp.ok) throw new Error(`index.json update failed: ${updResp.status}`);

    return json({ ok: true, downloads: entry.downloads });
  } catch (err) {
    console.error("handleTrackDownload failed: " + (err && err.message ? err.message : String(err)));
    return new Response("Could not record download.", { status: 500 });
  }
}

async function deleteShip(id, env) {
  const idxResp = await ghRequest(`/contents/index.json`, env, { method: "GET" });
  if (!idxResp.ok) throw new Error("Could not read index.json");
  const idxData = await idxResp.json();
  let list = JSON.parse(decodeBase64Utf8(idxData.content));
  if (!Array.isArray(list)) list = [];

  const entry = list.find((e) => e.id === id);
  const newList = list.filter((e) => e.id !== id);
  if (newList.length === list.length) throw new Error("ship id not found in index.json");

  const updResp = await ghRequest(`/contents/index.json`, env, {
    method: "PUT",
    body: JSON.stringify({
      message: `Remove ${id} from index`,
      content: utf8ToBase64(JSON.stringify(newList, null, 2)),
      sha: idxData.sha
    })
  });
  if (!updResp.ok) throw new Error(`index.json update failed: ${updResp.status} ${await updResp.text()}`);

  await deleteFile(`ships/${id}/ship.json`, `Delete ${id}`, env);
  await deleteFile(`ships/${id}/preview.png`, `Delete ${id}`, env);
  await deleteFile(`ships/${id}/info.json`, `Delete ${id}`, env);

  return entry ? entry.name : id;
}

async function handleRegister(url, env) {
  const key = url.searchParams.get("key");
  if (!env.SETUP_KEY || key !== env.SETUP_KEY) {
    return new Response("Not authorized.", { status: 401 });
  }
  const submitCommand = {
    name: "submit",
    description: "Submit a Corvette to the community library",
    options: [
      { name: "name", description: "Name for this Corvette", type: 3, required: true },
      { name: "ship", description: "The .nmsship or .json ship file", type: 11, required: true },
      { name: "image", description: "A preview screenshot", type: 11, required: true },
      { name: "patreon", description: "Your Patreon link (optional)", type: 3, required: false }
    ]
  };
  const deleteCommand = {
    name: "delete",
    description: "Admin only: remove a Corvette from the library",
    options: [
      { name: "query", description: "Ship name or id to remove", type: 3, required: true }
    ]
  };
  const resp = await discordApi(
    `/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
    env,
    { method: "PUT", body: JSON.stringify([submitCommand, deleteCommand]) }
  );
  const text = await resp.text();
  return new Response(`Status ${resp.status}\n${text}`, {
    status: 200,
    headers: { "content-type": "text/plain" }
  });
}

async function handleDeleteCommand(interaction, env) {
  const clicker = interaction.member?.user || interaction.user;
  if (!clicker || clicker.id !== env.APPROVER_USER_ID) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: "Only the library admin can use this command.", flags: 64 }
    });
  }

  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const query = (opts.query || "").toString().trim();
  if (!query) {
    return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: "Give a ship name or id.", flags: 64 } });
  }

  try {
    const idxResp = await ghRequest(`/contents/index.json`, env, { method: "GET" });
    if (!idxResp.ok) throw new Error("Could not read index.json");
    const idxData = await idxResp.json();
    let list = JSON.parse(decodeBase64Utf8(idxData.content));
    if (!Array.isArray(list)) list = [];

    const byId = list.find((e) => e.id === query);
    if (byId) {
      const deletedName = await deleteShip(byId.id, env);
      return json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `Deleted "${deletedName}" (${byId.id}).`, flags: 64 }
      });
    }

    const matches = list.filter((e) => (e.name || "").toLowerCase().includes(query.toLowerCase()));
    if (matches.length === 0) {
      return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `No ship matches "${query}".`, flags: 64 } });
    }
    if (matches.length > 1) {
      const list_text = matches.slice(0, 15).map((m) => `${m.name} - \`${m.id}\``).join("\n");
      return json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `Multiple matches, run /delete again with the exact id:\n${list_text}`, flags: 64 }
      });
    }

    const deletedName = await deleteShip(matches[0].id, env);
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Deleted "${deletedName}" (${matches[0].id}).`, flags: 64 }
    });
  } catch (err) {
    console.error("handleDeleteCommand failed: " + (err && err.message ? err.message : String(err)));
    return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: "Could not delete that ship - check logs.", flags: 64 } });
  }
}

async function handleCommand(interaction, env, ctx) {
  if (interaction.data.name === "delete") {
    return handleDeleteCommand(interaction, env);
  }
  if (interaction.data.name !== "submit") {
    return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: "Unknown command.", flags: 64 } });
  }

  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const attachments = interaction.data.resolved?.attachments || {};
  const shipAtt = attachments[opts.ship];
  const imgAtt = attachments[opts.image];
  const name = (opts.name || "Unnamed Corvette").slice(0, 80);

  const problems = [];
  if (!shipAtt) problems.push("no ship file attached");
  if (!imgAtt) problems.push("no image attached");
  if (shipAtt && shipAtt.size > 3 * 1024 * 1024) problems.push("ship file is larger than 3 MB");
  if (shipAtt && !/\.(nmsship|json|txt)$/i.test(shipAtt.filename)) problems.push("ship file must be .nmsship, .json or .txt");
  if (imgAtt && imgAtt.size > 8 * 1024 * 1024) problems.push("image is larger than 8 MB");
  if (imgAtt && !/^image\//.test(imgAtt.content_type || "")) problems.push("image attachment is not an image");

  if (problems.length) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Could not accept this submission: ${problems.join(", ")}.`, flags: 64 }
    });
  }

  const patreonCheck = validatePatreonUrl(opts.patreon);
  if (!patreonCheck.ok) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Could not accept this submission: ${patreonCheck.error}.`, flags: 64 }
    });
  }

  ctx.waitUntil(
    (async () => {
      const submitter = interaction.member?.user || interaction.user;

      let shipBytes, imageBuf;
      try {
        shipBytes = new Uint8Array(await (await fetch(shipAtt.url)).arrayBuffer());
        imageBuf = await (await fetch(imgAtt.url)).arrayBuffer();
      } catch (err) {
        console.error("could not fetch discord attachments: " + (err && err.message ? err.message : String(err)));
        return;
      }

      const staged = await stageSubmission(
        { name, submitter: submitter.username || "", patreonUrl: patreonCheck.url, shipBytes, imageBuf },
        env
      );

      if (!staged.ok) {
        await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`, env, {
          method: "POST",
          body: JSON.stringify({ content: `Could not accept this submission: ${staged.error}.`, flags: 64 })
        });
        return;
      }

      const branch = env.GITHUB_BRANCH || "main";
      const imageRawUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${branch}/pending/${staged.slug}/preview.png`;

      const embed = {
        title: name,
        color: 0x5b9bd5,
        image: { url: imageRawUrl },
        fields: [
          { name: "Submitted by", value: `<@${submitter.id}> (${submitter.username})`, inline: true },
          { name: "Objects", value: `${staged.meta.objectCount} \u00b7 utility score ${staged.meta.score}/10`, inline: true }
        ]
      };
      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "Approve", custom_id: `approve:${staged.slug}` },
            { type: 2, style: 4, label: "Reject", custom_id: `reject:${staged.slug}` }
          ]
        }
      ];
      const postResp = await discordApi(`/channels/${env.APPROVAL_CHANNEL_ID}/messages`, env, {
        method: "POST",
        body: JSON.stringify({ embeds: [embed], components })
      });
      if (!postResp.ok) {
        console.error("post to approval channel failed: " + postResp.status + " " + (await postResp.text()));
      }
    })()
  );

  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "Thanks! Your Corvette was submitted for approval.", flags: 64 }
  });
}

async function handleComponent(interaction, env, ctx) {
  const customId = interaction.data.custom_id;
  const clicker = interaction.member?.user || interaction.user;

  if (!clicker || clicker.id !== env.APPROVER_USER_ID) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: "Only the library admin can approve or reject submissions.", flags: 64 }
    });
  }

  const message = interaction.message;
  const embed = message.embeds?.[0];
  if (!embed) {
    return json({ type: InteractionResponseType.UPDATE_MESSAGE, data: { embeds: [], components: [] } });
  }

  const [action, slug] = customId.split(":");
  if (!slug) {
    return json({ type: InteractionResponseType.UPDATE_MESSAGE, data: {} });
  }

  if (action === "reject") {
    ctx.waitUntil(rejectPending(slug, env));
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: [{ ...embed, color: 0x8b2020, title: `Rejected - ${embed.title}` }], components: [] }
    });
  }

  if (action === "approve") {
    ctx.waitUntil(
      promotePendingToLibraryTry(slug, env).then(async (result) => {
        const finalEmbed = {
          ...embed,
          color: result.ok ? 0x2d7a2d : 0xe05555,
          title: `${result.ok ? "Approved" : "Approve failed - check logs"} - ${embed.title}`
        };
        await discordApi(`/channels/${env.APPROVAL_CHANNEL_ID}/messages/${message.id}`, env, {
          method: "PATCH",
          body: JSON.stringify({ embeds: [finalEmbed], components: [] })
        });
      })
    );
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: [{ ...embed, title: `Publishing - ${embed.title}` }], components: [] }
    });
  }

  return json({ type: InteractionResponseType.UPDATE_MESSAGE, data: {} });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      if (url.pathname === "/register") return handleRegister(url, env);
      if (url.pathname === "/upload") return handleUploadPage(env);
      return new Response("Corvette Library bot is running.", { status: 200 });
    }

    if (request.method === "POST") {
      if (url.pathname === "/upload") return handleUploadSubmit(request, env, ctx);
      if (url.pathname === "/track-download") return handleTrackDownload(request, env);

      const signature = request.headers.get("x-signature-ed25519");
      const timestamp = request.headers.get("x-signature-timestamp");
      const body = await request.text();

      const isValid =
        signature && timestamp && (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
      if (!isValid) {
        return new Response("Bad request signature", { status: 401 });
      }

      const interaction = JSON.parse(body);

      if (interaction.type === InteractionType.PING) {
        return json({ type: InteractionResponseType.PONG });
      }
      if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        return handleCommand(interaction, env, ctx);
      }
      if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        return handleComponent(interaction, env, ctx);
      }

      return json({ type: InteractionResponseType.PONG });
    }

    return new Response("Not found", { status: 404 });
  }
};
