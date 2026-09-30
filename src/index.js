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

function readUint16LE(view, off) {
  return view.getUint16(off, true);
}
function readUint32LE(view, off) {
  return view.getUint32(off, true);
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

async function publishToGitHub({ shipUrl, imageUrl, name, submitter }, env) {
  try {
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

    const shipText = await (await fetch(shipUrl)).text();
    const imageBuf = await (await fetch(imageUrl)).arrayBuffer();
    const shipHash = await sha256Hex(shipText);

    await putFile(`ships/${slug}/ship.nmsship`, utf8ToBase64(shipText), `Add ${name}`, env);
    await putFile(`ships/${slug}/preview.png`, arrayBufferToBase64(imageBuf), `Add preview for ${name}`, env);

    const info = { name, id: slug, sha256: shipHash, submitter: submitter || "", approvedAt: new Date().toISOString() };
    await putFile(`ships/${slug}/info.json`, utf8ToBase64(JSON.stringify(info, null, 2)), `Add info for ${name}`, env);

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
    list.push({ id: slug, name, sha256: shipHash, submitter: submitter || "" });

    const updResp = await ghRequest(`/contents/index.json`, env, {
      method: "PUT",
      body: JSON.stringify({
        message: `Add ${name} to index`,
        content: utf8ToBase64(JSON.stringify(list, null, 2)),
        sha: idxData.sha
      })
    });
    if (!updResp.ok) throw new Error(`index.json update failed: ${updResp.status} ${await updResp.text()}`);

    return true;
  } catch (err) {
    console.error("publishToGitHub failed: " + (err && err.message ? err.message : String(err)));
    return false;
  }
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

async function promotePendingToLibrary(slug, name, env) {
  const shipResp = await ghRequest(`/contents/pending/${slug}/ship.nmsship`, env, { method: "GET" });
  const imgResp = await ghRequest(`/contents/pending/${slug}/preview.png`, env, { method: "GET" });
  if (!shipResp.ok || !imgResp.ok) throw new Error("pending files not found");
  const shipData = await shipResp.json();
  const imgData = await imgResp.json();

  const shipContentB64 = shipData.content.replace(/\n/g, "");
  const imgContentB64 = imgData.content.replace(/\n/g, "");
  const shipBytes = Uint8Array.from(atob(shipContentB64), (c) => c.charCodeAt(0));
  const shipHash = await sha256HexBytes(shipBytes);

  await putFile(`ships/${slug}/ship.nmsship`, shipContentB64, `Add ${name}`, env);
  await putFile(`ships/${slug}/preview.png`, imgContentB64, `Add preview for ${name}`, env);

  const info = { name, id: slug, sha256: shipHash, submitter: "website", approvedAt: new Date().toISOString() };
  await putFile(`ships/${slug}/info.json`, utf8ToBase64(JSON.stringify(info, null, 2)), `Add info for ${name}`, env);

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
  list.push({ id: slug, name, sha256: shipHash, submitter: "website" });
  const updResp = await ghRequest(`/contents/index.json`, env, {
    method: "PUT",
    body: JSON.stringify({
      message: `Add ${name} to index`,
      content: utf8ToBase64(JSON.stringify(list, null, 2)),
      sha: idxData.sha
    })
  });
  if (!updResp.ok) throw new Error(`index.json update failed: ${updResp.status} ${await updResp.text()}`);

  await deleteFile(`pending/${slug}/ship.nmsship`, `Clean up pending ${name}`, env);
  await deleteFile(`pending/${slug}/preview.png`, `Clean up pending ${name}`, env);
  await deleteFile(`pending/${slug}/info.json`, `Clean up pending ${name}`, env);
}

async function promotePendingToLibraryTry(slug, name, env) {
  try {
    await promotePendingToLibrary(slug, name, env);
    return true;
  } catch (err) {
    console.error("promotePendingToLibrary failed: " + (err && err.message ? err.message : String(err)));
    return false;
  }
}

async function rejectPending(slug, env) {
  try {
    await deleteFile(`pending/${slug}/ship.nmsship`, "Reject submission", env);
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
<label>Name<input type="text" name="name" required maxlength="80"></label>
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
  const shipFile = form.get("ship");
  const imageFile = form.get("image");

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

  const shipBytes = new Uint8Array(await shipFile.arrayBuffer());
  const imageBuf = await imageFile.arrayBuffer();

  let jsonOk = true;
  if (shipBytes.length > 2 && shipBytes[0] === 0x50 && shipBytes[1] === 0x4b) {
    const zipCheck = validateZipEntries(shipBytes);
    if (!zipCheck.ok) {
      return new Response(`Could not accept this ship file: ${zipCheck.error}.`, { status: 400 });
    }
  } else {
    try {
      JSON.parse(new TextDecoder().decode(shipBytes));
    } catch (e) {
      jsonOk = false;
    }
  }

  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    await putFile(`pending/${slug}/ship.nmsship`, arrayBufferToBase64(shipBytes.buffer), `Pending: ${name}`, env);
    await putFile(`pending/${slug}/preview.png`, arrayBufferToBase64(imageBuf), `Pending preview: ${name}`, env);
    await putFile(
      `pending/${slug}/info.json`,
      utf8ToBase64(JSON.stringify({ name, submitter: "website", jsonOk }, null, 2)),
      `Pending info: ${name}`,
      env
    );
  } catch (err) {
    console.error("pending upload failed: " + (err && err.message ? err.message : String(err)));
    return new Response("Something went wrong while staging this submission. Please try again later.", { status: 500 });
  }

  const branch = env.GITHUB_BRANCH || "main";
  const imageRawUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${branch}/pending/${slug}/preview.png`;

  ctx.waitUntil(
    (async () => {
      const embed = {
        title: name,
        description: jsonOk ? "" : "Could not parse this file as JSON - check before approving.",
        color: jsonOk ? 0x5b9bd5 : 0xe05555,
        image: { url: imageRawUrl },
        fields: [
          { name: "Submitted by", value: "via website", inline: true },
          { name: "Source", value: "web upload", inline: true }
        ]
      };
      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "Approve", custom_id: `webapprove:${slug}` },
            { type: 2, style: 4, label: "Reject", custom_id: `webreject:${slug}` }
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

async function handleRegister(url, env) {
  const key = url.searchParams.get("key");
  if (!env.SETUP_KEY || key !== env.SETUP_KEY) {
    return new Response("Not authorized.", { status: 401 });
  }
  const command = {
    name: "submit",
    description: "Submit a Corvette to the community library",
    options: [
      { name: "name", description: "Name for this Corvette", type: 3, required: true },
      { name: "ship", description: "The .nmsship or .json ship file", type: 11, required: true },
      { name: "image", description: "A preview screenshot", type: 11, required: true }
    ]
  };
  const resp = await discordApi(
    `/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
    env,
    { method: "PUT", body: JSON.stringify([command]) }
  );
  const text = await resp.text();
  return new Response(`Status ${resp.status}\n${text}`, {
    status: 200,
    headers: { "content-type": "text/plain" }
  });
}

async function handleCommand(interaction, env, ctx) {
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

  ctx.waitUntil(
    (async () => {
      let jsonOk = true;
      try {
        JSON.parse(await (await fetch(shipAtt.url)).text());
      } catch (e) {
        jsonOk = false;
      }

      const submitter = interaction.member?.user || interaction.user;
      const embed = {
        title: name,
        description: jsonOk ? "" : "Could not parse this file as JSON - check before approving.",
        color: jsonOk ? 0x5b9bd5 : 0xe05555,
        image: { url: imgAtt.url },
        fields: [
          { name: "Submitted by", value: `<@${submitter.id}> (${submitter.username})`, inline: true },
          { name: "Ship file", value: shipAtt.url, inline: false },
          { name: "Image file", value: imgAtt.url, inline: false }
        ]
      };
      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "Approve", custom_id: "approve" },
            { type: 2, style: 4, label: "Reject", custom_id: "reject" }
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

  if (customId.startsWith("webapprove:") || customId.startsWith("webreject:")) {
    const slug = customId.split(":")[1];

    if (customId.startsWith("webreject:")) {
      ctx.waitUntil(rejectPending(slug, env));
      return json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: { embeds: [{ ...embed, color: 0x8b2020, title: `Rejected - ${embed.title}` }], components: [] }
      });
    }

    ctx.waitUntil(
      promotePendingToLibraryTry(slug, embed.title, env).then(async (ok) => {
        const finalEmbed = {
          ...embed,
          color: ok ? 0x2d7a2d : 0xe05555,
          title: `${ok ? "Approved" : "Approve failed - check logs"} - ${embed.title}`
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

  const fields = embed.fields || [];
  const getField = (label) => fields.find((f) => f.name === label)?.value;
  const shipUrl = getField("Ship file");
  const imageUrl = getField("Image file");
  const submittedByRaw = getField("Submitted by") || "";
  const submitterMatch = submittedByRaw.match(/\(([^)]+)\)/);
  const submitter = submitterMatch ? submitterMatch[1] : "";

  if (customId === "reject") {
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: [{ ...embed, color: 0x8b2020, title: `Rejected - ${embed.title}` }], components: [] }
    });
  }

  if (customId === "approve") {
    ctx.waitUntil(
      publishToGitHub({ shipUrl, imageUrl, name: embed.title, submitter }, env).then(async (ok) => {
        const finalEmbed = {
          ...embed,
          color: ok ? 0x2d7a2d : 0xe05555,
          title: `${ok ? "Approved" : "Approve failed - check logs"} - ${embed.title}`
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
