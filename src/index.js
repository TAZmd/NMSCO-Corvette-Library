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

async function publishToGitHub({ shipUrl, imageUrl, name }, env) {
  try {
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

    const shipText = await (await fetch(shipUrl)).text();
    const imageBuf = await (await fetch(imageUrl)).arrayBuffer();
    const shipHash = await sha256Hex(shipText);

    await putFile(`ships/${slug}/ship.nmsship`, utf8ToBase64(shipText), `Add ${name}`, env);
    await putFile(`ships/${slug}/preview.png`, arrayBufferToBase64(imageBuf), `Add preview for ${name}`, env);

    const info = { name, id: slug, sha256: shipHash, approvedAt: new Date().toISOString() };
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
    list.push({ id: slug, name, sha256: shipHash });

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
    console.error("publishToGitHub failed:", err);
    return false;
  }
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
  if (!shipAtt) problems.push("geen ship-bestand toegevoegd");
  if (!imgAtt) problems.push("geen afbeelding toegevoegd");
  if (shipAtt && shipAtt.size > 3 * 1024 * 1024) problems.push("ship-bestand is groter dan 3 MB");
  if (shipAtt && !/\.(nmsship|json|txt)$/i.test(shipAtt.filename)) problems.push("ship-bestand moet .nmsship, .json of .txt zijn");
  if (imgAtt && imgAtt.size > 8 * 1024 * 1024) problems.push("afbeelding is groter dan 8 MB");
  if (imgAtt && !/^image\//.test(imgAtt.content_type || "")) problems.push("bijlage voor afbeelding is geen afbeelding");

  if (problems.length) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Kon dit niet aannemen: ${problems.join(", ")}.`, flags: 64 }
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
        description: jsonOk ? "" : "Kon dit bestand niet als JSON lezen - controleer voor goedkeuren.",
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
      await discordApi(`/channels/${env.APPROVAL_CHANNEL_ID}/messages`, env, {
        method: "POST",
        body: JSON.stringify({ embeds: [embed], components })
      });
    })()
  );

  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "Bedankt! Je Corvette is verstuurd ter goedkeuring.", flags: 64 }
  });
}

async function handleComponent(interaction, env, ctx) {
  const customId = interaction.data.custom_id;
  const clicker = interaction.member?.user || interaction.user;

  if (!clicker || clicker.id !== env.APPROVER_USER_ID) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: "Alleen de beheerder van de library kan dit goedkeuren of afwijzen.", flags: 64 }
    });
  }

  const message = interaction.message;
  const embed = message.embeds?.[0];
  if (!embed) {
    return json({ type: InteractionResponseType.UPDATE_MESSAGE, data: { embeds: [], components: [] } });
  }

  const fields = embed.fields || [];
  const getField = (label) => fields.find((f) => f.name === label)?.value;
  const shipUrl = getField("Ship file");
  const imageUrl = getField("Image file");

  if (customId === "reject") {
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: [{ ...embed, color: 0x8b2020, title: `Rejected - ${embed.title}` }], components: [] }
    });
  }

  if (customId === "approve") {
    ctx.waitUntil(
      publishToGitHub({ shipUrl, imageUrl, name: embed.title }, env).then(async (ok) => {
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
      return new Response("Corvette Library bot is running.", { status: 200 });
    }

    if (request.method === "POST") {
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
