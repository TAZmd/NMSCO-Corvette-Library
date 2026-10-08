import { verifyKey, InteractionType, InteractionResponseType } from "discord-interactions";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
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

function validateLinkUrl(raw, kind) {
  const url = (raw || "").toString().trim();
  if (!url) return { ok: true, url: "" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { ok: false, error: "the link is not a valid URL" };
  }
  const host = parsed.hostname.toLowerCase();
  const isPatreon = host === "patreon.com" || host === "www.patreon.com";
  const isTikTok = host === "tiktok.com" || host === "www.tiktok.com" || host === "m.tiktok.com" ||
    host === "vm.tiktok.com" || host === "vt.tiktok.com";
  const isYouTube = host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" ||
    host === "youtu.be" || host === "www.youtu.be" || isTikTok;
  if (kind === "youtube" && !isYouTube) {
    return { ok: false, error: "the video link must be a youtube.com, youtu.be or tiktok.com link" };
  }
  if (kind === "patreon" && !isPatreon) {
    return { ok: false, error: "the Patreon link must be a patreon.com link" };
  }
  if (parsed.protocol !== "https:" || (!isPatreon && !isYouTube)) {
    return { ok: false, error: "the link must be a patreon.com, YouTube or TikTok link" };
  }
  if (isYouTube && (parsed.pathname === "/" || parsed.pathname === "")) {
    return { ok: false, error: "the video link must point to a video, playlist or channel" };
  }
  return { ok: true, url: parsed.toString() };
}

function classifyLinks(rawYoutube, rawPatreon, rawLegacy) {
  const yt = validateLinkUrl(rawYoutube, "youtube");
  if (!yt.ok) return yt;
  const pt = validateLinkUrl(rawPatreon, "patreon");
  if (!pt.ok) return pt;
  let youtubeUrl = yt.url;
  let patreonUrl = pt.url;
  const legacy = validateLinkUrl(rawLegacy);
  if (!legacy.ok) return legacy;
  if (legacy.url) {
    const host = new URL(legacy.url).hostname.toLowerCase();
    if (host.includes("patreon")) patreonUrl = patreonUrl || legacy.url;
    else youtubeUrl = youtubeUrl || legacy.url;
  }
  return { ok: true, youtubeUrl, patreonUrl };
}

function linkFields(youtubeUrl, patreonUrl) {
  const f = [];
  if (youtubeUrl) f.push({ name: /tiktok\.com/i.test(youtubeUrl) ? "TikTok" : "YouTube", value: youtubeUrl.slice(0, 200), inline: false });
  if (patreonUrl) f.push({ name: "Patreon", value: patreonUrl.slice(0, 200), inline: false });
  return f;
}

const ENGINE_SUPPORTED = 1;
const CATALOG_URL = "https://raw.githubusercontent.com/TAZmd/TAZmd-NMS-Corvette-Optimizer-version-check/main/utility-catalog.json";
const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;
const ENGINE_OPS = new Set([
  "const", "has", "count", "chain", "add", "sub", "mul", "div", "min", "max", "clamp", "if",
  "gt", "gte", "lt", "lte", "eq", "ref", "mean", "sumGroup", "size", "weight"
]);

function normalizeId(id) {
  return (id || "").toString().replace(/^\^/, "").toUpperCase();
}

const DEFAULT_CATALOG = {
  "engine": 1,
  "catalogVersion": 3,
  "tiers": {
    "redFactor": 0.5,
    "orangeFactor": 0.75,
    "red": [
      "BUILD_REFINER1",
      "BUILD_REFINER2",
      "BUILD_REFINER3",
      "FRE_ROOM_REFINE",
      "BASE_FLAG",
      "SET_B_MONU",
      "SET_MONUMENT",
      "SET_T_MONU",
      "SET_F_MONU",
      "SET_INT_SHIPSAL",
      "SET_CONSTRUCT",
      "SET_INT_SUMMARY",
      "SET_MAYORTERM"
    ],
    "orange": [
      "BUILDBEACON",
      "MESSAGEMODULE",
      "NPCBUILDERTERM",
      "NPCFARMTERM",
      "NPCSCIENCETERM",
      "NPCVEHICLETERM",
      "NPCWEAPONTERM",
      "SUMMON_GARAGE",
      "GARAGE_B",
      "GARAGE_FLOAT",
      "GARAGE_FREIGHT",
      "GARAGE_L",
      "GARAGE_M",
      "GARAGE_MECH",
      "GARAGE_S",
      "GARAGE_SUB"
    ]
  },
  "groups": [
    {
      "key": "mostRequired",
      "weight": 6
    },
    {
      "key": "goodToHave",
      "weight": 3
    },
    {
      "key": "overboard",
      "weight": 1
    }
  ],
  "items": [
    {
      "key": "base_teleport_module",
      "label": "Base Teleport Module",
      "group": "mostRequired",
      "value": {
        "op": "chain",
        "levels": [
          [
            "TELEPORTER"
          ]
        ]
      }
    },
    {
      "key": "scanner_room",
      "label": "Scanner Room",
      "group": "mostRequired",
      "value": {
        "op": "chain",
        "levels": [
          [
            "FRE_ROOM_SCAN"
          ]
        ]
      }
    },
    {
      "key": "galactic_trade_terminal",
      "label": "Galactic Trade Terminal",
      "group": "mostRequired",
      "value": {
        "op": "chain",
        "levels": [
          [
            "BUILDTERMINAL"
          ]
        ]
      }
    },
    {
      "key": "tractor_beam",
      "label": "Tractor Beam",
      "group": "mostRequired",
      "value": {
        "op": "chain",
        "levels": [
          [
            "B_MAG_1X1"
          ]
        ]
      }
    },
    {
      "key": "storage_containers",
      "label": "Storage containers",
      "group": "goodToHave",
      "value": {
        "op": "min",
        "args": [
          1,
          {
            "op": "count",
            "prefixes": [
              "B_WALL_CARG",
              "CONTAINER"
            ]
          }
        ]
      },
      "badge": {
        "op": "count",
        "prefixes": [
          "B_WALL_CARG",
          "CONTAINER"
        ]
      }
    },
    {
      "key": "mission_radar",
      "label": "Mission Radar",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "B_WALL_TECH1"
          ]
        ]
      }
    },
    {
      "key": "refiner",
      "label": "Refiner",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "FRE_ROOM_REFINE",
            "BUILD_REFINER3",
            "B_WALL_TECH0"
          ],
          [
            "BUILD_REFINER2"
          ],
          [
            "BUILD_REFINER1"
          ]
        ]
      }
    },
    {
      "key": "weapon_case",
      "label": "Weapon Case",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "SET_WEAPONBOX"
          ]
        ]
      }
    },
    {
      "key": "nutrition_unit",
      "label": "Nutrition Unit",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "B_WALL_KITC0"
          ],
          [
            "COOKER"
          ]
        ]
      }
    },
    {
      "key": "weapon_rack",
      "label": "Weapon Rack",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "WEAPONRACK"
          ]
        ]
      }
    },
    {
      "key": "staff_builder",
      "label": "Staff Builder",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "SET_STAFFBUILD"
          ]
        ]
      }
    },
    {
      "key": "hazard_protection_unit",
      "label": "Hazard Protection Unit",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "SHIELDSTATION"
          ]
        ]
      }
    },
    {
      "key": "health_station",
      "label": "Health Station",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "HEALTHSTATION"
          ]
        ]
      }
    },
    {
      "key": "signal_booster",
      "label": "Signal Booster",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "BUILDSIGNAL"
          ]
        ]
      }
    },
    {
      "key": "holo_arena_game_table",
      "label": "Holo-Arena Game Table",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "GAMETABLE"
          ]
        ]
      }
    },
    {
      "key": "exocraft_research_station",
      "label": "Exocraft Research Station",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "AM_EXOCRAFTTREE"
          ]
        ]
      }
    },
    {
      "key": "ship_research_station",
      "label": "Ship Research Station",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "AM_SHIPTREE"
          ]
        ]
      }
    },
    {
      "key": "exosuit_research_station",
      "label": "Exosuit Research Station",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "AM_SUITTREE",
            "S9_SUITTREE"
          ]
        ]
      }
    },
    {
      "key": "multi_tool_research_station",
      "label": "Multi-Tool Research Station",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "AM_WEAPONTREE",
            "S9_WEAPONTREE"
          ]
        ]
      }
    },
    {
      "key": "utopia_build_station",
      "label": "Utopia Build Station",
      "group": "goodToHave",
      "value": {
        "op": "chain",
        "levels": [
          [
            "S9_BUILDERTREE"
          ]
        ]
      }
    },
    {
      "key": "stellar_extractor_room",
      "label": "Stellar Extractor Room",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "FRE_ROOM_EXTR"
          ]
        ]
      }
    },
    {
      "key": "autonomous_mining_unit",
      "label": "Autonomous Mining Unit",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "BUILDHARVESTER"
          ]
        ]
      }
    },
    {
      "key": "gas_harvester",
      "label": "Gas Harvester",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "BUILDGASHARVEST"
          ]
        ]
      }
    },
    {
      "key": "oxygen_harvester",
      "label": "Oxygen Harvester",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "O2_HARVESTER"
          ]
        ]
      }
    },
    {
      "key": "antimatter_reactor",
      "label": "Antimatter Reactor",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "BUILDANTIMATTER"
          ]
        ]
      }
    },
    {
      "key": "appearance_modifier",
      "label": "Appearance Modifier",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "DRESSING_TABLE"
          ]
        ]
      }
    },
    {
      "key": "livestock_unit",
      "label": "Livestock Unit",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "CREATURE_FARM"
          ]
        ]
      }
    },
    {
      "key": "automated_feeder",
      "label": "Automated Feeder",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "CREATURE_FEED"
          ]
        ]
      }
    },
    {
      "key": "nip_plant",
      "label": "Nip Plant",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "NIPPLANT"
          ]
        ]
      }
    },
    {
      "key": "fishpond",
      "label": "Fishpond",
      "group": "overboard",
      "value": {
        "op": "chain",
        "levels": [
          [
            "SET_FISHPOND"
          ]
        ]
      }
    }
  ],
  "score": {
    "op": "add",
    "args": [
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "base_teleport_module"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "mostRequired"
              },
              {
                "op": "size",
                "group": "mostRequired"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "scanner_room"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "mostRequired"
              },
              {
                "op": "size",
                "group": "mostRequired"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "galactic_trade_terminal"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "mostRequired"
              },
              {
                "op": "size",
                "group": "mostRequired"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "tractor_beam"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "mostRequired"
              },
              {
                "op": "size",
                "group": "mostRequired"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "storage_containers"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "mission_radar"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "refiner"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "weapon_case"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "nutrition_unit"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "weapon_rack"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "staff_builder"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "hazard_protection_unit"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "health_station"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "signal_booster"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "holo_arena_game_table"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "exocraft_research_station"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "ship_research_station"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "exosuit_research_station"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "multi_tool_research_station"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "utopia_build_station"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "goodToHave"
              },
              {
                "op": "size",
                "group": "goodToHave"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "stellar_extractor_room"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "autonomous_mining_unit"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "gas_harvester"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "oxygen_harvester"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "antimatter_reactor"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "appearance_modifier"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "livestock_unit"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "automated_feeder"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "nip_plant"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      },
      {
        "op": "mul",
        "args": [
          {
            "op": "ref",
            "key": "fishpond"
          },
          {
            "op": "div",
            "args": [
              {
                "op": "weight",
                "group": "overboard"
              },
              {
                "op": "size",
                "group": "overboard"
              }
            ]
          }
        ]
      }
    ]
  },
  "output": {
    "min": 0,
    "max": 10,
    "decimals": 1
  },
  "tests": [
    {
      "ids": [],
      "score": 0
    },
    {
      "ids": [
        "^JUNK"
      ],
      "score": 0
    },
    {
      "ids": [
        "^TELEPORTER",
        "^FRE_ROOM_SCAN",
        "^BUILDTERMINAL",
        "^B_MAG_1X1"
      ],
      "score": 6
    },
    {
      "ids": [
        "^TELEPORTER",
        "^TELEPORTER",
        "^TELEPORTER"
      ],
      "score": 1.5
    },
    {
      "ids": [
        "^BUILD_REFINER1",
        "^CONTAINER_1",
        "^CONTAINER_2",
        "^NIPPLANT",
        "^NIPPLANT"
      ],
      "score": 0.3
    },
    {
      "ids": [
        "^FRE_ROOM_REFINE",
        "^BUILDBEACON",
        "^GARAGE_S",
        "^SET_MONUMENT"
      ],
      "score": 0.1
    },
    {
      "ids": [
        "^BUILDTERMINAL",
        "^B_MAG_1X1",
        "^CONTAINER_X",
        "^B_WALL_TECH1",
        "^BUILD_REFINER3",
        "^B_WALL_TECH0",
        "^SET_WEAPONBOX",
        "^B_WALL_KITC0",
        "^SET_STAFFBUILD",
        "^SHIELDSTATION",
        "^BUILDSIGNAL",
        "^AM_EXOCRAFTTREE",
        "^AM_SUITTREE",
        "^SET_FISHPOND",
        "^WALL1",
        "^BASE_FLAG",
        "^BUILDBEACON"
      ],
      "score": 4.9
    },
    {
      "ids": [
        "^FRE_ROOM_SCAN",
        "^BUILDTERMINAL",
        "^B_WALL_TECH0",
        "^BUILD_REFINER2",
        "^B_WALL_KITC0",
        "^COOKER",
        "^WEAPONRACK",
        "^AM_EXOCRAFTTREE",
        "^FRE_ROOM_EXTR",
        "^BUILDHARVESTER",
        "^BUILDGASHARVEST",
        "^O2_HARVESTER",
        "^BUILDANTIMATTER",
        "^DRESSING_TABLE",
        "^JUNK",
        "^WALL1",
        "^BASE_FLAG"
      ],
      "score": 4.3
    },
    {
      "ids": [
        "^TELEPORTER",
        "^B_MAG_1X1",
        "^BUILD_REFINER3",
        "^B_WALL_TECH0",
        "^SHIELDSTATION",
        "^AM_EXOCRAFTTREE",
        "^CREATURE_FEED",
        "^JUNK",
        "^BUILDBEACON"
      ],
      "score": 3.6
    },
    {
      "ids": [
        "^B_WALL_CARG_X",
        "^FRE_ROOM_REFINE",
        "^BUILD_REFINER2",
        "^COOKER",
        "^WEAPONRACK",
        "^SET_STAFFBUILD",
        "^SHIELDSTATION",
        "^HEALTHSTATION",
        "^BUILDSIGNAL",
        "^AM_EXOCRAFTTREE",
        "^AM_SHIPTREE",
        "^AM_SUITTREE",
        "^S9_BUILDERTREE",
        "^BUILDHARVESTER",
        "^BUILDGASHARVEST",
        "^BUILDANTIMATTER",
        "^DRESSING_TABLE",
        "^CREATURE_FARM",
        "^CREATURE_FEED",
        "^JUNK",
        "^WALL1",
        "^BASE_FLAG",
        "^BUILDBEACON"
      ],
      "score": 2.7
    },
    {
      "ids": [
        "^B_WALL_TECH1",
        "^BUILD_REFINER3",
        "^COOKER",
        "^HEALTHSTATION",
        "^GAMETABLE",
        "^AM_SHIPTREE",
        "^FRE_ROOM_EXTR",
        "^O2_HARVESTER",
        "^CREATURE_FARM",
        "^NIPPLANT",
        "^BASE_FLAG",
        "^BUILDBEACON"
      ],
      "score": 1.3
    },
    {
      "ids": [
        "^FRE_ROOM_SCAN",
        "^BUILDTERMINAL",
        "^B_WALL_CARG_X",
        "^CONTAINER_X",
        "^B_WALL_TECH1",
        "^FRE_ROOM_REFINE",
        "^BUILD_REFINER3",
        "^B_WALL_TECH0",
        "^BUILD_REFINER2",
        "^BUILD_REFINER1",
        "^SET_WEAPONBOX",
        "^B_WALL_KITC0",
        "^COOKER",
        "^WEAPONRACK",
        "^SET_STAFFBUILD",
        "^SHIELDSTATION",
        "^BUILDSIGNAL",
        "^GAMETABLE",
        "^AM_EXOCRAFTTREE",
        "^AM_SHIPTREE",
        "^AM_SUITTREE",
        "^S9_BUILDERTREE",
        "^FRE_ROOM_EXTR",
        "^BUILDHARVESTER",
        "^BUILDGASHARVEST",
        "^O2_HARVESTER",
        "^BUILDANTIMATTER",
        "^DRESSING_TABLE",
        "^CREATURE_FARM",
        "^CREATURE_FEED",
        "^NIPPLANT",
        "^SET_FISHPOND",
        "^JUNK",
        "^WALL1",
        "^BASE_FLAG",
        "^BUILDBEACON"
      ],
      "score": 6.5
    },
    {
      "ids": [
        "^B_WALL_CARG_X",
        "^CONTAINER_X",
        "^FRE_ROOM_REFINE",
        "^BUILD_REFINER3",
        "^SET_WEAPONBOX",
        "^COOKER",
        "^HEALTHSTATION",
        "^BUILDSIGNAL",
        "^GAMETABLE",
        "^AM_SUITTREE",
        "^BUILDHARVESTER",
        "^BUILDGASHARVEST",
        "^BUILDANTIMATTER",
        "^DRESSING_TABLE",
        "^SET_FISHPOND"
      ],
      "score": 1.8
    },
    {
      "ids": [
        "^CONTAINER_X",
        "^FRE_ROOM_REFINE",
        "^BUILD_REFINER3",
        "^B_WALL_TECH0",
        "^BUILD_REFINER1",
        "^COOKER",
        "^WEAPONRACK",
        "^HEALTHSTATION",
        "^AM_WEAPONTREE",
        "^S9_BUILDERTREE",
        "^FRE_ROOM_EXTR",
        "^BUILDHARVESTER",
        "^BUILDANTIMATTER",
        "^DRESSING_TABLE",
        "^CREATURE_FARM",
        "^CREATURE_FEED",
        "^NIPPLANT",
        "^SET_FISHPOND",
        "^JUNK",
        "^BUILDBEACON"
      ],
      "score": 1.9
    },
    {
      "ids": [
        "^FRE_ROOM_SCAN",
        "^BUILDTERMINAL",
        "^B_WALL_CARG_X",
        "^CONTAINER_X",
        "^FRE_ROOM_REFINE",
        "^B_WALL_TECH0",
        "^BUILD_REFINER2",
        "^BUILD_REFINER1",
        "^SET_WEAPONBOX",
        "^B_WALL_KITC0",
        "^COOKER",
        "^WEAPONRACK",
        "^SET_STAFFBUILD",
        "^SHIELDSTATION",
        "^HEALTHSTATION",
        "^BUILDSIGNAL",
        "^GAMETABLE",
        "^AM_WEAPONTREE",
        "^S9_BUILDERTREE",
        "^BUILDHARVESTER",
        "^DRESSING_TABLE",
        "^CREATURE_FARM",
        "^CREATURE_FEED",
        "^JUNK",
        "^WALL1",
        "^BASE_FLAG",
        "^BUILDBEACON"
      ],
      "score": 5.6
    },
    {
      "ids": [
        "^B_WALL_TECH1",
        "^FRE_ROOM_REFINE",
        "^BUILD_REFINER2",
        "^SET_WEAPONBOX",
        "^COOKER",
        "^AM_EXOCRAFTTREE",
        "^S9_BUILDERTREE",
        "^BUILDHARVESTER",
        "^O2_HARVESTER",
        "^BUILDANTIMATTER",
        "^CREATURE_FARM",
        "^NIPPLANT",
        "^JUNK",
        "^WALL1"
      ],
      "score": 1.4
    }
  ]
};

function evalNode(node, cat, ctx, depth) {
  if (typeof node === "number") return node;
  if (!node || typeof node !== "object") throw new Error("bad node");
  if (depth > 60) throw new Error("too deep");
  const d = depth + 1;
  const args = () => (node.args || []).map((x) => evalNode(x, cat, ctx, d));
  switch (node.op) {
    case "const":
      return Number(node.value);
    case "has":
      return (node.ids || []).some((i) => ctx.present.has(normalizeId(i))) ? 1 : 0;
    case "count": {
      const ids = (node.ids || []).map(normalizeId);
      const prefixes = (node.prefixes || []).map(normalizeId);
      let n = 0;
      for (const id of ctx.ids) {
        if (ids.includes(id) || prefixes.some((p) => id.startsWith(p))) n++;
      }
      return n;
    }
    case "chain": {
      const levels = node.levels || [];
      for (let lvl = 0; lvl < levels.length; lvl++) {
        for (const cand of levels[lvl]) {
          const c = normalizeId(cand);
          if (!ctx.present.has(c)) continue;
          const levelValue = 1 - lvl / levels.length;
          const t = cat.__tiers;
          const penalty = t.red.has(c) ? t.redFactor : t.orange.has(c) ? t.orangeFactor : 1.0;
          return levelValue * penalty;
        }
      }
      return 0;
    }
    case "add": return args().reduce((s, v) => s + v, 0);
    case "mul": return args().reduce((s, v) => s * v, 1);
    case "min": return Math.min(...args());
    case "max": return Math.max(...args());
    case "sub": { const v = args(); return v[0] - v[1]; }
    case "div": { const v = args(); return v[1] === 0 ? 0 : v[0] / v[1]; }
    case "clamp": { const v = args(); return Math.min(Math.max(v[0], v[1]), v[2]); }
    case "if": {
      const c = evalNode(node.args[0], cat, ctx, d);
      return c > 0 ? evalNode(node.args[1], cat, ctx, d) : evalNode(node.args[2], cat, ctx, d);
    }
    case "gt": { const v = args(); return v[0] > v[1] ? 1 : 0; }
    case "gte": { const v = args(); return v[0] >= v[1] ? 1 : 0; }
    case "lt": { const v = args(); return v[0] < v[1] ? 1 : 0; }
    case "lte": { const v = args(); return v[0] <= v[1] ? 1 : 0; }
    case "eq": { const v = args(); return v[0] === v[1] ? 1 : 0; }
    case "ref": return itemValue(node.key, cat, ctx, d);
    case "mean": {
      const g = cat.__groups[node.group].items;
      let sum = 0;
      for (const it of g) sum += itemValue(it.key, cat, ctx, d);
      return g.length === 0 ? 0 : sum / g.length;
    }
    case "sumGroup": {
      let sum = 0;
      for (const it of cat.__groups[node.group].items) sum += itemValue(it.key, cat, ctx, d);
      return sum;
    }
    case "size":
      return cat.__groups[node.group].items.length;
    case "weight":
      return cat.__groups[node.group].weight;
    default:
      throw new Error("unknown op " + node.op);
  }
}

function itemValue(key, cat, ctx, depth) {
  if (Object.prototype.hasOwnProperty.call(ctx.memo, key)) return ctx.memo[key];
  const it = cat.__items[key];
  if (!it) throw new Error("unknown item " + key);
  const v = evalNode(it.value, cat, ctx, depth);
  ctx.memo[key] = v;
  return v;
}

function prepareCatalog(c) {
  const t = c.tiers || {};
  c.__tiers = {
    red: new Set((t.red || []).map(normalizeId)),
    orange: new Set((t.orange || []).map(normalizeId)),
    redFactor: typeof t.redFactor === "number" ? t.redFactor : 0.5,
    orangeFactor: typeof t.orangeFactor === "number" ? t.orangeFactor : 0.75
  };
  c.__groups = {};
  for (const g of c.groups) c.__groups[g.key] = { weight: g.weight, items: [] };
  c.__items = {};
  for (const it of c.items) {
    c.__items[it.key] = it;
    c.__groups[it.group].items.push(it);
  }
  return c;
}

function runEngine(cat, objectIds) {
  const ids = objectIds.map(normalizeId);
  const ctx = { ids, present: new Set(ids), memo: {} };
  const items = [];
  for (const it of cat.items) {
    const value = itemValue(it.key, cat, ctx, 0);
    if (value > 0) {
      const badge = it.badge ? evalNode(it.badge, cat, ctx, 0) : null;
      items.push({ label: it.label, value, badge });
    }
  }
  let score = evalNode(cat.score, cat, ctx, 0);
  const out = cat.output || {};
  if (typeof out.min === "number") score = Math.max(score, out.min);
  if (typeof out.max === "number") score = Math.min(score, out.max);
  const f = Math.pow(10, typeof out.decimals === "number" ? out.decimals : 1);
  return { score: Math.round(score * f) / f, items };
}

function validateNode(node, c, groupKeys, itemKeys) {
  if (typeof node === "number") return;
  if (!node || typeof node !== "object" || !ENGINE_OPS.has(node.op)) throw new Error("bad op");
  if (node.op === "ref" && !itemKeys.has(node.key)) throw new Error("bad ref");
  if ((node.op === "mean" || node.op === "sumGroup" || node.op === "size" || node.op === "weight") && !groupKeys.has(node.group)) throw new Error("bad group");
  if (node.op === "chain" && !Array.isArray(node.levels)) throw new Error("bad chain");
  if (["sub", "div", "gt", "gte", "lt", "lte", "eq"].includes(node.op) && (!Array.isArray(node.args) || node.args.length !== 2)) throw new Error("bad args");
  if (["clamp", "if"].includes(node.op) && (!Array.isArray(node.args) || node.args.length !== 3)) throw new Error("bad args");
  if (["add", "mul", "min", "max"].includes(node.op) && (!Array.isArray(node.args) || node.args.length === 0)) throw new Error("bad args");
  for (const a of node.args || []) validateNode(a, c, groupKeys, itemKeys);
}

function validCatalog(c) {
  try {
    if (!c || typeof c !== "object") return false;
    if (typeof c.engine !== "number" || c.engine < 1 || c.engine > ENGINE_SUPPORTED) return false;
    if (typeof c.catalogVersion !== "number") return false;
    if (!Array.isArray(c.groups) || !Array.isArray(c.items) || c.items.length === 0) return false;
    const groupKeys = new Set(c.groups.map((g) => g.key));
    const itemKeys = new Set(c.items.map((i) => i.key));
    if (groupKeys.size !== c.groups.length || itemKeys.size !== c.items.length) return false;
    for (const it of c.items) {
      if (typeof it.label !== "string" || !groupKeys.has(it.group)) return false;
      validateNode(it.value, c, groupKeys, itemKeys);
      if (it.badge) validateNode(it.badge, c, groupKeys, itemKeys);
    }
    validateNode(c.score, c, groupKeys, itemKeys);
    prepareCatalog(c);
    for (const t of c.tests || []) {
      if (Math.abs(runEngine(c, t.ids).score - t.score) > 1e-9) return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

let ACTIVE_CATALOG = prepareCatalog(DEFAULT_CATALOG);
let catalogCheckedAt = 0;

function utilCatalogVersion() {
  return ACTIVE_CATALOG.catalogVersion;
}

async function ensureCatalog(env, force) {
  const now = Date.now();
  if (!force && now - catalogCheckedAt < CATALOG_TTL_MS) return;
  catalogCheckedAt = now;
  try {
    const init = { signal: AbortSignal.timeout(1500) };
    if (!force) init.cf = { cacheTtl: 43200, cacheEverything: true };
    const resp = await fetch(CATALOG_URL, init);
    if (!resp.ok) return;
    const c = JSON.parse(await resp.text());
    if (!validCatalog(c)) return;
    ACTIVE_CATALOG = c;
  } catch (err) {
    console.error("ensureCatalog failed: " + (err && err.message ? err.message : String(err)));
  }
}

function idsFromShipText(text) {
  const ids = [];
  const re = /"ObjectID"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) ids.push(m[1]);
  return ids;
}

function scoreShip(objectIds) {
  const res = runEngine(ACTIVE_CATALOG, objectIds);
  const utilities = res.items.map((it) => {
    if (it.badge !== null && it.badge !== undefined) return { label: `${it.badge} ${it.label}` };
    return { label: it.label, value: Math.round(it.value * 100) / 100 };
  });
  return { score: res.score, utilities };
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

function matchBracket(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractObjectsArrayText(text, key = "Objects") {
  let depth = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === "\\") j++;
        j++;
      }
      if (depth === 1 && text.slice(i + 1, j) === key) {
        let k = j + 1;
        while (k < n && /\s/.test(text[k])) k++;
        if (text[k] === ":") {
          k++;
          while (k < n && /\s/.test(text[k])) k++;
          if (text[k] === "[") {
            const end = matchBracket(text, k);
            if (end > 0) {
              const lineStart = text.lastIndexOf("\n", i) + 1;
              const lead = text.slice(lineStart, i);
              const indent = /^[ \t]*$/.test(lead) ? lead : "";
              const lines = text.slice(k, end + 1).split("\n");
              const fixed = lines.map((line, idx) => (idx > 0 && indent && line.startsWith(indent) ? line.slice(indent.length) : line));
              return fixed.join("\n");
            }
          }
        }
      }
      i = j + 1;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    i++;
  }
  return null;
}

function sameJson(a, b) {
  try {
    return JSON.stringify(JSON.parse(a)) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
}

function prettyPrintJsonText(text) {
  const unit = "    ";
  let out = "";
  let level = 0;
  let i = 0;
  const n = text.length;
  const nl = () => "\n" + unit.repeat(Math.max(level, 0));
  while (i < n) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === "\\") j++;
        j++;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "{" || c === "[") {
      let k = i + 1;
      while (k < n && /\s/.test(text[k])) k++;
      const close = c === "{" ? "}" : "]";
      if (text[k] === close) {
        out += c + close;
        i = k + 1;
        continue;
      }
      level++;
      out += c + nl();
      i++;
      continue;
    }
    if (c === "}" || c === "]") {
      level--;
      out += nl() + c;
      i++;
      continue;
    }
    if (c === ",") {
      out += "," + nl();
      i++;
      continue;
    }
    if (c === ":") {
      out += ": ";
      i++;
      continue;
    }
    let j = i;
    while (j < n && !/[\s,\]\}:]/.test(text[j])) j++;
    out += text.slice(i, j);
    i = j;
  }
  return out;
}

function ensureLayout(objectsText) {
  if (objectsText.includes("\n")) return objectsText;
  try {
    const pretty = prettyPrintJsonText(objectsText);
    if (sameJson(pretty, JSON.parse(objectsText))) return pretty;
  } catch (e) {}
  return objectsText;
}

function objectsTextKeepingLayout(text, objects, key = "Objects") {
  const raw = extractObjectsArrayText(text, key);
  if (raw) {
    if (raw.includes("\n") && sameJson(raw, objects)) return raw;
    const pretty = prettyPrintJsonText(raw);
    if (sameJson(pretty, objects)) return pretty;
  }
  return JSON.stringify(objects, null, 4);
}

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
    return { ok: true, objectsText: ensureLayout(objectsText) };
  }

  const text = new TextDecoder().decode(bytes);
  let objectsText = text;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      objectsText = ensureLayout(text);
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.Objects)) {
      objectsText = objectsTextKeepingLayout(text, parsed.Objects, "Objects");
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.Prefab)) {
      objectsText = objectsTextKeepingLayout(text, parsed.Prefab, "Prefab");
    } else {
      return { ok: false, error: "file is not a list of objects" };
    }
  } catch (e) {
    return { ok: false, error: "file is not valid JSON" };
  }
  return { ok: true, objectsText };
}

function bytesToBase64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function utf8ToBase64(str) {
  return bytesToBase64(new TextEncoder().encode(str));
}

function arrayBufferToBase64(buf) {
  return bytesToBase64(new Uint8Array(buf));
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
  const allowed = new Set(["objects.json", "so.json", "ccd.json"]);
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

const INSTALL_ID_RE = /^([0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
const STAT_CAP_PER_HOUR = 10;
const STAT_CAP_PER_DAY = 25;
const STAT_MAX_IDS_PER_IP = 2;
const SHIP_WINDOW_MS = 30 * 60 * 1000;
const SHIP_LIMIT = 10;
const ALL_WINDOW_MS = 60 * 60 * 1000;
const ALL_LIMIT = 60;
const REJECT_WINDOW_MS = 30 * 60 * 1000;
const REJECT_LIMIT = 10;
const MAX_PENDING_ITEMS = 100;
const BLOCKED_MESSAGE = "It appears that you are blocked from using this feature. If you think this is a mistake, please contact the owner or staff.";

function userBanKey(discordId) {
  return `ban:user:${discordId}`;
}

async function ipBanKey(ip, env) {
  if (!deleteCodesReady(env)) return null;
  const h = await hashDeleteCode("ban:ip", ip, env);
  return `ban:ip:${h.slice(0, 32)}`;
}

async function installBanKey(installId, env) {
  if (!installId || !deleteCodesReady(env)) return null;
  const h = await hashDeleteCode("ban:id", installId.toLowerCase(), env);
  return `ban:id:${h.slice(0, 32)}`;
}

async function isBanned(env, keys) {
  if (!env.DELETE_CODES) return false;
  for (const k of keys) {
    if (k && (await env.DELETE_CODES.get(k))) return true;
  }
  return false;
}

async function addBan(env, key, label, reason, strikes) {
  if (!env.DELETE_CODES || !key) return;
  await env.DELETE_CODES.put(key, JSON.stringify({ label, reason, at: new Date().toISOString(), strikes: strikes || [] }));
}

async function saveSubmissionOwner(slug, ipKey, userKey, label, env, discordId, discordName, verified) {
  if (!env.DELETE_CODES || (!ipKey && !userKey && !discordId)) return;
  await env.DELETE_CODES.put(
    `sub:${slug}`,
    JSON.stringify({ ipKey: ipKey || null, userKey: userKey || null, label, discordId: discordId || null, discordName: discordName || null, verified: verified === true })
  );
}

async function getSubmissionOwner(slug, env) {
  if (!env.DELETE_CODES) return null;
  const raw = await env.DELETE_CODES.get(`sub:${slug}`);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    if (!rec.discordId && rec.userKey) {
      const linked = await env.DELETE_CODES.get(linkKey(rec.userKey));
      if (linked) {
        rec.discordId = linked;
        rec.discordFromLink = true;
      }
    }
    return rec;
  } catch (e) {
    return null;
  }
}

function approvalComponents(slug, disabled, supervisor) {
  if (supervisor) {
    return [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Approve", custom_id: `approve:${slug}`, disabled: !!disabled },
          { type: 2, style: 4, label: "Reject", custom_id: `reject:${slug}`, disabled: !!disabled },
          { type: 2, style: 4, label: "Reject & ban", custom_id: `rejban:${slug}`, disabled: !!disabled }
        ]
      }
    ];
  }
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "Approve", custom_id: `approve:${slug}`, disabled: !!disabled },
        { type: 2, style: 4, label: "Reject", custom_id: `tosup:${slug}`, disabled: !!disabled },
        { type: 2, style: 2, label: "Timeout 24h", custom_id: `timeout:${slug}`, disabled: !!disabled },
        { type: 2, style: 1, label: "Supervisor reject", custom_id: `reject:${slug}`, disabled: !!disabled }
      ]
    }
  ];
}

function imageExt(type) {
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return "jpg";
}

let lastApprovalError = "";

async function postApprovalMessage(env, embed, slug, images, channelId, supervisor) {
  lastApprovalError = "";
  const channel = channelId || env.APPROVAL_CHANNEL_ID;
  try {
    const ownerRec = slug ? await getSubmissionOwner(slug, env) : null;
    if (ownerRec && ownerRec.verified) {
      embed = {
        ...embed,
        title: `\u2705 VERIFIED UPLOADER - ${embed.title || slug}`.slice(0, 250),
        color: 0x2d7a2d,
        description: "# \u2705 VERIFIED UPLOADER\n**This ship comes from a verified member of our Discord. The chance that it is stolen is very low.**" + (embed.description ? "\n\n" + embed.description : "")
      };
    }
  } catch (e) {
    console.error("verified banner failed for " + slug);
  }
  const list = (Array.isArray(images) ? images : images ? [images] : []).filter(Boolean).slice(0, 3);
  const items = list.map((img, i) => {
    const bytes = new Uint8Array(img);
    const type = sniffImageType(bytes) || "image/jpeg";
    return { bytes, type, filename: `preview${i + 1}.${imageExt(type)}` };
  });
  const galleryUrl = workerOrigin || "https://discord.com";
  const buildEmbeds = (urls, base) =>
    urls.length < 2
      ? [{ ...base, image: { url: urls[0] } }]
      : urls.map((u, i) => (i === 0 ? { ...base, url: galleryUrl, image: { url: u } } : { url: galleryUrl, image: { url: u } }));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const withImage = items.length > 0 && attempt < 3;
    try {
      let resp;
      if (withImage) {
        const form = new FormData();
        form.append(
          "payload_json",
          JSON.stringify({
            embeds: buildEmbeds(items.map((it) => `attachment://${it.filename}`), embed),
            components: approvalComponents(slug, false, supervisor),
            attachments: items.map((it, i) => ({ id: i, filename: it.filename }))
          })
        );
        items.forEach((it, i) => form.append(`files[${i}]`, new Blob([it.bytes], { type: it.type }), it.filename));
        resp = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
          body: form
        });
      } else {
        let outEmbeds = [embed];
        if (items.length) {
          const urls = [];
          for (let i = 0; i < items.length; i++) {
            const u = await pendingImageUrl(slug, env, i);
            if (u) urls.push(u);
          }
          const base = {
            ...embed,
            fields: [
              ...(embed.fields || []),
              { name: "Image note", value: "The photo could not be attached. Use the Images links above to check it before you approve.", inline: false }
            ]
          };
          outEmbeds = urls.length ? buildEmbeds(urls, base) : [base];
        }
        resp = await discordApi(`/channels/${channel}/messages`, env, {
          method: "POST",
          body: JSON.stringify({ embeds: outEmbeds, components: approvalComponents(slug, false, supervisor) })
        });
      }
      if (resp.ok) return true;
      const text = await resp.text();
      lastApprovalError = `${withImage ? "with image" : "without image"}: ${resp.status} ${text}`.slice(0, 350);
      console.error("post to approval channel failed: " + lastApprovalError);
    } catch (err) {
      lastApprovalError = `${withImage ? "with image" : "without image"}: ${err && err.message ? err.message : String(err)}`.slice(0, 350);
      console.error("post to approval channel error: " + lastApprovalError);
    }
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  return false;
}

async function editApprovalMessage(env, messageId, payload, channelId) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await discordApi(`/channels/${channelId || env.APPROVAL_CHANNEL_ID}/messages/${messageId}`, env, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      if (resp.ok) return true;
      console.error("edit approval message failed: " + resp.status + " " + (await resp.text()));
    } catch (err) {
      console.error("edit approval message error: " + (err && err.message ? err.message : String(err)));
    }
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  return false;
}

async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: false, codes: ["missing-input-secret"] };
  if (!token) return { ok: false, codes: ["missing-token"] };
  try {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET_KEY);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form
    });
    const data = await resp.json();
    return { ok: !!data.success, codes: data["error-codes"] || [] };
  } catch (e) {
    return { ok: false, codes: ["verification-service-error"] };
  }
}

function turnstileMessage(codes) {
  const list = codes && codes.length ? codes : ["unknown"];
  const tag = " [" + list.join(", ") + "]";
  if (list.includes("missing-token") || list.includes("missing-input-response")) {
    return "The verification check was not finished. Wait for the green check mark, then submit again." + tag;
  }
  if (list.includes("timeout-or-duplicate")) {
    return "The verification expired or was already used. Wait a few seconds until the check renews, then submit again." + tag;
  }
  if (list.includes("invalid-input-response")) {
    return "The verification was not accepted. Reload the page and try again." + tag;
  }
  if (list.includes("invalid-input-secret") || list.includes("missing-input-secret")) {
    return "Server setting problem: the Turnstile secret key is wrong or missing. Tell the admin." + tag;
  }
  if (list.includes("verification-service-error") || list.includes("internal-error")) {
    return "The verification service did not answer. Try again in a moment." + tag;
  }
  return "Verification failed. Reload the page and try again." + tag;
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

const INDEX_SHARD_MAX = 300;
const OBJECT_ACCEPT = "application/vnd.github.object+json";

function shardPath(n) {
  return n === 1 ? "index.json" : `index-${n}.json`;
}

const DEFAULT_PUBLIC_BASE = "https://nmsco-corvette-library.tazmd.workers.dev";

function storageMode(env) {
  const m = (env.STORAGE_BACKEND || "github").toString().toLowerCase();
  if ((m === "r2" || m === "both") && env.SHIPS) return m;
  return "github";
}

function isShipFilePath(path) {
  return /^ships\/[a-z0-9-]{1,80}\/ship\.json$/.test(path);
}

function pathMode(env, path) {
  return isShipFilePath(path) ? storageMode(env) : "github";
}

function contentTypeFor(path, bytes) {
  if (path.endsWith(".json")) return "application/json";
  if (bytes && bytes.length > 3) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
    if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  }
  return "application/octet-stream";
}

function shipFileUrl(env, id, fname, v) {
  return `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${env.GITHUB_BRANCH || "main"}/ships/${id}/${fname}?v=${v}`;
}

async function ghReadText(env, path) {
  const resp = await ghRequest(`/contents/${path}`, env, { method: "GET", headers: { Accept: OBJECT_ACCEPT } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Could not read ${path}: ${resp.status}`);
  const data = await resp.json();
  return { text: decodeBase64Utf8(data.content), sha: data.sha };
}

async function storageReadText(env, path) {
  const mode = pathMode(env, path);
  if (mode === "github") return ghReadText(env, path);
  const obj = await env.SHIPS.get(path);
  if (obj) return { text: await obj.text(), sha: undefined };
  if (mode === "r2" || !env.GITHUB_TOKEN) return null;
  const gh = await ghReadText(env, path);
  if (!gh) return null;
  try {
    await env.SHIPS.put(path, new TextEncoder().encode(gh.text), { httpMetadata: { contentType: contentTypeFor(path) } });
  } catch (e) {
    console.error("seed to r2 failed for " + path);
  }
  return gh;
}

async function storageReadBytes(env, path) {
  const mode = pathMode(env, path);
  if (mode !== "github") {
    const obj = await env.SHIPS.get(path);
    if (obj) return await obj.arrayBuffer();
    if (mode === "r2" || !env.GITHUB_TOKEN) return null;
  }
  const resp = await ghRequest(`/contents/${path}`, env, { method: "GET", headers: { Accept: "application/vnd.github.raw" } });
  if (!resp.ok) return null;
  return await resp.arrayBuffer();
}

async function storageWriteText(env, path, text, message, sha) {
  const mode = pathMode(env, path);
  if (mode === "github") {
    const body = { message, content: utf8ToBase64(text) };
    if (sha) body.sha = sha;
    const resp = await ghRequest(`/contents/${path}`, env, { method: "PUT", body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`${path} update failed: ${resp.status} ${await resp.text()}`);
    return;
  }
  await env.SHIPS.put(path, new TextEncoder().encode(text), { httpMetadata: { contentType: contentTypeFor(path) } });
  if (mode === "both" && env.GITHUB_TOKEN) {
    try {
      await ghPutFile(path, utf8ToBase64(text), message, env);
    } catch (e) {
      console.error("github mirror failed for " + path + ": " + (e && e.message ? e.message : String(e)));
    }
  }
}

async function readShard(env, n) {
  const got = await storageReadText(env, shardPath(n));
  if (!got) return null;
  let list = [];
  try {
    list = JSON.parse(got.text);
    if (!Array.isArray(list)) list = [];
  } catch (e) {
    list = [];
  }
  return { n, path: shardPath(n), sha: got.sha, list };
}

async function writeShard(env, sh, message) {
  await storageWriteText(env, sh.path, JSON.stringify(sh.list, null, 2), message, sh.sha);
}

async function readIndexShards(env) {
  const shards = [];
  for (let n = 1; n <= 200; n++) {
    const sh = await readShard(env, n);
    if (!sh) break;
    shards.push(sh);
  }
  if (shards.length === 0) shards.push({ n: 1, path: "index.json", sha: undefined, list: [] });
  return shards;
}

async function findInIndex(env, id) {
  for (let n = 1; n <= 200; n++) {
    const sh = await readShard(env, n);
    if (!sh) return null;
    const entry = sh.list.find((e) => e.id === id);
    if (entry) return { shard: sh, entry };
  }
  return null;
}

async function addToIndex(env, entry, message) {
  const max = parseInt(env.INDEX_SHARD_MAX, 10) || INDEX_SHARD_MAX;
  const shards = await readIndexShards(env);
  for (const sh of shards) {
    const before = sh.list.length;
    sh.list = sh.list.filter((e) => e.id !== entry.id);
    sh.changed = sh.list.length !== before;
  }
  let last = shards[shards.length - 1];
  if (last.list.length >= max) {
    last = { n: last.n + 1, path: shardPath(last.n + 1), sha: undefined, list: [] };
    shards.push(last);
  }
  last.list.push(entry);
  last.changed = true;
  for (const sh of shards) {
    if (sh.changed) await writeShard(env, sh, message);
  }
}

async function ghPutFile(path, contentB64, message, env) {
  let resp = await ghRequest(`/contents/${path}`, env, {
    method: "PUT",
    body: JSON.stringify({ message, content: contentB64 })
  });
  if (resp.status === 422 || resp.status === 409) {
    const getResp = await ghRequest(`/contents/${path}`, env, { method: "GET" });
    if (getResp.ok) {
      const existing = await getResp.json();
      resp = await ghRequest(`/contents/${path}`, env, {
        method: "PUT",
        body: JSON.stringify({ message, content: contentB64, sha: existing.sha })
      });
    }
  }
  if (!resp.ok) {
    throw new Error(`GitHub PUT ${path} failed: ${resp.status} ${await resp.text()}`);
  }
}

async function putFile(path, contentB64, message, env) {
  const mode = pathMode(env, path);
  if (mode === "github") return ghPutFile(path, contentB64, message, env);
  const bytes = base64ToBytes(contentB64);
  await env.SHIPS.put(path, bytes, { httpMetadata: { contentType: contentTypeFor(path, bytes) } });
  if (mode === "both" && env.GITHUB_TOKEN) {
    try {
      await ghPutFile(path, contentB64, message, env);
    } catch (e) {
      console.error("github mirror failed for " + path + ": " + (e && e.message ? e.message : String(e)));
    }
  }
}

function deleteCodesReady(env) {
  return !!(env.DELETE_CODES && env.DELETE_PEPPER);
}

async function hashDeleteCode(slug, code, env) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.DELETE_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${slug}:${code}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function removeDeleteCode(slug, env) {
  try {
    if (env.DELETE_CODES) await env.DELETE_CODES.delete(`code:${slug}`);
  } catch (err) {
    console.error("removeDeleteCode failed: " + (err && err.message ? err.message : String(err)));
  }
}

const MAX_PENDING_BYTES = 12 * 1024 * 1024;
const PENDING_CHUNK = 1000000;
let workerOrigin = "";

function base64ToBytes(b64) {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(b64);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pendingPut(env, slug, packed, meta) {
  if (env.DB) {
    await ensureD1(env);
    const bytes = new Uint8Array(packed);
    const stmts = [env.DB.prepare("DELETE FROM pending WHERE slug = ?").bind(slug)];
    for (let off = 0, part = 0; ; off += PENDING_CHUNK, part++) {
      const slice = bytes.subarray(off, Math.min(off + PENDING_CHUNK, bytes.length));
      stmts.push(
        env.DB.prepare("INSERT INTO pending (slug, part, data, meta) VALUES (?, ?, ?, ?)")
          .bind(slug, part, bytesToBase64(slice), part === 0 ? JSON.stringify(meta) : null)
      );
      if (off + PENDING_CHUNK >= bytes.length) break;
    }
    await env.DB.batch(stmts);
    return;
  }
  await env.DELETE_CODES.put(`pend:${slug}`, packed, { metadata: meta });
}

async function pendingGet(env, slug) {
  if (env.DB) {
    await ensureD1(env);
    const res = await env.DB.prepare("SELECT data FROM pending WHERE slug = ? ORDER BY part").bind(slug).all();
    const rows = res.results || [];
    if (rows.length) {
      const parts = rows.map((r) => base64ToBytes(r.data));
      let total = 0;
      for (const p of parts) total += p.length;
      const out = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out.buffer;
    }
  }
  if (env.DELETE_CODES) return await env.DELETE_CODES.get(`pend:${slug}`, "arrayBuffer");
  return null;
}

async function pendingDelete(env, slug) {
  let removed = false;
  if (env.DB) {
    await ensureD1(env);
    const r = await env.DB.prepare("DELETE FROM pending WHERE slug = ?").bind(slug).run();
    if (r && r.meta && r.meta.changes > 0) removed = true;
  }
  if (env.DELETE_CODES) {
    const had = await env.DELETE_CODES.get(`pend:${slug}`, "arrayBuffer");
    if (had) {
      await env.DELETE_CODES.delete(`pend:${slug}`);
      removed = true;
    }
  }
  return removed;
}

async function pendingList(env, limit = 10) {
  const out = [];
  if (env.DB) {
    await ensureD1(env);
    const res = await env.DB.prepare("SELECT slug, meta FROM pending WHERE part = 0 LIMIT ?").bind(limit).all();
    for (const row of res.results || []) {
      let md = {};
      try {
        md = JSON.parse(row.meta || "{}");
      } catch (e) {}
      out.push({ slug: row.slug, md });
    }
  }
  if (env.DELETE_CODES) {
    const res = await env.DELETE_CODES.list({ prefix: "pend:" });
    for (const k of res.keys.slice(0, limit)) out.push({ slug: k.name.slice(5), md: k.metadata || {} });
  }
  return out.slice(0, limit);
}

async function pendingHeader(env, slug) {
  try {
    if (env.DB) {
      await ensureD1(env);
      const row = await env.DB.prepare("SELECT data FROM pending WHERE slug = ? AND part = 0").bind(slug).first();
      if (row && row.data) {
        const bytes = base64ToBytes(row.data);
        const headLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
        if (4 + headLen <= bytes.length) {
          return JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headLen))).info || null;
        }
      }
    }
    const buf = await pendingGet(env, slug);
    if (buf) return unpackPending(buf).info;
  } catch (e) {
    console.error("pendingHeader failed for " + slug);
  }
  return null;
}

function packPending(info, shipText, images) {
  const enc = new TextEncoder();
  const shipBytes = enc.encode(shipText);
  const head = { info, shipLen: shipBytes.length, imgLens: images.map((b) => b.byteLength) };
  const headBytes = enc.encode(JSON.stringify(head));
  let total = 4 + headBytes.length + shipBytes.length;
  for (const b of images) total += b.byteLength;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, headBytes.length);
  let off = 4;
  out.set(headBytes, off);
  off += headBytes.length;
  out.set(shipBytes, off);
  off += shipBytes.length;
  for (const b of images) {
    out.set(new Uint8Array(b), off);
    off += b.byteLength;
  }
  return out.buffer;
}

function unpackPending(buf) {
  const view = new DataView(buf);
  const headLen = view.getUint32(0);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen)));
  let off = 4 + headLen;
  const shipBytes = new Uint8Array(buf, off, head.shipLen);
  off += head.shipLen;
  const images = [];
  for (const len of head.imgLens) {
    images.push(new Uint8Array(buf, off, len));
    off += len;
  }
  return { info: head.info, shipBytes, images };
}

function sniffImageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  return "application/octet-stream";
}

async function pendingImageUrl(slug, env, n = 0) {
  if (!env.DELETE_PEPPER || !workerOrigin) return undefined;
  const sig = (await hashDeleteCode(`img:${slug}`, String(n), env)).slice(0, 24);
  return `${workerOrigin}/img/${slug}/${n}?s=${sig}`;
}

const SHIP_ENTRY_KEYS = new Set(["ObjectID", "UserData", "Position", "Up", "At", "Timestamp", "Message"]);

function inspectShipText(objectsText) {
  let arr;
  try {
    arr = JSON.parse(objectsText);
  } catch (e) {
    return "WARNING - the file is not valid JSON";
  }
  if (!Array.isArray(arr)) return "WARNING - the file is not a list";
  const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && isFinite(n));
  let badShape = 0;
  let longText = 0;
  let badMessage = 0;
  let bigMessage = 0;
  let maxMessage = 0;
  let totalMessage = 0;
  const odd = new Set();
  for (const e of arr) {
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      badShape++;
      continue;
    }
    for (const k of Object.keys(e)) {
      if (!SHIP_ENTRY_KEYS.has(k)) odd.add(k.slice(0, 30));
      else if (k === "Message") {
        if (typeof e[k] !== "string" || !(/^[A-Za-z0-9+/=\s]*$/.test(e[k]) || /^FOS_[A-Za-z0-9_]{1,48}$/.test(e[k]))) {
          badMessage++;
        } else {
          totalMessage += e[k].length;
          if (e[k].length > maxMessage) maxMessage = e[k].length;
          if (e[k].length > 65536) bigMessage++;
        }
      } else if (typeof e[k] === "string" && e[k].length > 80) longText++;
    }
    if (typeof e.ObjectID !== "string" || !e.ObjectID || !isVec(e.Position) || !isVec(e.Up) || !isVec(e.At)) badShape++;
  }
  const bigTotal = totalMessage > 524288;
  if (badShape === 0 && odd.size === 0 && longText === 0 && badMessage === 0 && bigMessage === 0 && !bigTotal) {
    const extra = maxMessage > 0 ? ` (largest Message: ${Math.max(1, Math.round(maxMessage / 1024))} KB, all Messages: ${Math.max(1, Math.round(totalMessage / 1024))} KB)` : "";
    return `OK - all ${arr.length} objects have the normal fields${extra}`;
  }
  const parts = [];
  if (badShape) parts.push(`${badShape} entries have a wrong shape`);
  if (odd.size) parts.push(`unexpected fields: ${[...odd].slice(0, 5).join(", ")}`);
  if (longText) parts.push(`${longText} very long text values`);
  if (badMessage) parts.push(`${badMessage} Message values are not plain base64`);
  if (bigMessage) parts.push(`${bigMessage} Message values are over 64 KB`);
  if (bigTotal) parts.push(`all Messages together are over 512 KB`);
  return `WARNING - ${parts.join("; ")}. Open the JSON and check it.`;
}

async function pendingShipUrl(slug, env) {
  if (!env.DELETE_PEPPER || !workerOrigin) return undefined;
  const sig = (await hashDeleteCode(`ship:${slug}`, "0", env)).slice(0, 24);
  return `${workerOrigin}/ship/${slug}?s=${sig}`;
}

async function handlePendingShip(url, env) {
  const m = url.pathname.match(/^\/ship\/([a-z0-9-]{1,80})$/);
  if (!m || (!env.DB && !env.DELETE_CODES) || !env.DELETE_PEPPER) return new Response("Not found", { status: 404 });
  const slug = m[1];
  const sig = (await hashDeleteCode(`ship:${slug}`, "0", env)).slice(0, 24);
  if ((url.searchParams.get("s") || "") !== sig) return new Response("Not found", { status: 404 });
  const buf = await pendingGet(env, slug);
  if (!buf) return new Response("Not found. This submission was already approved or rejected.", { status: 404 });
  const { shipBytes } = unpackPending(buf);
  return new Response(shipBytes, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

async function otherDiscordAccounts(env, owner) {
  const found = new Map();
  if (!owner || !owner.discordId || !owner.userKey || !owner.userKey.startsWith("ban:id:") || !env.DELETE_CODES) return [];
  const hash = owner.userKey.slice(7);
  const add = (id, name) => {
    if (!id || id === owner.discordId) return;
    if (!found.has(id) || (!found.get(id) && name)) found.set(id, name || "");
  };
  try {
    const list = JSON.parse((await env.DELETE_CODES.get(`instacc:${hash}`)) || "[]");
    for (const a of list) if (a) add(a.id, a.name);
  } catch (e) {}
  try {
    const linked = await env.DELETE_CODES.get(linkKey(owner.userKey));
    if (linked) add(linked, (await env.DELETE_CODES.get(`dname:${linked}`)) || "");
  } catch (e) {}
  try {
    if (env.DB) {
      await ensureD1(env);
      const res = await env.DB.prepare("SELECT DISTINCT discord_id, username FROM discord_sessions WHERE id_hash = ?").bind(hash).all();
      for (const r of res.results || []) add(r.discord_id, r.username);
    }
  } catch (e) {}
  return [...found.entries()].map(([id, name]) => ({ id, name }));
}

async function approvalExtraFields(slug, env, check, imageCount) {
  const fields = [];
  try {
    const owner = await getSubmissionOwner(slug, env);
    const key = owner ? owner.userKey || owner.ipKey : null;
    if (owner && owner.discordId) {
      fields.push({ name: "Discord user", value: `<@${owner.discordId}> (${owner.discordName || "unknown"})`, inline: true });
    }
    if (key) {
      const code = installCode(key);
      fields.push({ name: "Installation", value: `\`${code}\` (${owner.userKey ? "app" : "connection"})`, inline: true });
      const others = await otherDiscordAccounts(env, owner);
      if (others.length) {
        const lines = others.map((o) => `<@${o.id}>${o.name ? ` (${o.name})` : ""}`).join("\n");
        fields.push({
          name: "\u26A0 SAME INSTALL, OTHER DISCORD ACCOUNT",
          value: `Installation \`${code}\` was also used by:\n${lines}\nThis upload is from: <@${owner.discordId}> (${owner.discordName || "unknown"})`.slice(0, 1000),
          inline: false
        });
      }
    }
  } catch (e) {
    console.error("installation field failed for " + slug);
  }
  if (imageCount > 0) {
    const links = [];
    for (let i = 0; i < Math.min(imageCount, 3); i++) {
      const u = await pendingImageUrl(slug, env, i);
      if (u) links.push(`[Image ${i + 1}](${u})`);
    }
    if (links.length) fields.push({ name: "Images (open to check)", value: links.join("  |  "), inline: false });
  }
  if (check) fields.push({ name: "File check", value: String(check).slice(0, 300), inline: false });
  const link = await pendingShipUrl(slug, env);
  if (link) fields.push({ name: "Ship file", value: `[Open the JSON in your browser](${link})`, inline: false });
  return fields;
}

async function handlePendingImage(url, env) {
  const m = url.pathname.match(/^\/img\/([a-z0-9-]{1,80})\/([0-2])$/);
  if (!m || (!env.DB && !env.DELETE_CODES) || !env.DELETE_PEPPER) return new Response("Not found", { status: 404 });
  const slug = m[1];
  const n = parseInt(m[2], 10);
  const sig = (await hashDeleteCode(`img:${slug}`, String(n), env)).slice(0, 24);
  if ((url.searchParams.get("s") || "") !== sig) return new Response("Not found", { status: 404 });
  const cache = caches.default;
  const cacheReq = new Request(url.toString());
  const cached = await cache.match(cacheReq);
  if (cached) return cached;
  const buf = await pendingGet(env, slug);
  if (!buf) return new Response("Not found. This submission was already approved or rejected.", { status: 404 });
  const { images } = unpackPending(buf);
  if (!images[n]) return new Response("Not found", { status: 404 });
  const res = new Response(images[n], {
    status: 200,
    headers: { "content-type": sniffImageType(images[n]), "cache-control": "public, max-age=86400" }
  });
  await cache.put(cacheReq, res.clone());
  return res;
}

async function stageSubmission({ name, submitter, description, patreonUrl, youtubeUrl, shipBytes, imageBufs, ipKey, userKey, discordId, discordName, verified }, env) {
  if ((await pendingCount(env)) >= MAX_PENDING_ITEMS) {
    return { ok: false, error: "the waiting list is full, please try again later" };
  }
  const norm = await normalizeShipBytes(shipBytes);
  if (!norm.ok) return { ok: false, error: norm.error };

  const meta = computeShipMeta(norm.objectsText);
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
  const images = (imageBufs || []).slice(0, 3);

  const info = {
    name, id: slug, submitter: submitter || "", description: description || "", patreonUrl: patreonUrl || "", youtubeUrl: youtubeUrl || "",
    objectCount: meta.objectCount, score: meta.score, utilities: meta.utilities,
    imageCount: images.length,
    stagedAt: new Date().toISOString()
  };

  if (!env.DB && !env.DELETE_CODES) return { ok: false, error: "storage is not available right now" };
  const packed = packPending(info, norm.objectsText, images);
  if (packed.byteLength > MAX_PENDING_BYTES) {
    return { ok: false, error: "the submission is too large (maximum about 12 MB in total)" };
  }
  const check = inspectShipText(norm.objectsText);
  await pendingPut(env, slug, packed, {
    n: (name || "").slice(0, 60),
    s: (submitter || "").slice(0, 40),
    o: meta.objectCount,
    sc: meta.score,
    c: 0,
    k: check.slice(0, 220)
  });

  await saveSubmissionOwner(slug, ipKey, userKey, `${name} by ${submitter || "unknown"}`, env, discordId, discordName, verified);
  await uploaderBump(env, discordId ? userBanKey(discordId) : userKey || ipKey, "submitted", `${name} by ${submitter || "unknown"}`);

  return { ok: true, slug, meta, check };
}

async function deleteFile(path, message, env) {
  const mode = pathMode(env, path);
  if (mode === "github") return ghDeleteFile(path, message, env);
  await env.SHIPS.delete(path);
  if (mode === "both" && env.GITHUB_TOKEN) {
    try {
      await ghDeleteFile(path, message, env);
    } catch (e) {
      console.error("github mirror delete failed for " + path);
    }
  }
}

async function ghDeleteFile(path, message, env) {
  const getResp = await ghRequest(`/contents/${path}`, env, { method: "GET" });
  if (!getResp.ok) return;
  const data = await getResp.json();
  await ghRequest(`/contents/${path}`, env, {
    method: "DELETE",
    body: JSON.stringify({ message, sha: data.sha })
  });
}

async function promoteUpdate(slug, stagedInfo, shipBytes, images, env) {
  const id = stagedInfo.updateOf;
  const found = await findInIndex(env, id);
  if (!found) throw new Error("the original ship is no longer in the library");
  const entry = found.entry;
  const oldName = entry.name;
  const noFile = stagedInfo.renameOnly === true;
  const newName = (stagedInfo.newName || "").toString().trim();
  const photosChanged = stagedInfo.photosChanged === true && Array.isArray(images) && images.length >= 1;
  const note = (stagedInfo.updateNote || "").toString();
  const version = noFile ? entry.version || 0 : (entry.version || 0) + 1;
  const nowIso = new Date().toISOString();
  const photoName = (i) => (i === 0 ? "preview.png" : `preview${i + 1}.png`);
  let shipHash = entry.sha256;

  if (!noFile) {
    shipHash = await sha256HexBytes(shipBytes);
    await putFile(`ships/${id}/ship.json`, bytesToBase64(shipBytes), `Update ${oldName} to version ${version}`, env);
  }

  let newImageCount = entry.imageCount;
  if (photosChanged) {
    const oldCount = Math.max(1, Math.min(3, entry.imageCount || 1));
    for (let i = 0; i < Math.min(images.length, 3); i++) {
      await putFile(`ships/${id}/${photoName(i)}`, bytesToBase64(images[i]), `Update photo ${i + 1} for ${oldName}`, env);
    }
    for (let i = images.length; i < oldCount; i++) {
      try {
        await deleteFile(`ships/${id}/${photoName(i)}`, `Remove photo ${i + 1} of ${oldName}`, env);
      } catch (e) {
        console.error("could not delete old photo " + photoName(i));
      }
    }
    newImageCount = Math.min(images.length, 3);
  }

  try {
    const infoRead = await storageReadText(env, `ships/${id}/info.json`);
    if (infoRead) {
      const oldInfo = JSON.parse(infoRead.text);
      const newInfo = { ...oldInfo };
      if (newName) newInfo.name = newName;
      if (photosChanged) newInfo.imageCount = newImageCount;
      if (stagedInfo.meta) {
        if (stagedInfo.meta.description !== undefined) newInfo.description = stagedInfo.meta.description;
        if (stagedInfo.meta.youtubeUrl !== undefined) newInfo.youtubeUrl = stagedInfo.meta.youtubeUrl;
        if (stagedInfo.meta.patreonUrl !== undefined) newInfo.patreonUrl = stagedInfo.meta.patreonUrl;
      }
      if (!noFile) {
        newInfo.sha256 = shipHash;
        newInfo.objectCount = stagedInfo.objectCount;
        newInfo.score = stagedInfo.score;
        newInfo.utilities = stagedInfo.utilities;
        newInfo.version = version;
        newInfo.updatedAt = nowIso;
        newInfo.updateNote = note;
      }
      await putFile(`ships/${id}/info.json`, utf8ToBase64(JSON.stringify(newInfo, null, 2)), `Update info for ${oldName}`, env);
    }
  } catch (e) {
    console.error("update info.json failed for " + id);
  }

  if (newName) entry.name = newName;
  if (photosChanged) entry.imageCount = newImageCount;
  if (stagedInfo.meta) {
    if (stagedInfo.meta.description !== undefined) entry.description = stagedInfo.meta.description;
    if (stagedInfo.meta.youtubeUrl !== undefined) entry.youtubeUrl = stagedInfo.meta.youtubeUrl;
    if (stagedInfo.meta.patreonUrl !== undefined) entry.patreonUrl = stagedInfo.meta.patreonUrl;
  }
  if (!noFile) {
    entry.sha256 = shipHash;
    entry.objectCount = stagedInfo.objectCount;
    entry.score = stagedInfo.score;
    entry.utilities = stagedInfo.utilities;
    entry.version = version;
    entry.updatedAt = nowIso;
    entry.updateNote = note;
    entry.utilVersion = utilCatalogVersion();
  }
  await writeShard(env, found.shard, noFile ? `Edit ${oldName}` : `Update ${entry.name} to version ${version}`);

  await pendingDelete(env, slug);
  if (env.DELETE_CODES) {
    await env.DELETE_CODES.delete(`sub:${slug}`);
    await env.DELETE_CODES.delete(`upd:${id}`);
  }
  if (!noFile) await announceShipUpdate(env, entry, version, stagedInfo.objectCount, note);
  return noFile ? `${oldName} - edited` : `${entry.name} - update v${version}`;
}

async function announceShipUpdate(env, entry, version, objectCount, note) {
  const channel = env.ANNOUNCE_CHANNEL_ID;
  if (!channel) return;
  try {
    const link = `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${channel}`;
    const builder = (entry.submitter || "").toString().trim() || "Unknown";
    const base = {
      title: `Corvette updated: ${entry.name}`.slice(0, 250),
      color: 0x8b5cf6,
      ...(note ? { description: `**What changed:** ${note}`.slice(0, 500) } : {}),
      fields: [
        { name: "Builder", value: builder.slice(0, 200), inline: true },
        { name: "Objects", value: String(objectCount || 0), inline: true },
        { name: "Version", value: `v${version}`, inline: true }
      ]
    };
    const count = Math.max(1, Math.min(3, entry.imageCount || 1));
    const urls = [];
    for (let i = 0; i < count; i++) urls.push(shipFileUrl(env, entry.id, i === 0 ? "preview.png" : `preview${i + 1}.png`, version));
    const embeds = urls.map((u, i) => {
      if (urls.length === 1) return { ...base, image: { url: u } };
      return i === 0 ? { ...base, url: link, image: { url: u } } : { url: link, image: { url: u } };
    });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const resp = await discordApi(`/channels/${channel}/messages`, env, {
        method: "POST",
        body: JSON.stringify({ embeds: attempt === 1 ? embeds : [base], allowed_mentions: { parse: [] } })
      });
      if (resp.ok) return;
      console.error("update announce failed: " + resp.status + " " + (await resp.text()).slice(0, 200));
    }
  } catch (err) {
    console.error("announceShipUpdate error: " + (err && err.message ? err.message : String(err)));
  }
}

async function promotePendingToLibrary(slug, env) {
  const buf = await pendingGet(env, slug);
  if (!buf) return promoteLegacyPending(slug, env);
  const { info: stagedInfo, shipBytes, images } = unpackPending(buf);
  if (stagedInfo.updateOf) return promoteUpdate(slug, stagedInfo, shipBytes, images, env);
  const shipHash = await sha256HexBytes(shipBytes);
  const imageCount = Math.max(1, Math.min(3, stagedInfo.imageCount || 1));

  await putFile(`ships/${slug}/ship.json`, bytesToBase64(shipBytes), `Add ${stagedInfo.name}`, env);
  for (let i = 0; i < Math.min(images.length, 3); i++) {
    const fname = i === 0 ? "preview.png" : `preview${i + 1}.png`;
    await putFile(`ships/${slug}/${fname}`, bytesToBase64(images[i]), `Add preview ${i + 1} for ${stagedInfo.name}`, env);
  }

  const info = { ...stagedInfo, imageCount, sha256: shipHash, downloads: 0, approvedAt: new Date().toISOString() };
  delete info.stagedAt;
  await putFile(`ships/${slug}/info.json`, utf8ToBase64(JSON.stringify(info, null, 2)), `Add info for ${stagedInfo.name}`, env);

  await addToIndex(
    env,
    {
      id: slug, name: stagedInfo.name, sha256: shipHash, submitter: stagedInfo.submitter || "",
      description: stagedInfo.description || "",
      patreonUrl: stagedInfo.patreonUrl || "", youtubeUrl: stagedInfo.youtubeUrl || "", imageCount,
      objectCount: stagedInfo.objectCount, score: stagedInfo.score, utilities: stagedInfo.utilities,
      downloads: 0, approvedAt: info.approvedAt, utilVersion: utilCatalogVersion()
    },
    `Add ${stagedInfo.name} to index`
  );

  await pendingDelete(env, slug);
  await announceNewShip(env, stagedInfo, images);
  return stagedInfo.name;
}

async function announceNewShip(env, info, images) {
  const channel = env.ANNOUNCE_CHANNEL_ID;
  if (!channel) return;
  try {
    const items = (Array.isArray(images) ? images : [])
      .filter(Boolean)
      .slice(0, 3)
      .map((img, i) => {
        const bytes = new Uint8Array(img);
        const type = sniffImageType(bytes) || "image/jpeg";
        return { bytes, type, filename: `preview${i + 1}.${imageExt(type)}` };
      });
    const link = `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${channel}`;
    const builder = (info.submitter || "").toString().trim() || "Unknown";
    const base = {
      title: `New Corvette: ${info.name}`.slice(0, 250),
      color: 0x3a6ea5,
      fields: [
        { name: "Builder", value: builder.slice(0, 200), inline: true },
        { name: "Objects", value: String(info.objectCount || 0), inline: true }
      ]
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      const withImages = items.length > 0 && attempt === 1;
      let resp;
      if (withImages) {
        const embeds = items.map((it, i) => {
          const image = { url: `attachment://${it.filename}` };
          if (items.length === 1) return { ...base, image };
          return i === 0 ? { ...base, url: link, image } : { url: link, image };
        });
        const form = new FormData();
        form.append(
          "payload_json",
          JSON.stringify({
            embeds,
            allowed_mentions: { parse: [] },
            attachments: items.map((it, i) => ({ id: i, filename: it.filename }))
          })
        );
        items.forEach((it, i) => form.append(`files[${i}]`, new Blob([it.bytes], { type: it.type }), it.filename));
        resp = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
          body: form
        });
      } else {
        resp = await discordApi(`/channels/${channel}/messages`, env, {
          method: "POST",
          body: JSON.stringify({ embeds: [base], allowed_mentions: { parse: [] } })
        });
      }
      if (resp.ok) return;
      console.error("announce failed: " + resp.status + " " + (await resp.text()).slice(0, 200));
    }
  } catch (err) {
    console.error("announceNewShip error: " + (err && err.message ? err.message : String(err)));
  }
}

async function promoteLegacyPending(slug, env) {
  const shipResp = await ghRequest(`/contents/pending/${slug}/ship.json`, env, { method: "GET" });
  const infoResp = await ghRequest(`/contents/pending/${slug}/info.json`, env, { method: "GET" });
  if (!shipResp.ok || !infoResp.ok) throw new Error("pending files not found");

  const shipData = await shipResp.json();
  const infoData = await infoResp.json();

  const shipContentB64 = shipData.content.replace(/\n/g, "");
  const stagedInfo = JSON.parse(decodeBase64Utf8(infoData.content));
  const shipBytes = Uint8Array.from(atob(shipContentB64), (c) => c.charCodeAt(0));
  const shipHash = await sha256HexBytes(shipBytes);
  const imageCount = Math.max(1, Math.min(3, stagedInfo.imageCount || 1));

  await putFile(`ships/${slug}/ship.json`, shipContentB64, `Add ${stagedInfo.name}`, env);
  for (let i = 0; i < imageCount; i++) {
    const fname = i === 0 ? "preview.png" : `preview${i + 1}.png`;
    const imgResp = await ghRequest(`/contents/pending/${slug}/${fname}`, env, { method: "GET" });
    if (!imgResp.ok) continue;
    const imgData = await imgResp.json();
    await putFile(`ships/${slug}/${fname}`, imgData.content.replace(/\n/g, ""), `Add preview ${i + 1} for ${stagedInfo.name}`, env);
  }

  const info = { ...stagedInfo, imageCount, sha256: shipHash, downloads: 0, approvedAt: new Date().toISOString() };
  delete info.stagedAt;
  await putFile(`ships/${slug}/info.json`, utf8ToBase64(JSON.stringify(info, null, 2)), `Add info for ${stagedInfo.name}`, env);

  await addToIndex(
    env,
    {
      id: slug, name: stagedInfo.name, sha256: shipHash, submitter: stagedInfo.submitter || "",
      description: stagedInfo.description || "",
      patreonUrl: stagedInfo.patreonUrl || "", youtubeUrl: stagedInfo.youtubeUrl || "", imageCount,
      objectCount: stagedInfo.objectCount, score: stagedInfo.score, utilities: stagedInfo.utilities,
      downloads: 0, approvedAt: info.approvedAt, utilVersion: utilCatalogVersion()
    },
    `Add ${stagedInfo.name} to index`
  );

  await deleteFile(`pending/${slug}/ship.json`, `Clean up pending ${stagedInfo.name}`, env);
  for (let i = 0; i < imageCount; i++) {
    const fname = i === 0 ? "preview.png" : `preview${i + 1}.png`;
    await deleteFile(`pending/${slug}/${fname}`, `Clean up pending ${stagedInfo.name}`, env);
  }
  await deleteFile(`pending/${slug}/info.json`, `Clean up pending ${stagedInfo.name}`, env);

  return stagedInfo.name;
}

async function promotePendingToLibraryTry(slug, env) {
  try {
    const name = await promotePendingToLibrary(slug, env);
    return { ok: true, name };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("promotePendingToLibrary failed: " + msg);
    return { ok: false, name: null, error: msg.slice(0, 180) };
  }
}

async function rejectPending(slug, env) {
  try {
    const removed = await pendingDelete(env, slug);
    if (!removed) {
      await deleteFile(`pending/${slug}/ship.json`, "Reject submission", env);
      for (const fname of ["preview.png", "preview2.png", "preview3.png"]) {
        await deleteFile(`pending/${slug}/${fname}`, "Reject submission", env);
      }
      await deleteFile(`pending/${slug}/info.json`, "Reject submission", env);
    }
    await removeDeleteCode(slug, env);
    if (env.DELETE_CODES) await env.DELETE_CODES.delete(`sub:${slug}`);
    return { ok: true };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("rejectPending failed: " + msg);
    return { ok: false, error: msg.slice(0, 180) };
  }
}

const HUMAN_TTL_MS = 30 * 60 * 1000;
const HUMAN_TOKEN_RE = /^[a-f0-9]{32}$/;
const HUMAN_START_LIMIT = 12;
const HUMAN_START_WINDOW_MS = 10 * 60 * 1000;

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function humanPageHtml(siteKey, token, expired) {
  const body = expired
    ? '<h2>This check has expired</h2><p>Please go back to the app and press the verify button again.</p>'
    : `<h2>Are you human?</h2>
<p>Please confirm you are not a robot. When it is done, go back to the Optimizer app.</p>
<div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onTsOk" style="margin-top:16px"></div>
${siteKey ? "" : '<p class="err">Verification is not set up on the server (TURNSTILE_SITE_KEY is missing).</p>'}
<div id="status"></div>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Human check</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
body{font-family:sans-serif;background:#1e1e1e;color:#ddd;max-width:480px;margin:40px auto;padding:0 16px}
#status{margin-top:16px;font-size:15px}
.ok{color:#6fcf6f}
.err{color:#e05555}
</style>
</head>
<body>
${body}
<script>
const humanToken = ${JSON.stringify(token)};
async function onTsOk(tsToken) {
  const status = document.getElementById('status');
  status.className = '';
  status.textContent = 'Checking...';
  try {
    const form = new FormData();
    form.set('t', humanToken);
    form.set('cf-turnstile-response', tsToken);
    const resp = await fetch('/human', { method: 'POST', body: form });
    const text = await resp.text();
    status.className = resp.ok ? 'ok' : 'err';
    status.textContent = text;
    if (resp.ok) document.querySelector('.cf-turnstile').style.display = 'none';
    else if (typeof turnstile !== 'undefined') turnstile.reset();
  } catch (e) {
    status.className = 'err';
    status.textContent = 'Network error. Please try again.';
    if (typeof turnstile !== 'undefined') turnstile.reset();
  }
}
</script>
</body>
</html>`;
}

async function handleHumanPage(url, env) {
  const token = url.searchParams.get("t") || "";
  let expired = true;
  if (HUMAN_TOKEN_RE.test(token) && env.DB) {
    await ensureD1(env);
    const row = await env.DB.prepare("SELECT created, verified FROM humans WHERE token = ?").bind(token).first();
    expired = !row || Date.now() - row.created > HUMAN_TTL_MS;
  }
  return new Response(humanPageHtml(env.TURNSTILE_SITE_KEY || "", expired ? "" : token, expired), {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function handleHumanStart(request, env) {
  try {
    if (!env.DB || !deleteCodesReady(env)) {
      return new Response("Uploading is not available right now. Please try again later.", { status: 503 });
    }
    await ensureD1(env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    if (await isBanned(env, [ipKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403 });
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("Invalid request.", { status: 400 });
    }
    const rawInstall = ((body && body.installId) || "").toString().trim();
    if (!INSTALL_ID_RE.test(rawInstall)) {
      return new Response("Please update the Optimizer app and try again.", { status: 400 });
    }
    const idKey = await installBanKey(rawInstall.toLowerCase(), env);
    const idHash = idKey.slice(7);
    if (await isBanned(env, [idKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403 });
    }
    if ((await lockSecondsLeft(env, `lock:id:${idHash}`)) > 0) {
      return new Response("Too many rejected uploads. Please try again later.", { status: 429 });
    }
    if (ipKey && (await rateWindowPush(`hs/${ipKey.slice(7)}`, HUMAN_START_WINDOW_MS)) > HUMAN_START_LIMIT) {
      return new Response("Too many checks started. Please wait a few minutes.", { status: 429 });
    }
    await env.DB.prepare("DELETE FROM humans WHERE created < ?").bind(Date.now() - 2 * 60 * 60 * 1000).run();
    const token = randomHex(16);
    await env.DB.prepare("INSERT INTO humans (token, id_hash, created, verified, used) VALUES (?, ?, ?, 0, 0)")
      .bind(token, idHash, Date.now())
      .run();
    return json({ token, url: `${workerOrigin}/human?t=${token}` });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleHumanStart failed: " + msg);
    return new Response("Server error: " + msg.slice(0, 120), { status: 500 });
  }
}

async function handleHumanVerify(request, env) {
  try {
    if (!env.DB) return new Response("Not available right now.", { status: 503 });
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await isBanned(env, [await ipBanKey(ip, env)])) {
      return new Response(BLOCKED_MESSAGE, { status: 403 });
    }
    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return new Response("Invalid request.", { status: 400 });
    }
    const token = (form.get("t") || "").toString();
    if (!HUMAN_TOKEN_RE.test(token)) return new Response("Invalid link.", { status: 400 });
    const turnstile = await verifyTurnstile(form.get("cf-turnstile-response"), ip, env);
    if (!turnstile.ok) {
      console.error("turnstile failed: " + turnstile.codes.join(","));
      return new Response(turnstileMessage(turnstile.codes), { status: 400 });
    }
    await ensureD1(env);
    const res = await env.DB.prepare("UPDATE humans SET verified = 1 WHERE token = ? AND verified = 0 AND used = 0 AND created > ?")
      .bind(token, Date.now() - HUMAN_TTL_MS)
      .run();
    if (!res || !res.meta || res.meta.changes < 1) {
      return new Response("This check has expired or was already done. Press the verify button in the app again.", { status: 410 });
    }
    return new Response("Verified! You can go back to the Optimizer app now.", { status: 200 });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleHumanVerify failed: " + msg);
    return new Response("Server error: " + msg.slice(0, 120), { status: 500 });
  }
}

async function handleHumanStatus(url, env) {
  const token = url.searchParams.get("t") || "";
  if (!HUMAN_TOKEN_RE.test(token) || !env.DB) return json({ verified: false, expired: true });
  await ensureD1(env);
  const row = await env.DB.prepare("SELECT created, verified, used FROM humans WHERE token = ?").bind(token).first();
  if (!row || Date.now() - row.created > HUMAN_TTL_MS) return json({ verified: false, expired: true });
  return json({ verified: row.verified === 1 && row.used === 0, expired: false });
}

const DESCRIPTION_MAX = 250;
const UPLOAD_MAX_BODY = 40 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

async function uploadQuotaUsed(env, key, windowMs) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM upload_log WHERE k = ? AND at > ?")
    .bind(key, Date.now() - (windowMs || DAY_MS))
    .first();
  return row ? row.n : 0;
}

async function uploadQuotaAdd(env, keys) {
  const now = Date.now();
  const stmts = keys.filter(Boolean).map((k) => env.DB.prepare("INSERT INTO upload_log (k, at) VALUES (?, ?)").bind(k, now));
  stmts.push(env.DB.prepare("DELETE FROM upload_log WHERE at < ?").bind(now - 2 * DAY_MS));
  await env.DB.batch(stmts);
}

async function validateSubmission(form, refuse) {
  const name = (form.get("name") || "").toString().trim().slice(0, 80);
  const builder = (form.get("builder") || "").toString().trim().slice(0, 80);
  const description = (form.get("description") || "").toString().replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const shipFile = form.get("ship");
  const imageFiles = [form.get("image1"), form.get("image2"), form.get("image3")].filter((f) => f instanceof File);

  if (!name) return { response: await refuse(400, "Could not accept this submission: the Corvette name is required.") };
  if (!builder) return { response: await refuse(400, "Could not accept this submission: your name is required.") };
  if (description.length > DESCRIPTION_MAX) {
    return { response: await refuse(400, `Could not accept this submission: the instructions are longer than ${DESCRIPTION_MAX} characters.`) };
  }

  const problems = [];
  if (!(shipFile instanceof File)) problems.push("no ship file attached");
  if (imageFiles.length === 0) problems.push("no image attached");
  if (shipFile instanceof File && shipFile.size > 3 * 1024 * 1024) problems.push("ship file is larger than 3 MB");
  if (shipFile instanceof File && !/\.(nmsship|json|txt)$/i.test(shipFile.name)) {
    problems.push("ship file must be .nmsship, .json or .txt");
  }
  for (const f of imageFiles) {
    if (f.size > 10 * 1024 * 1024) problems.push(`${f.name} is larger than 10 MB`);
  }
  if (problems.length) return { response: await refuse(400, `Could not accept this submission: ${problems.join(", ")}.`) };

  const imageBufs = [];
  for (const f of imageFiles) {
    const buf = await f.arrayBuffer();
    if (sniffImageType(new Uint8Array(buf)) === "application/octet-stream") {
      return { response: await refuse(400, `Could not accept this submission: ${f.name} is not a real image.`) };
    }
    imageBufs.push(buf);
  }

  const linkCheck = classifyLinks(form.get("youtube"), form.get("patreon"), form.get("link"));
  if (!linkCheck.ok) return { response: await refuse(400, `Could not accept this submission: ${linkCheck.error}.`) };

  return { sub: { name, builder, description, shipFile, imageBufs, linkCheck } };
}

function approvalEmbedFor(name, builder, via, description, linkCheck, staged, extraFields) {
  return {
    title: name,
    color: 0x5b9bd5,
    fields: [
      { name: "Submitted by", value: `${builder} (${via})`, inline: true },
      ...(description ? [{ name: "Instructions", value: description, inline: false }] : []),
      ...linkFields(linkCheck.youtubeUrl, linkCheck.patreonUrl),
      { name: "Objects", value: `${staged.meta.objectCount} \u00b7 utility score ${staged.meta.score}/10`, inline: true },
      ...extraFields
    ]
  };
}

async function handleAppUpload(request, env, ctx) {
  let idHash = "";
  let strikeUser = "";
  const refuse = async (status, text, blocked) => {
    if (status === 400 && idHash && env.DELETE_CODES) {
      await recordRejection(env, "id", idHash, idHash.slice(0, 4));
    }
    if (status === 400 && strikeUser && env.DELETE_CODES) {
      await recordRejection(env, "user", strikeUser, strikeUser.slice(-4));
    }
    return new Response(text, { status, headers: blocked ? { "x-blocked": "1" } : {} });
  };
  try {
    if (!env.DB || !deleteCodesReady(env)) {
      return new Response("Uploading is not available right now. Please try again later.", { status: 503 });
    }
    await ensureD1(env);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    if (await isBanned(env, [ipKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403, headers: { "x-blocked": "1" } });
    }
    const declared = parseInt(request.headers.get("content-length") || "0", 10);
    if (declared > UPLOAD_MAX_BODY) {
      return new Response("The upload is too large.", { status: 413 });
    }

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return new Response("Invalid form submission.", { status: 400 });
    }

    const rawInstall = (form.get("installId") || "").toString().trim();
    if (!INSTALL_ID_RE.test(rawInstall)) {
      return new Response("Could not accept this submission: please update the Optimizer app and try again.", { status: 400 });
    }
    const idKey = await installBanKey(rawInstall.toLowerCase(), env);
    idHash = idKey.slice(7);

    if (await isBanned(env, [idKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403, headers: { "x-blocked": "1" } });
    }
    const left = await lockSecondsLeft(env, `lock:id:${idHash}`);
    if (left > 0) {
      return new Response(`Too many rejected uploads. Please try again in ${Math.max(1, Math.ceil(left / 60))} minutes.`, {
        status: 429,
        headers: { "x-blocked": "1" }
      });
    }

    const gate = await requireDiscord(env, form, idHash, false);
    if (gate.response) return gate.response;
    const discordId = gate.discordId;
    const discordName = gate.username;
    const verified = gate.verified;
    strikeUser = discordId;
    await rememberIp(env, ip, ipKey);

    if (form.get("agree") !== "yes") {
      return refuse(400, "Could not accept this submission: you must agree to the upload rules first.");
    }
    if (!(await checkRateLimit(ip))) {
      return new Response("Please wait a minute before submitting again.", { status: 429, headers: { "x-blocked": "1" } });
    }

    const v = await validateSubmission(form, refuse);
    if (v.response) return v.response;
    const { name, builder, description, shipFile, imageBufs, linkCheck } = v.sub;

    const shipBytes = new Uint8Array(await shipFile.arrayBuffer());
    const staged = await stageSubmission(
      { name, submitter: builder, description, patreonUrl: linkCheck.patreonUrl, youtubeUrl: linkCheck.youtubeUrl, shipBytes, imageBufs, ipKey, userKey: idKey, discordId, discordName, verified },
      env
    );
    if (!staged.ok) return refuse(400, `Could not accept this ship file: ${staged.error}.`);

    const slug = staged.slug;
    ctx.waitUntil(
      (async () => {
        const embed = approvalEmbedFor(name, builder, "via app", description, linkCheck, staged, await approvalExtraFields(slug, env, staged.check, imageBufs.length));
        const posted = await postApprovalMessage(env, embed, slug, imageBufs);
        if (!posted) console.error("approval message could not be posted for " + slug + " - use /pending");
      })()
    );

    return new Response("Thanks! Your Corvette was submitted for approval.", { status: 200 });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleAppUpload failed: " + msg);
    return new Response("Server error while saving your submission: " + msg.slice(0, 120), { status: 500 });
  }
}

const GUEST_UPLOADS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
const DISCORD_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const DISCORD_LOGIN_TTL_MS = 10 * 60 * 1000;
const DISCORD_START_LIMIT = 10;
const DISCORD_START_WINDOW_MS = 10 * 60 * 1000;
const DISCORD_SESSION_RE = /^[a-f0-9]{64}$/;

function discordLoginReady(env) {
  return !!(env.DB && deleteCodesReady(env) && env.DISCORD_CLIENT_SECRET && env.DISCORD_TOKEN && env.DISCORD_APPLICATION_ID && env.DISCORD_GUILD_ID);
}

function linkKey(userKey) {
  return `link:${userKey}`;
}

function ownerStatKey(rec) {
  if (!rec) return null;
  if (rec.discordId) return userBanKey(rec.discordId);
  return rec.userKey || rec.ipKey || null;
}

async function fetchGuildMember(env, discordId) {
  try {
    const resp = await discordApi(`/guilds/${env.DISCORD_GUILD_ID}/members/${discordId}`, env, { method: "GET" });
    if (resp.status === 404) return { ok: true, member: null };
    if (!resp.ok) {
      console.error("member check failed: " + resp.status);
      return { ok: false, member: null };
    }
    return { ok: true, member: await resp.json() };
  } catch (err) {
    console.error("member check error: " + (err && err.message ? err.message : String(err)));
    return { ok: false, member: null };
  }
}

async function checkDiscordAccess(env, discordId, bulk) {
  if (await isBanned(env, [userBanKey(discordId)])) {
    return { ok: false, status: 403, text: BLOCKED_MESSAGE, blocked: true };
  }
  const left = await lockSecondsLeft(env, `lock:user:${discordId}`);
  if (left > 0) {
    return { ok: false, status: 429, text: `You are temporarily timed out. Please try again in ${Math.max(1, Math.ceil(left / 60))} minutes.`, blocked: true };
  }
  const m = await fetchGuildMember(env, discordId);
  if (!m.ok) {
    return { ok: false, status: 503, text: "Could not check your Discord membership right now. Please try again in a minute." };
  }
  if (!m.member) {
    return { ok: false, status: 403, text: "You must be a member of our Discord server to upload Corvettes.", notMember: true };
  }
  if (bulk) {
    const roles = Array.isArray(m.member.roles) ? m.member.roles : [];
    if (!env.BULK_ROLE_ID || !roles.includes(env.BULK_ROLE_ID)) {
      return { ok: false, status: 403, text: "You need the Bulk role in our Discord server to use bulk upload." };
    }
  }
  const memberRoles = Array.isArray(m.member.roles) ? m.member.roles : [];
  return { ok: true, verified: !!env.VERIFIED_ROLE_ID && memberRoles.includes(env.VERIFIED_ROLE_ID) };
}

async function resolveDiscordSession(env, token, idHash) {
  if (!DISCORD_SESSION_RE.test(token || "")) return null;
  await ensureD1(env);
  const row = await env.DB.prepare("SELECT discord_id, username, id_hash, expires FROM discord_sessions WHERE hash = ?")
    .bind(await sha256Hex(token))
    .first();
  if (!row || row.expires < Date.now() || row.id_hash !== idHash) return null;
  return { discordId: row.discord_id, username: row.username };
}

async function requireDiscord(env, form, idHash, bulk) {
  if (!discordLoginReady(env)) {
    return { response: new Response("Discord login is not set up on the server yet.", { status: 503 }) };
  }
  const token = (form.get("discordSession") || "").toString();
  const sess = await resolveDiscordSession(env, token, idHash);
  if (!sess) {
    return { response: new Response("Your Discord login has expired. Please log in with Discord again.", { status: 401 }) };
  }
  const access = await checkDiscordAccess(env, sess.discordId, bulk);
  if (!access.ok) {
    return { response: new Response(access.text, { status: access.status, headers: access.blocked ? { "x-blocked": "1" } : {} }) };
  }
  return { discordId: sess.discordId, username: sess.username, verified: !!access.verified };
}

function discordPageHtml(title, message, good, button) {
  const color = good ? "#2d7a2d" : "#8b2020";
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#1e1e1e;color:#d4d4d4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{max-width:460px;padding:28px 32px;background:#252526;border:1px solid #3f3f46;border-radius:8px;border-top:4px solid ${color}}
h2{margin:0 0 12px 0}p{line-height:1.5;margin:0}
a.btn{display:inline-block;margin-top:18px;padding:10px 22px;background:#5865f2;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}
a.btn:hover{background:#4752c4}</style></head><body><div class="box"><h2>${esc(title)}</h2><p>${esc(message)}</p>${button ? `<a class="btn" href="${esc(button.url)}" target="_blank" rel="noopener">${esc(button.label)}</a>` : ""}</div></body></html>`;
}

function discordPage(title, message, good, status, button) {
  return new Response(discordPageHtml(title, message, good, button), {
    status: status || 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}

async function handleDiscordStart(request, env) {
  try {
    if (!discordLoginReady(env)) {
      return new Response("Discord login is not set up on the server yet.", { status: 503 });
    }
    await ensureD1(env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    if (await isBanned(env, [ipKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403 });
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("Invalid request.", { status: 400 });
    }
    const rawInstall = ((body && body.installId) || "").toString().trim();
    if (!INSTALL_ID_RE.test(rawInstall)) {
      return new Response("Please update the Optimizer app and try again.", { status: 400 });
    }
    const idKey = await installBanKey(rawInstall.toLowerCase(), env);
    const idHash = idKey.slice(7);
    if (await isBanned(env, [idKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403 });
    }
    if ((await lockSecondsLeft(env, `lock:id:${idHash}`)) > 0) {
      return new Response("Too many rejected uploads. Please try again later.", { status: 429 });
    }
    if (ipKey && (await rateWindowPush(`ds/${ipKey.slice(7)}`, DISCORD_START_WINDOW_MS)) > DISCORD_START_LIMIT) {
      if (await firstAlert(`ds/${ipKey.slice(7)}`)) {
        await rememberIp(env, ip, ipKey);
        await notifyAdmin(env, `Login spam: one connection started more than ${DISCORD_START_LIMIT} Discord logins in a short time. Blocked for a few minutes.${ipHint(ipKey)}`);
      }
      return new Response("Too many login attempts. Please wait a few minutes.", { status: 429 });
    }
    await env.DB.prepare("DELETE FROM discord_logins WHERE created < ?").bind(Date.now() - 2 * 60 * 60 * 1000).run();
    await env.DB.prepare("DELETE FROM discord_sessions WHERE expires < ?").bind(Date.now()).run();
    const token = randomHex(16);
    await env.DB.prepare("INSERT INTO discord_logins (token, id_hash, created, discord_id, username, done) VALUES (?, ?, ?, '', '', 0)")
      .bind(token, idHash, Date.now())
      .run();
    return json({ token, url: `${workerOrigin}/discord-login?t=${token}` });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleDiscordStart failed: " + msg);
    return new Response("Server error: " + msg.slice(0, 120), { status: 500 });
  }
}

async function handleDiscordLogin(url, env) {
  try {
    if (!discordLoginReady(env)) return discordPage("Not available", "Discord login is not set up on the server yet.", false, 503);
    const token = url.searchParams.get("t") || "";
    if (!HUMAN_TOKEN_RE.test(token)) return discordPage("Invalid link", "Please go back to the Optimizer app and press the Discord login button again.", false, 400);
    await ensureD1(env);
    const row = await env.DB.prepare("SELECT created, done FROM discord_logins WHERE token = ?").bind(token).first();
    if (!row || row.done === 1 || Date.now() - row.created > DISCORD_LOGIN_TTL_MS) {
      return discordPage("Link expired", "Please go back to the Optimizer app and press the Discord login button again.", false, 410);
    }
    const redirect = encodeURIComponent(`${workerOrigin}/discord-callback`);
    const target = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_APPLICATION_ID}&response_type=code&redirect_uri=${redirect}&scope=identify&state=${token}&prompt=none`;
    return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
  } catch (err) {
    console.error("handleDiscordLogin failed: " + (err && err.message ? err.message : String(err)));
    return discordPage("Server error", "Something went wrong. Please try again.", false, 500);
  }
}

async function handleDiscordCallback(url, env) {
  try {
    if (!discordLoginReady(env)) return discordPage("Not available", "Discord login is not set up on the server yet.", false, 503);
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    if (url.searchParams.get("error")) {
      return discordPage("Login cancelled", "You cancelled the Discord login. Go back to the Optimizer app and try again if you want to upload.", false, 400);
    }
    if (!HUMAN_TOKEN_RE.test(state) || !code) {
      return discordPage("Invalid link", "Please go back to the Optimizer app and press the Discord login button again.", false, 400);
    }
    await ensureD1(env);
    const row = await env.DB.prepare("SELECT id_hash, created, done FROM discord_logins WHERE token = ?").bind(state).first();
    if (!row || row.done === 1 || Date.now() - row.created > DISCORD_LOGIN_TTL_MS) {
      return discordPage("Link expired", "Please go back to the Optimizer app and press the Discord login button again.", false, 410);
    }
    const tokenResp = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_APPLICATION_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${workerOrigin}/discord-callback`
      }).toString()
    });
    if (!tokenResp.ok) {
      console.error("discord token exchange failed: " + tokenResp.status + " " + (await tokenResp.text()).slice(0, 200));
      return discordPage("Login failed", "Discord did not accept the login. Please go back to the app and try again.", false, 400);
    }
    const tokenJson = await tokenResp.json();
    const meResp = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { authorization: `Bearer ${tokenJson.access_token}` }
    });
    if (!meResp.ok) {
      console.error("discord user fetch failed: " + meResp.status);
      return discordPage("Login failed", "Could not read your Discord account. Please go back to the app and try again.", false, 400);
    }
    const me = await meResp.json();
    const discordId = (me.id || "").toString();
    if (!/^[0-9]{5,25}$/.test(discordId)) {
      return discordPage("Login failed", "Could not read your Discord account. Please go back to the app and try again.", false, 400);
    }
    const username = ((me.global_name || me.username || "unknown") + "").slice(0, 60);
    const access = await checkDiscordAccess(env, discordId, false);
    if (!access.ok) {
      if (access.notMember) {
        const invite = env.DISCORD_INVITE_URL || "https://discord.gg/2UzqdaRxvv";
        return discordPage(
          "Join our Discord first",
          "You are logged in with Discord, but you are not a member of our server yet. Join the server and then log in again from the app.",
          false,
          403,
          { label: "Join our Discord", url: invite }
        );
      }
      return discordPage("Not allowed", access.text, false, access.status);
    }
    const res = await env.DB.prepare("UPDATE discord_logins SET discord_id = ?, username = ?, done = 1 WHERE token = ? AND done = 0")
      .bind(discordId, username, state)
      .run();
    if (!res || !res.meta || res.meta.changes < 1) {
      return discordPage("Link expired", "Please go back to the Optimizer app and press the Discord login button again.", false, 410);
    }
    const lk = linkKey(`ban:id:${row.id_hash}`);
    const existing = await env.DELETE_CODES.get(lk);
    if (!existing) await env.DELETE_CODES.put(lk, discordId);
    await env.DELETE_CODES.put(`dname:${discordId}`, username);
    try {
      const ak = `instacc:${row.id_hash}`;
      let accounts = [];
      try {
        accounts = JSON.parse((await env.DELETE_CODES.get(ak)) || "[]");
      } catch (e) {}
      accounts = accounts.filter((a) => a && a.id !== discordId);
      accounts.push({ id: discordId, name: username, at: Date.now() });
      await env.DELETE_CODES.put(ak, JSON.stringify(accounts.slice(-10)));
    } catch (e) {
      console.error("could not record the account for this installation");
    }
    return discordPage("Logged in", `You are logged in as ${username}. You can close this page and go back to the Optimizer app.`, true, 200);
  } catch (err) {
    console.error("handleDiscordCallback failed: " + (err && err.message ? err.message : String(err)));
    return discordPage("Server error", "Something went wrong. Please go back to the app and try again.", false, 500);
  }
}

async function handleDiscordStatus(url, env) {
  try {
    const token = url.searchParams.get("t") || "";
    if (!HUMAN_TOKEN_RE.test(token) || !env.DB) return json({ done: false, expired: true });
    await ensureD1(env);
    const row = await env.DB.prepare("SELECT id_hash, created, discord_id, username, done FROM discord_logins WHERE token = ?").bind(token).first();
    if (!row || Date.now() - row.created > DISCORD_LOGIN_TTL_MS) return json({ done: false, expired: true });
    if (row.done !== 1) return json({ done: false, expired: false });
    const consumed = await env.DB.prepare("DELETE FROM discord_logins WHERE token = ? AND done = 1").bind(token).run();
    if (!consumed || !consumed.meta || consumed.meta.changes < 1) return json({ done: false, expired: true });
    const session = randomHex(32);
    await env.DB.prepare("INSERT INTO discord_sessions (hash, discord_id, username, id_hash, created, expires) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await sha256Hex(session), row.discord_id, row.username, row.id_hash, Date.now(), Date.now() + DISCORD_SESSION_MS)
      .run();
    return json({ done: true, expired: false, session, username: row.username, seconds: Math.floor(DISCORD_SESSION_MS / 1000) });
  } catch (err) {
    console.error("handleDiscordStatus failed: " + (err && err.message ? err.message : String(err)));
    return json({ done: false, expired: false });
  }
}

async function requireStaff(request, env) {
  if (!discordLoginReady(env)) return { response: new Response("Not available.", { status: 503 }) };
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return { response: new Response("Invalid request.", { status: 400 }) };
  }
  const rawInstall = ((body && body.installId) || "").toString().trim();
  if (!INSTALL_ID_RE.test(rawInstall)) return { response: new Response("Invalid request.", { status: 400 }) };
  const idKey = await installBanKey(rawInstall.toLowerCase(), env);
  const sess = await resolveDiscordSession(env, ((body && body.discordSession) || "").toString(), idKey.slice(7));
  if (!sess) return { response: json({ staff: false, expired: true }, 401) };
  const m = await fetchGuildMember(env, sess.discordId);
  if (!m.ok) return { response: new Response("Could not check your Discord roles right now.", { status: 503 }) };
  const roles = m.member && Array.isArray(m.member.roles) ? m.member.roles : [];
  const supervisor = !!env.SUPERVISOR_ROLE_ID && roles.includes(env.SUPERVISOR_ROLE_ID);
  const reviewer = !!env.REVIEW_ROLE_ID && roles.includes(env.REVIEW_ROLE_ID);
  if (!supervisor && !reviewer) return { response: json({ staff: false }, 403) };
  return { body, discordId: sess.discordId, username: sess.username, supervisor };
}

async function handleUploaderName(url, env) {
  const plain = (obj) =>
    new Response(JSON.stringify(obj), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
  try {
    const id = (url.searchParams.get("ship") || "").trim();
    if (!/^[a-z0-9-]{1,80}$/.test(id) || !env.DELETE_CODES) return plain({ name: "" });
    const owner = await getSubmissionOwner(id, env);
    let name = "";
    if (owner && owner.discordId) {
      name = owner.discordName || (await env.DELETE_CODES.get(`dname:${owner.discordId}`)) || "";
    }
    return plain({ name: name.toString().slice(0, 60) });
  } catch (err) {
    return plain({ name: "" });
  }
}

async function handleStaffPending(request, env) {
  try {
    const gate = await requireStaff(request, env);
    if (gate.response) return gate.response;
    const list = await pendingList(env, 40);
    const items = [];
    for (const row of list) {
      const info = await pendingHeader(env, row.slug);
      if (!info) continue;
      const owner = await getSubmissionOwner(row.slug, env);
      const imageUrls = [];
      for (let i = 0; i < Math.min(info.imageCount || 0, 3); i++) {
        const u = await pendingImageUrl(row.slug, env, i);
        if (u) imageUrls.push(u);
      }
      items.push({
        slug: row.slug,
        updateOf: info.updateOf || "",
        kind: info.updateOf ? (info.renameOnly ? "rename" : "update") : "new",
        name: info.name || row.md.n || row.slug,
        newName: info.newName || "",
        version: info.version || 0,
        builder: info.submitter || "",
        description: info.description || "",
        patreonUrl: info.patreonUrl || "",
        youtubeUrl: info.youtubeUrl || "",
        objectCount: info.objectCount || 0,
        score: info.score || 0,
        utilities: Array.isArray(info.utilities) ? info.utilities : [],
        stagedAt: info.stagedAt || "",
        check: (row.md.k || "").toString(),
        imageUrls,
        discordId: owner && owner.discordId ? owner.discordId : "",
        discordName: owner && owner.discordName ? owner.discordName : "",
        verified: !!(owner && owner.verified),
        hasShip: !info.renameOnly,
        updateNote: info.updateNote || "",
        photosChanged: info.photosChanged === true
      });
    }
    items.sort((a, b) => (b.stagedAt || "").localeCompare(a.stagedAt || ""));
    return json({ staff: true, items });
  } catch (err) {
    console.error("handleStaffPending failed: " + (err && err.message ? err.message : String(err)));
    return new Response("Server error.", { status: 500 });
  }
}

async function handleStaffShip(request, env) {
  try {
    const gate = await requireStaff(request, env);
    if (gate.response) return gate.response;
    const publishedId = ((gate.body && gate.body.published) || "").toString();
    if (publishedId) {
      if (!/^[a-z0-9-]{1,80}$/.test(publishedId)) return new Response("Invalid request.", { status: 400 });
      const pub = await storageReadText(env, `ships/${publishedId}/ship.json`);
      if (!pub) return new Response("This ship was not found.", { status: 404 });
      return new Response(pub.text, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }
    const slug = ((gate.body && gate.body.slug) || "").toString();
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response("Invalid request.", { status: 400 });
    const buf = await pendingGet(env, slug);
    if (!buf) return new Response("This submission is no longer waiting.", { status: 404 });
    const { info, shipBytes } = unpackPending(buf);
    if (info.renameOnly || !shipBytes.length) return new Response("This item has no ship file.", { status: 404 });
    return new Response(new TextDecoder().decode(shipBytes), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (err) {
    console.error("handleStaffShip failed: " + (err && err.message ? err.message : String(err)));
    return new Response("Server error.", { status: 500 });
  }
}

async function requireUserSession(env, installIdRaw, token) {
  if (!discordLoginReady(env)) return { response: json({ ok: false, error: "Not available." }, 503) };
  const raw = (installIdRaw || "").toString().trim();
  if (!INSTALL_ID_RE.test(raw)) return { response: json({ ok: false, error: "Invalid request." }, 400) };
  const idKey = await installBanKey(raw.toLowerCase(), env);
  if (await isBanned(env, [idKey])) {
    return { response: json({ ok: false, banned: true, error: BLOCKED_MESSAGE }, 403) };
  }
  const sess = await resolveDiscordSession(env, (token || "").toString(), idKey.slice(7));
  if (!sess) {
    return { response: json({ ok: false, expired: true, error: "Your Discord login has expired. Please log in with Discord again." }, 401) };
  }
  if (await isBanned(env, [userBanKey(sess.discordId)])) {
    return { response: json({ ok: false, banned: true, error: BLOCKED_MESSAGE }, 403) };
  }
  return { discordId: sess.discordId, username: sess.username };
}

async function handleMyShips(request, env) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Invalid request." }, 400);
    }
    const gate = await requireUserSession(env, body.installId, body.discordSession);
    if (gate.response) return gate.response;
    const owners = await scanSubmissionOwners(env);
    const ids = owners.filter((o) => o.discordId === gate.discordId).map((o) => o.slug);
    const waiting = [];
    for (const id of ids) {
      const slug = env.DELETE_CODES ? await env.DELETE_CODES.get(`upd:${id}`) : null;
      if (slug && (await pendingHeader(env, slug))) waiting.push(id);
    }
    const rejected = [];
    if (env.DELETE_CODES) {
      const res = await env.DELETE_CODES.list({ prefix: `rej:${gate.discordId}:` });
      const names = res.keys.map((k) => k.name).slice(0, 50);
      const vals = await Promise.all(names.map((n) => env.DELETE_CODES.get(n)));
      vals.forEach((raw, j) => {
        try {
          const rec = JSON.parse(raw);
          rejected.push({ id: names[j].split(":").slice(2).join(":"), title: rec.title || "", reason: rec.reason || "", at: rec.at || "" });
        } catch (e) {}
      });
      rejected.sort((a, b) => (a.at < b.at ? 1 : -1));
    }
    return json({ ok: true, ids, waiting, rejected });
  } catch (err) {
    console.error("handleMyShips failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}


const COMMENT_MAX_LEN = 500;
const COMMENT_LIMIT_10MIN = 3;
const COMMENT_LIMIT_DAY = 20;
const COMMENT_PAGE = 50;
const COMMENT_CHANNEL_FALLBACK = "1557271383904354365";

const BAD_WORDS = new Set([
  "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "motherfucker", "motherfuckers", "motherfucking",
  "shit", "shits", "shitty", "shitting", "bullshit", "horseshit",
  "bitch", "bitches", "bitchy", "asshole", "assholes", "arsehole", "arseholes",
  "bastard", "bastards", "dick", "dicks", "dickhead", "dickheads", "cock", "cocks", "cocksucker",
  "pussy", "pussies", "cunt", "cunts", "twat", "twats", "wanker", "wankers", "prick", "pricks",
  "whore", "whores", "slut", "sluts", "slutty", "bollocks", "douche", "douchebag", "douchebags",
  "piss", "pissed", "jackass", "dumbass", "dipshit", "shithead", "shitheads",
  "nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "fag", "fags",
  "retard", "retards", "retarded", "tranny", "trannies", "kike", "kikes", "chink", "chinks",
  "spic", "spics", "coon", "coons", "gook", "gooks", "wetback", "wetbacks",
  "kys", "rapist", "rapists"
]);
const BAD_PHRASES = ["kill yourself", "kill your self", "go die", "hope you die"];

function commentNormalize(text) {
  return text
    .toLowerCase()
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/(.)\1{2,}/g, "$1$1");
}

function commentHasBadWord(text) {
  const norm = commentNormalize(text);
  const squash = norm.replace(/(.)\1+/g, "$1");
  for (const variant of [norm, squash]) {
    const tokens = variant.split(/[^a-z]+/).filter(Boolean);
    for (const t of tokens) {
      if (BAD_WORDS.has(t)) return true;
      const un = t.replace(/(.)\1+/g, "$1");
      for (const w of BAD_WORDS) {
        if (w.replace(/(.)\1+/g, "$1") === un) return true;
      }
    }
    const flat = variant.replace(/[^a-z]+/g, " ");
    for (const ph of BAD_PHRASES) {
      if ((" " + flat + " ").includes(" " + ph + " ")) return true;
    }
  }
  return false;
}

function commentCleanText(raw) {
  let t = (raw || "").toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

async function commentSessionOptional(env, body) {
  if (!body || !body.discordSession) return null;
  const g = await requireUserSession(env, body.installId, body.discordSession);
  if (g.response) return null;
  return g.discordId;
}

async function handleCommentCounts(request, env) {
  try {
    if (!env.DB) return json({ ok: true, counts: {} });
    await ensureD1(env);
    const res = await env.DB.prepare("SELECT ship, n FROM comment_counts WHERE n > 0").all();
    const counts = {};
    for (const r of res.results || []) counts[r.ship] = r.n;
    return json({ ok: true, counts });
  } catch (err) {
    console.error("handleCommentCounts failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function handleCommentsList(request, env) {
  try {
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: "Invalid request." }, 400);
    const ship = (body.ship || "").toString().trim();
    if (!/^[a-z0-9-]{1,120}$/.test(ship)) return json({ ok: false, error: "Invalid request." }, 400);
    await ensureD1(env);
    const me = await commentSessionOptional(env, body);
    const before = Number.isFinite(Number(body.before)) && Number(body.before) > 0 ? Math.floor(Number(body.before)) : 0;
    const stmt = before
      ? env.DB.prepare("SELECT id, owner_id, author_id, author_name, body, at FROM comments WHERE ship = ? AND id < ? ORDER BY id DESC LIMIT ?").bind(ship, before, COMMENT_PAGE + 1)
      : env.DB.prepare("SELECT id, owner_id, author_id, author_name, body, at FROM comments WHERE ship = ? ORDER BY id DESC LIMIT ?").bind(ship, COMMENT_PAGE + 1);
    const res = await stmt.all();
    let rows = res.results || [];
    const hasMore = rows.length > COMMENT_PAGE;
    if (hasMore) rows = rows.slice(0, COMMENT_PAGE);
    if (me && !before && rows.length && rows.some((r) => r.owner_id === me)) {
      await env.DB.prepare(
        "INSERT INTO comment_reads (discord_id, ship, last_id) VALUES (?, ?, ?) ON CONFLICT(discord_id, ship) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)"
      ).bind(me, ship, rows[0].id).run();
    }
    const cnt = await env.DB.prepare("SELECT n FROM comment_counts WHERE ship = ?").bind(ship).first();
    let canPost = false;
    if (me) {
      const dl = await env.DB.prepare("SELECT 1 AS x FROM ship_downloaders WHERE discord_id = ? AND ship = ?").bind(me, ship).first();
      canPost = !!dl;
      if (!canPost) {
        try {
          const o = await getSubmissionOwner(ship, env);
          canPost = !!(o && o.discordId === me);
        } catch (e) {}
      }
    }
    return json({
      ok: true,
      canPost,
      total: cnt ? cnt.n : 0,
      hasMore,
      comments: rows.map((r) => ({
        id: r.id,
        name: r.author_name || "Unknown",
        text: r.body,
        at: r.at,
        isAuthor: !!r.owner_id && r.owner_id === r.author_id
      }))
    });
  } catch (err) {
    console.error("handleCommentsList failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function postCommentToDiscord(env, rec) {
  try {
    const channel = env.COMMENT_CHANNEL_ID || COMMENT_CHANNEL_FALLBACK;
    const resp = await discordApi(`/channels/${channel}/messages`, env, {
      method: "POST",
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: `New comment: ${rec.shipName || rec.ship}`.slice(0, 250),
            description: rec.text.slice(0, 2000),
            color: 0x3a6ea5,
            fields: [
              { name: "Author", value: `${rec.authorName || "Unknown"} (<@${rec.authorId}>)`.slice(0, 200), inline: true },
              { name: "Ship ID", value: rec.ship.slice(0, 120), inline: true }
            ],
            footer: { text: `Comment ${rec.id}` }
          }
        ],
        components: [{ type: 1, components: [{ type: 2, style: 4, label: "Delete", custom_id: `cdel:${rec.id}` }] }]
      })
    });
    if (!resp.ok) console.error("comment post to discord failed: " + resp.status + " " + (await resp.text()).slice(0, 200));
  } catch (err) {
    console.error("comment post to discord error: " + (err && err.message ? err.message : String(err)));
  }
}

async function handleCommentPost(request, env, ctx) {
  try {
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: "Invalid request." }, 400);
    const gate = await requireUserSession(env, body.installId, body.discordSession);
    if (gate.response) return gate.response;
    if (await isBanned(env, [userBanKey(gate.discordId)])) {
      return json({ ok: false, error: "You can no longer comment." }, 403);
    }
    const commentLock = await lockSecondsLeft(env, `lock:user:${gate.discordId}`);
    if (commentLock > 0) {
      return json({ ok: false, error: `You are timed out. Please try again in ${Math.max(1, Math.ceil(commentLock / 60))} minutes.` }, 429);
    }
    const ship = (body.ship || "").toString().trim();
    if (!/^[a-z0-9-]{1,120}$/.test(ship)) return json({ ok: false, error: "Invalid request." }, 400);
    const text = commentCleanText(body.text);
    if (!text) return json({ ok: false, error: "Please write a comment first." }, 400);
    if (text.length > COMMENT_MAX_LEN) return json({ ok: false, error: `A comment can be at most ${COMMENT_MAX_LEN} characters.` }, 400);
    if (commentHasBadWord(text)) {
      const abWord = await commentAbuse(env, gate, "comment blocked by the word filter");
      return json({ ok: false, filtered: true, error: "Your comment contains words that are not allowed here." + abuseSuffix(abWord) }, 400);
    }
    await ensureD1(env);
    const now = Date.now();
    const recent = await env.DB.prepare("SELECT body, at FROM comments WHERE author_id = ? ORDER BY id DESC LIMIT 25").bind(gate.discordId).all();
    const rows = recent.results || [];
    const in10 = rows.filter((r) => now - r.at < 10 * 60 * 1000);
    if (in10.length >= COMMENT_LIMIT_10MIN) {
      const ab10 = await commentAbuse(env, gate, "hit the 3 comments per 10 minutes limit");
      const wait10 = Math.max(1, Math.ceil((in10[COMMENT_LIMIT_10MIN - 1].at + 10 * 60 * 1000 - now) / 1000));
      return json({ ok: false, retryAfter: wait10, error: "Slow down a bit. You can post 3 comments every 10 minutes." + abuseSuffix(ab10) }, 429);
    }
    const inDay = rows.filter((r) => now - r.at < 24 * 60 * 60 * 1000);
    if (inDay.length >= COMMENT_LIMIT_DAY) {
      const abDay = await commentAbuse(env, gate, "hit the daily limit of 20 comments");
      const waitDay = Math.max(1, Math.ceil((inDay[COMMENT_LIMIT_DAY - 1].at + 24 * 60 * 60 * 1000 - now) / 1000));
      return json({ ok: false, retryAfter: waitDay, error: "You reached the daily limit of 20 comments." + abuseSuffix(abDay) }, 429);
    }
    const flat = (t) => t.toLowerCase().replace(/\s+/g, " ").trim();
    if (rows.length && flat(rows[0].body) === flat(text)) {
      const abSame = await commentAbuse(env, gate, "posted the same comment twice");
      return json({ ok: false, error: "You just posted the same comment." + abuseSuffix(abSame) }, 400);
    }
    let ownerId = "";
    try {
      const owner = await getSubmissionOwner(ship, env);
      if (owner && owner.discordId) ownerId = owner.discordId;
    } catch (e) {}
    if (ownerId !== gate.discordId) {
      const dl = await env.DB.prepare("SELECT 1 AS x FROM ship_downloaders WHERE discord_id = ? AND ship = ?").bind(gate.discordId, ship).first();
      if (!dl) {
        return json({ ok: false, needDownload: true, error: "Download or import this Corvette first to leave a comment." }, 403);
      }
    }
    const shipName = (body.shipName || "").toString().replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 100);
    const authorName = (gate.username || "").toString().slice(0, 64);
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO comments (ship, ship_name, owner_id, author_id, author_name, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(ship, shipName, ownerId, gate.discordId, authorName, text, now),
      env.DB.prepare("INSERT INTO comment_counts (ship, n) VALUES (?, 1) ON CONFLICT(ship) DO UPDATE SET n = n + 1").bind(ship)
    ]);
    const id = results[0].meta.last_row_id;
    const cnt = await env.DB.prepare("SELECT n FROM comment_counts WHERE ship = ?").bind(ship).first();
    const rec = { id, ship, shipName, text, authorId: gate.discordId, authorName };
    if (ctx && ctx.waitUntil) ctx.waitUntil(postCommentToDiscord(env, rec));
    else await postCommentToDiscord(env, rec);
    return json({
      ok: true,
      total: cnt ? cnt.n : 1,
      comment: { id, name: authorName || "Unknown", text, at: now, isAuthor: !!ownerId && ownerId === gate.discordId }
    });
  } catch (err) {
    console.error("handleCommentPost failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function handleCommentsUnread(request, env) {
  try {
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: "Invalid request." }, 400);
    const gate = await requireUserSession(env, body.installId, body.discordSession);
    if (gate.response) return gate.response;
    await ensureD1(env);
    const res = await env.DB.prepare(
      "SELECT c.ship AS ship, MAX(c.ship_name) AS name, COUNT(*) AS n, MAX(c.id) AS mx FROM comments c " +
      "LEFT JOIN comment_reads r ON r.discord_id = ? AND r.ship = c.ship " +
      "WHERE c.owner_id = ? AND c.author_id <> ? AND c.id > COALESCE(r.last_id, 0) " +
      "GROUP BY c.ship ORDER BY mx DESC LIMIT 50"
    ).bind(gate.discordId, gate.discordId, gate.discordId).all();
    const ships = (res.results || []).map((r) => ({ ship: r.ship, name: r.name || "", n: r.n, mx: r.mx }));
    return json({ ok: true, total: ships.reduce((a, x) => a + x.n, 0), ships });
  } catch (err) {
    console.error("handleCommentsUnread failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function handleCommentsRead(request, env) {
  try {
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: "Invalid request." }, 400);
    const gate = await requireUserSession(env, body.installId, body.discordSession);
    if (gate.response) return gate.response;
    const ship = (body.ship || "").toString().trim();
    if (!/^[a-z0-9-]{1,120}$/.test(ship)) return json({ ok: false, error: "Invalid request." }, 400);
    await ensureD1(env);
    await env.DB.prepare(
      "INSERT INTO comment_reads (discord_id, ship, last_id) SELECT ?, ?, COALESCE(MAX(id), 0) FROM comments WHERE ship = ? " +
      "ON CONFLICT(discord_id, ship) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)"
    ).bind(gate.discordId, ship, ship).run();
    return json({ ok: true });
  } catch (err) {
    console.error("handleCommentsRead failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function handleCommentDeleteButton(interaction, env, idStr) {
  if (!isReviewer(interaction, env)) return ephemeral("Only reviewers can delete comments.");
  const id = parseInt(idStr, 10);
  const message = interaction.message;
  const embed = message && message.embeds ? message.embeds[0] : null;
  if (!Number.isFinite(id) || !embed) return ephemeral("Could not find this comment.");
  await ensureD1(env);
  const row = await env.DB.prepare("SELECT ship FROM comments WHERE id = ?").bind(id).first();
  if (row) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE comment_counts SET n = MAX(n - 1, 0) WHERE ship = ?").bind(row.ship)
    ]);
  }
  const clicker = interaction.member?.user || interaction.user;
  const who = clicker ? clicker.username || "a reviewer" : "a reviewer";
  return json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      embeds: [{ ...embed, color: 0xe05555, title: `Deleted by ${who}: ${embed.title || ""}`.slice(0, 250) }],
      components: []
    }
  });
}

async function handleMyDismiss(request, env) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Invalid request." }, 400);
    }
    const gate = await requireUserSession(env, body.installId, body.discordSession);
    if (gate.response) return gate.response;
    const id = (body.id || "").toString().trim();
    if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ ok: false, error: "Invalid request." }, 400);
    if (env.DELETE_CODES) await env.DELETE_CODES.delete(`rej:${gate.discordId}:${id}`);
    return json({ ok: true });
  } catch (err) {
    console.error("handleMyDismiss failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function handleMyRemove(request, env) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Invalid request." }, 400);
    }
    const gate = await requireUserSession(env, body.installId, body.discordSession);
    if (gate.response) return gate.response;
    const shipId = (body.ship || "").toString().trim();
    if (!/^[a-z0-9-]{1,80}$/.test(shipId)) return json({ ok: false, error: "Invalid request." }, 400);
    const access = await checkDiscordAccess(env, gate.discordId, false);
    if (!access.ok) return json({ ok: false, error: access.text }, access.status);
    const text = await runRemoveOwn(env, gate.discordId, gate.username || "a user", shipId);
    return json({ ok: text.startsWith("Removed"), text });
  } catch (err) {
    console.error("handleMyRemove failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function handleMyUpdate(request, env) {
  try {
    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return json({ ok: false, error: "Invalid request." }, 400);
    }
    const gate = await requireUserSession(env, form.get("installId"), form.get("discordSession"));
    if (gate.response) return gate.response;
    const shipId = (form.get("ship") || "").toString().trim();
    if (!/^[a-z0-9-]{1,80}$/.test(shipId)) return json({ ok: false, error: "Invalid request." }, 400);
    if ((await rateWindowPush(`mu/${gate.discordId}`, HOUR_MS)) > 10) {
      if (await firstAlert(`mu/${gate.discordId}`)) {
        await notifyAdmin(env, `Update spam: **${gate.username || "unknown"}** <@${gate.discordId}> tried more than 10 ship updates in 1 hour. Blocked for now.`);
      }
      return json({ ok: false, error: "Too many updates in a short time. Please try again later." }, 429);
    }
    await ensureD1(env);
    const file = form.get("file");
    let att = null;
    if (file && typeof file === "object" && file.size > 0) {
      att = { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name || "", size: file.size };
    }
    const note = (form.get("note") || "").toString();
    if (att && note.replace(/\s+/g, " ").trim().length < 3) {
      return json({ ok: false, text: "Please write what changed in this update." });
    }
    let photos = null;
    if (form.get("photosChanged") === "1") {
      let order = (form.get("order") || "")
        .toString()
        .split(",")
        .map((x) => x.trim())
        .filter((x) => /^[en][1-3]$/.test(x))
        .map((x) => ({ t: x[0], n: parseInt(x.slice(1), 10) }));
      const buffers = [];
      for (const key of ["image1", "image2", "image3"]) {
        const f = form.get(key);
        if (f && typeof f === "object" && f.size > 0) {
          if (f.size > 10 * 1024 * 1024) return json({ ok: false, text: `${f.name || "A photo"} is larger than 10 MB.` });
          const buf = await f.arrayBuffer();
          if (sniffImageType(new Uint8Array(buf)) === "application/octet-stream") {
            return json({ ok: false, text: `${f.name || "A photo"} is not a real image.` });
          }
          buffers.push(buf);
        }
      }
      if (order.length === 0) {
        const keep = (form.get("keep") || "")
          .toString()
          .split(",")
          .map((x) => parseInt(x, 10))
          .filter((n) => n >= 1 && n <= 3);
        order = [...keep.map((n) => ({ t: "e", n })), ...buffers.map((_, i) => ({ t: "n", n: i + 1 }))];
      }
      photos = { order, buffers };
    }
    const meta = {};
    if (form.has("description")) meta.description = (form.get("description") || "").toString();
    if (form.has("youtube")) meta.youtube = (form.get("youtube") || "").toString();
    if (form.has("patreon")) meta.patreon = (form.get("patreon") || "").toString();
    const text = await runUpdate(env, { id: gate.discordId, global_name: gate.username }, shipId, att, (form.get("name") || "").toString(), { note, photos, meta });
    return json({ ok: /^Your (update|changes|new name)/.test(text), text });
  } catch (err) {
    console.error("handleMyUpdate failed: " + (err && err.message ? err.message : String(err)));
    return json({ ok: false, error: "Server error." }, 500);
  }
}

async function handleAppBatchLogin(request, env) {
  try {
    if (!discordLoginReady(env)) return new Response("Discord login is not set up on the server yet.", { status: 503 });
    await ensureD1(env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    if (await isBanned(env, [ipKey])) return new Response(BLOCKED_MESSAGE, { status: 403, headers: { "x-blocked": "1" } });
    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return new Response("Invalid request.", { status: 400 });
    }
    const rawInstall = (form.get("installId") || "").toString().trim();
    if (!INSTALL_ID_RE.test(rawInstall)) {
      return new Response("Please update the Optimizer app and try again.", { status: 400 });
    }
    const idKey = await installBanKey(rawInstall.toLowerCase(), env);
    const idHash = idKey.slice(7);
    if (await isBanned(env, [idKey])) return new Response(BLOCKED_MESSAGE, { status: 403, headers: { "x-blocked": "1" } });
    if ((await lockSecondsLeft(env, `lock:id:${idHash}`)) > 0) {
      return new Response("Too many rejected uploads. Please try again later.", { status: 429, headers: { "x-blocked": "1" } });
    }
    const gate = await requireDiscord(env, form, idHash, true);
    if (gate.response) return gate.response;
    return json({ ok: true, username: gate.username });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleAppBatchLogin failed: " + msg);
    return new Response("Server error: " + msg.slice(0, 120), { status: 500 });
  }
}

async function handleAppBatchUpload(request, env, ctx) {
  let idHash = "";
  let strikeUser = "";
  const refuse = async (status, text, blocked) => {
    if (status === 400 && idHash && env.DELETE_CODES) {
      await recordRejection(env, "id", idHash, idHash.slice(0, 4));
    }
    if (status === 400 && strikeUser && env.DELETE_CODES) {
      await recordRejection(env, "user", strikeUser, strikeUser.slice(-4));
    }
    return new Response(text, { status, headers: blocked ? { "x-blocked": "1" } : {} });
  };
  try {
    if (!env.DB || !deleteCodesReady(env)) {
      return new Response("Uploading is not available right now. Please try again later.", { status: 503 });
    }
    await ensureD1(env);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    if (await isBanned(env, [ipKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403, headers: { "x-blocked": "1" } });
    }
    const declared = parseInt(request.headers.get("content-length") || "0", 10);
    if (declared > UPLOAD_MAX_BODY) {
      return new Response("The upload is too large.", { status: 413 });
    }

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return new Response("Invalid form submission.", { status: 400 });
    }

    const rawInstall = (form.get("installId") || "").toString().trim();
    if (!INSTALL_ID_RE.test(rawInstall)) {
      return new Response("Could not accept this submission: please update the Optimizer app and try again.", { status: 400 });
    }
    const idKey = await installBanKey(rawInstall.toLowerCase(), env);
    idHash = idKey.slice(7);

    if (await isBanned(env, [idKey])) {
      return new Response(BLOCKED_MESSAGE, { status: 403, headers: { "x-blocked": "1" } });
    }
    const left = await lockSecondsLeft(env, `lock:id:${idHash}`);
    if (left > 0) {
      return new Response(`Too many rejected uploads. Please try again in ${Math.max(1, Math.ceil(left / 60))} minutes.`, {
        status: 429,
        headers: { "x-blocked": "1" }
      });
    }

    const gate = await requireDiscord(env, form, idHash, true);
    if (gate.response) return gate.response;
    const discordId = gate.discordId;
    const discordName = gate.username;
    const verified = gate.verified;
    strikeUser = discordId;
    await rememberIp(env, ip, ipKey);
    if (form.get("agree") !== "yes") {
      return refuse(400, "Could not accept this submission: you must agree to the upload rules first.");
    }

    const hourKey = `batch:u:${discordId}`;
    if ((await uploadQuotaUsed(env, hourKey, HOUR_MS)) >= GUEST_UPLOADS_PER_HOUR) {
      return new Response("Too many uploads in the last hour. Please try again later.", { status: 429, headers: { "x-blocked": "1" } });
    }

    const v = await validateSubmission(form, refuse);
    if (v.response) return v.response;
    const { name, builder, description, shipFile, imageBufs, linkCheck } = v.sub;

    const shipBytes = new Uint8Array(await shipFile.arrayBuffer());
    const staged = await stageSubmission(
      { name, submitter: builder, description, patreonUrl: linkCheck.patreonUrl, youtubeUrl: linkCheck.youtubeUrl, shipBytes, imageBufs, ipKey, userKey: idKey, discordId, discordName, verified },
      env
    );
    if (!staged.ok) return refuse(400, `Could not accept this ship file: ${staged.error}.`);

    await uploadQuotaAdd(env, [hourKey]);

    const slug = staged.slug;
    ctx.waitUntil(
      (async () => {
        const embed = approvalEmbedFor(name, builder, "via app (bulk)", description, linkCheck, staged, await approvalExtraFields(slug, env, staged.check, imageBufs.length));
        const posted = await postApprovalMessage(env, embed, slug, imageBufs);
        if (!posted) console.error("approval message could not be posted for " + slug + " - use /pending");
      })()
    );

    return new Response("Thanks! Your Corvette was submitted for approval.", { status: 200 });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleAppBatchUpload failed: " + msg);
    return new Response("Server error while saving your submission: " + msg.slice(0, 120), { status: 500 });
  }
}


let d1SchemaReady = false;

async function ensureD1(env) {
  if (d1SchemaReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS pending (slug TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, meta TEXT, PRIMARY KEY (slug, part)) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS dl_seen (ship TEXT NOT NULL, kind TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (ship, kind, hash)) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS humans (token TEXT PRIMARY KEY, id_hash TEXT NOT NULL, created INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS upload_log (k TEXT NOT NULL, at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS upload_log_k ON upload_log (k, at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS discord_logins (token TEXT PRIMARY KEY, id_hash TEXT NOT NULL, created INTEGER NOT NULL, discord_id TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS discord_sessions (hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL, username TEXT NOT NULL DEFAULT '', id_hash TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS uploaders (k TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT, submitted INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, last_at INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, ship TEXT NOT NULL, ship_name TEXT NOT NULL DEFAULT '', owner_id TEXT NOT NULL DEFAULT '', author_id TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS comments_ship ON comments (ship, id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS comments_author ON comments (author_id, id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS comments_owner ON comments (owner_id, id)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS comment_counts (ship TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS comment_reads (discord_id TEXT NOT NULL, ship TEXT NOT NULL, last_id INTEGER NOT NULL, PRIMARY KEY (discord_id, ship)) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS ship_downloaders (discord_id TEXT NOT NULL, ship TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (discord_id, ship)) WITHOUT ROWID")
  ]);
  d1SchemaReady = true;
}

async function rateWindowPush(cacheKey, windowMs) {
  const cache = caches.default;
  const req = new Request(`https://rate.internal/${cacheKey}`);
  const hit = await cache.match(req);
  const now = Date.now();
  let times = [];
  if (hit) {
    try {
      times = JSON.parse(await hit.text());
    } catch (e) {
      times = [];
    }
  }
  times = times.filter((t) => now - t < windowMs);
  times.push(now);
  await cache.put(req, new Response(JSON.stringify(times), { headers: { "Cache-Control": `max-age=${Math.ceil(windowMs / 1000)}` } }));
  return times.length;
}

async function rateWindowClear(cacheKey) {
  await caches.default.put(
    new Request(`https://rate.internal/${cacheKey}`),
    new Response("[]", { headers: { "Cache-Control": "max-age=60" } })
  );
}

async function notifyAdmin(env, content) {
  try {
    await discordApi(`/channels/${env.ADMIN_CHANNEL_ID || env.APPROVAL_CHANNEL_ID}/messages`, env, {
      method: "POST",
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });
  } catch (err) {
    console.error("notifyAdmin failed: " + (err && err.message ? err.message : String(err)));
  }
}

const COMMENT_ABUSE_WINDOW_MS = 30 * 60 * 1000;
const COMMENT_ABUSE_LIMIT = 5;
const ALERT_WINDOW_MS = 30 * 60 * 1000;

function ipRawKey(ipKey) {
  return ipKey && ipKey.startsWith("ban:ip:") ? `ipraw:${ipKey.slice(7)}` : null;
}

async function rememberIp(env, ip, ipKey) {
  try {
    const k = ipRawKey(ipKey);
    if (!env.DELETE_CODES || !k || !ip || ip === "unknown") return;
    await env.DELETE_CODES.put(k, ip, { expirationTtl: 30 * 24 * 60 * 60 });
  } catch (e) {}
}

async function firstAlert(key, windowMs) {
  try {
    return (await rateWindowPush(`alert/${key}`, windowMs || ALERT_WINDOW_MS)) === 1;
  } catch (e) {
    return false;
  }
}

async function describeKey(env, key) {
  if (!key || !env.DELETE_CODES) return "";
  try {
    let did = "";
    if (key.startsWith("ban:user:")) did = key.slice(9);
    else if (key.startsWith("ban:id:")) did = (await env.DELETE_CODES.get(linkKey(key))) || "";
    if (!did) return "";
    const nm = (await env.DELETE_CODES.get(`dname:${did}`)) || "";
    return `<@${did}>${nm ? ` (${nm})` : ""}`;
  } catch (e) {
    return "";
  }
}

function ipHint(ipKey) {
  const k = ipRawKey(ipKey);
  return k ? ` IP: open Cloudflare, KV, key \`${k}\` (the real IP is only stored there).` : "";
}

async function commentAbuse(env, gate, reason) {
  try {
    if (!env.DELETE_CODES) return;
    const cacheKey = `cabuse/${gate.discordId}`;
    const n = await rateWindowPush(cacheKey, COMMENT_ABUSE_WINDOW_MS);
    if (n === 1) {
      await notifyAdmin(env, `Comment warning: **${gate.username || "unknown"}** <@${gate.discordId}> - ${reason}.`);
    }
    if (n >= COMMENT_ABUSE_LIMIT) {
      await rateWindowClear(cacheKey);
      await applyStrike(env, { rule: "comment", kind: "user", hash: gate.discordId, code: gate.username || gate.discordId });
    }
    return n;
  } catch (err) {
    console.error("commentAbuse failed: " + (err && err.message ? err.message : String(err)));
    return 0;
  }
}

function abuseSuffix(n) {
  if (n >= COMMENT_ABUSE_LIMIT) return " You are now timed out for a while.";
  if (n >= COMMENT_ABUSE_LIMIT - 2) return " Warning: more blocked comments will give you a timeout.";
  return "";
}

async function lockSecondsLeft(env, lockKey) {
  if (!env.DELETE_CODES) return 0;
  const raw = await env.DELETE_CODES.get(lockKey);
  if (!raw) return 0;
  try {
    const left = Math.ceil((JSON.parse(raw).until - Date.now()) / 1000);
    return left > 0 ? left : 0;
  } catch (e) {
    return 0;
  }
}

async function applyStrike(env, t) {
  const { rule, kind, hash, code, shipId } = t;
  const strikeKey = `strike:${kind}:${hash}:${rule}`;
  const lockKey = `lock:${kind}:${hash}`;
  const banKey = `ban:${kind}:${hash}`;
  let n = 1;
  const prev = await env.DELETE_CODES.get(strikeKey);
  if (prev) n = (parseInt(prev, 10) || 0) + 1;
  await env.DELETE_CODES.put(strikeKey, String(n));
  const ruleText =
    rule === "ship" ? `same ship (${shipId}) ${SHIP_LIMIT}x in 30 minutes`
    : rule === "all" ? `more than ${ALL_LIMIT} requests in 1 hour`
    : rule === "comment" ? `${COMMENT_ABUSE_LIMIT} blocked comments in 30 minutes`
    : `${REJECT_LIMIT} rejected uploads in 30 minutes`;
  const who = kind === "id" ? "app installation" : kind === "ip" ? "connection" : "Discord user";
  const strikes = ["ship", "all", "upload", "comment"].map((r) => `strike:${kind}:${hash}:${r}`);
  const person = await describeKey(env, `ban:${kind}:${hash}`);
  const extra = (person ? ` - ${person}` : "") + (kind === "ip" ? ipHint(`ban:ip:${hash}`) : "");

  let seconds = 0;
  if (rule === "all") seconds = n === 1 ? 3600 : 0;
  else seconds = n === 1 ? 3600 : n === 2 ? 86400 : 0;

  if (seconds === 0) {
    await addBan(env, banKey, `${who} ${code} - auto-ban: ${ruleText}`, "auto-ban", strikes);
    await env.DELETE_CODES.delete(lockKey);
    console.log(JSON.stringify({ event: "ban", kind, code, rule, ship: shipId || null, strike: n }));
    await notifyAdmin(env, `Ban: ${who} **${code}**${extra} is banned (${ruleText}, strike ${n}). Use /unban to lift it.`);
    return { banned: true, seconds: 0 };
  }
  const until = Date.now() + seconds * 1000;
  await env.DELETE_CODES.put(
    lockKey,
    JSON.stringify({ label: `${who} ${code} - ${ruleText}`, until, strikes }),
    { expirationTtl: seconds + 3600 }
  );
  console.log(JSON.stringify({ event: "lock", kind, code, rule, ship: shipId || null, strike: n, seconds }));
  await notifyAdmin(env, `Lock: ${who} **${code}**${extra} is locked for ${seconds >= 86400 ? "24 hours" : "1 hour"} (${ruleText}, strike ${n}).`);
  return { banned: false, seconds };
}

async function recordRejection(env, kind, hash, code) {
  if (!env.DELETE_CODES || !hash) return;
  const n = await rateWindowPush(`rej/${kind}/${hash}`, REJECT_WINDOW_MS);
  if (n >= REJECT_LIMIT) {
    await applyStrike(env, { rule: "upload", kind, hash, code });
    await rateWindowClear(`rej/${kind}/${hash}`);
  }
}

async function pendingCount(env) {
  if (!env.DB) return 0;
  await ensureD1(env);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM pending WHERE part = 0").first();
  return row ? row.n : 0;
}

async function recordDownloadStat(env, id, installId, ip) {
  if (!env.DB || !env.DELETE_PEPPER) return;
  const idHash = (await hashDeleteCode(`dlid:${id}`, installId.toLowerCase(), env)).slice(0, 32);
  await ensureD1(env);
  const seen = await env.DB.prepare("SELECT 1 AS x FROM dl_seen WHERE ship = ? AND kind = 'id' AND hash = ?").bind(id, idHash).first();
  if (seen) return;
  const ipKind = ip && ip !== "unknown" ? `ip:${(await hashDeleteCode(`dlip:${id}`, ip, env)).slice(0, 24)}` : null;
  if (ipKind) {
    const ipRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM dl_seen WHERE ship = ? AND kind = ?").bind(id, ipKind).first();
    if (ipRow && ipRow.n >= STAT_MAX_IDS_PER_IP) return;
  }
  const hourKey = `cap:${id}:${Math.floor(Date.now() / 3600000)}`;
  const dayKey = `capd:${id}:${Math.floor(Date.now() / 86400000)}`;
  const capHour = await env.DB.prepare("SELECT n FROM counters WHERE k = ?").bind(hourKey).first();
  const capDay = await env.DB.prepare("SELECT n FROM counters WHERE k = ?").bind(dayKey).first();
  if ((capHour && capHour.n >= STAT_CAP_PER_HOUR) || (capDay && capDay.n >= STAT_CAP_PER_DAY)) return;

  const found = await findInIndex(env, id);
  if (!found) return;
  found.entry.downloads = (found.entry.downloads || 0) + 1;
  await writeShard(env, found.shard, `Track download: ${id}`);

  const seenStmts = [env.DB.prepare("INSERT OR IGNORE INTO dl_seen (ship, kind, hash) VALUES (?, 'id', ?)").bind(id, idHash)];
  if (ipKind) seenStmts.push(env.DB.prepare("INSERT OR IGNORE INTO dl_seen (ship, kind, hash) VALUES (?, ?, ?)").bind(id, ipKind, idHash));
  await env.DB.batch([
    ...seenStmts,
    env.DB.prepare("INSERT INTO counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(hourKey),
    env.DB.prepare("INSERT INTO counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(dayKey)
  ]);
}

const DL_DAY_LIMIT_GUEST = 25;
const DL_DAY_LIMIT_USER = 50;
const DL_DAY_LIMIT_IP_USER = 100;
const DL_TEMPO_LIMIT = 10;
const DL_TEMPO_WINDOW_MS = 10 * 60 * 1000;
const DL_PATTERN_INSTALLS = 4;
const FRONT_LIMIT_PER_MIN = 120;
const IP_GATED_PATHS = new Set([
  "/my-ships",
  "/my-remove",
  "/my-dismiss",
  "/comments-list",
  "/comment-post",
  "/comments-unread",
  "/comments-read",
  "/my-update"
]);

async function rateWindowInfo(cacheKey, windowMs) {
  const hit = await caches.default.match(new Request(`https://rate.internal/${cacheKey}`));
  const now = Date.now();
  let times = [];
  if (hit) {
    try {
      times = JSON.parse(await hit.text());
    } catch (e) {
      times = [];
    }
  }
  times = times.filter((t) => now - t < windowMs);
  return { count: times.length, oldest: times.length ? Math.min(...times) : now };
}

async function frontGate(env, ip) {
  const fh = (await hashDeleteCode("fg:ip", ip, env)).slice(0, 24);
  const blockReq = new Request(`https://rate.internal/fgblock/${fh}`);
  const tooMany = () => new Response("Too many requests. Please wait a few minutes.", { status: 429, headers: { "retry-after": "600" } });
  if (await caches.default.match(blockReq)) return tooMany();
  const n = await rateWindowPush(`fg/${fh}`, 60 * 1000);
  if (n <= FRONT_LIMIT_PER_MIN) return null;
  await caches.default.put(blockReq, new Response("1", { headers: { "Cache-Control": "max-age=600" } }));
  if (await firstAlert(`fg/${fh}`)) {
    const k = await ipBanKey(ip, env);
    await rememberIp(env, ip, k);
    await notifyAdmin(env, `Request flood: one connection sent more than ${FRONT_LIMIT_PER_MIN} requests in 1 minute. Paused for 10 minutes.${ipHint(k)}`);
  }
  return tooMany();
}

async function handleDownloadRequest(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ allowed: true });
  }
  const id = (body.id || "").toString();
  const rawInstall = (body.installId || "").toString().trim();
  if (!/^[a-z0-9-]{1,60}$/.test(id) || !INSTALL_ID_RE.test(rawInstall) || !deleteCodesReady(env)) {
    return json({ allowed: true });
  }
  const installId = rawInstall.toLowerCase();
  const idHash = (await hashDeleteCode("ban:id", installId, env)).slice(0, 32);
  const code = idHash.slice(0, 4);
  const callerIp = request.headers.get("CF-Connecting-IP") || "unknown";
  let ipHash = null;
  let ipBan = null;
  if (callerIp !== "unknown") {
    ipHash = (await hashDeleteCode("tk:ip", callerIp, env)).slice(0, 24);
    ipBan = await ipBanKey(callerIp, env);
  }

  if (ipBan && (await env.DELETE_CODES.get(ipBan))) {
    console.log(JSON.stringify({ event: "denied-ban", kind: "ip", ip: callerIp, ship: id }));
    return json({ allowed: false, banned: true });
  }
  if (await env.DELETE_CODES.get(`ban:id:${idHash}`)) {
    console.log(JSON.stringify({ event: "denied-ban", kind: "install", code, ship: id }));
    return json({ allowed: false, banned: true });
  }
  let dlUser = null;
  if (body.discordSession && discordLoginReady(env) && env.DB) {
    try {
      const sess = await resolveDiscordSession(env, (body.discordSession || "").toString(), idHash);
      if (sess) dlUser = sess.discordId;
    } catch (err) {
      console.error("download session failed: " + (err && err.message ? err.message : String(err)));
    }
  }
  if (dlUser && (await env.DELETE_CODES.get(userBanKey(dlUser)))) {
    console.log(JSON.stringify({ event: "denied-ban", kind: "discord", code, ship: id }));
    return json({ allowed: false, banned: true });
  }
  const lockRaw = await env.DELETE_CODES.get(`lock:id:${idHash}`);
  if (lockRaw) {
    try {
      const lock = JSON.parse(lockRaw);
      const left = Math.ceil((lock.until - Date.now()) / 1000);
      if (left > 0) {
        console.log(JSON.stringify({ event: "denied-lock", code, ship: id, seconds: left }));
        return json({ allowed: false, banned: false, seconds: left });
      }
    } catch (e) {}
  }

  if (ipHash) {
    const tempo = await rateWindowInfo(`dltempo/${ipHash}`, DL_TEMPO_WINDOW_MS);
    if (tempo.count >= DL_TEMPO_LIMIT) {
      const wait = Math.max(30, Math.ceil((tempo.oldest + DL_TEMPO_WINDOW_MS - Date.now()) / 1000));
      if (await firstAlert(`dltempo/${ipHash}`)) {
        await rememberIp(env, callerIp, ipBan);
        const who = dlUser ? `<@${dlUser}>` : `app installation ${code}`;
        await notifyAdmin(env, `Download tempo: one connection asked for more than ${DL_TEMPO_LIMIT} downloads in 10 minutes (${who}). Paused for ${Math.ceil(wait / 60)} minutes.${ipHint(ipBan)}`);
      }
      return json({ allowed: false, banned: false, seconds: wait, reason: "tempo" });
    }
  }

  const shipCount = await rateWindowPush(`ship/${idHash}/${id}`, SHIP_WINDOW_MS);
  const allCount = await rateWindowPush(`all/${idHash}`, ALL_WINDOW_MS);
  let strike = null;
  if (shipCount >= SHIP_LIMIT) {
    strike = await applyStrike(env, { rule: "ship", kind: "id", hash: idHash, code, shipId: id });
    await rateWindowClear(`ship/${idHash}/${id}`);
  } else if (allCount > ALL_LIMIT) {
    strike = await applyStrike(env, { rule: "all", kind: "id", hash: idHash, code });
    await rateWindowClear(`all/${idHash}`);
  }
  if (strike) return json({ allowed: false, banned: strike.banned, seconds: strike.seconds });

  if (ipHash) {
    const issued = await rateWindowPush(`tk/${ipHash}`, 60 * 60 * 1000);
    if (issued > TICKET_IP_LIMIT_PER_HOUR) {
      if (await firstAlert(`dlip/${ipHash}`)) {
        await rememberIp(env, callerIp, ipBan);
        const dlPerson = dlUser ? `<@${dlUser}>` : (await describeKey(env, `ban:id:${idHash}`)) || `app installation ${code}`;
        await notifyAdmin(env, `Download spam: more than ${TICKET_IP_LIMIT_PER_HOUR} downloads in 1 hour from one connection (${dlPerson}). Blocked for 10 minutes.${ipHint(ipBan)}`);
        console.log(JSON.stringify({ event: "download-spam", ip: callerIp, code }));
      }
      return json({ allowed: false, banned: false, seconds: 600 });
    }
  }

  let remaining = null;
  let dayLimit = null;
  if (env.DB && ipHash) {
    try {
      await ensureD1(env);
      const day = Math.floor(Date.now() / 86400000);
      const ipDayKey = `dld:i:${ipHash}:${day}`;
      const userDayKey = dlUser ? `dld:u:${dlUser}:${day}` : null;
      const limitIp = dlUser ? DL_DAY_LIMIT_IP_USER : DL_DAY_LIMIT_GUEST;
      const rows = await env.DB.prepare("SELECT k, n FROM counters WHERE k IN (?, ?)").bind(ipDayKey, userDayKey || ipDayKey).all();
      let usedIp = 0;
      let usedUser = 0;
      for (const r of rows.results || []) {
        if (r.k === ipDayKey) usedIp = r.n;
        else if (r.k === userDayKey) usedUser = r.n;
      }
      const hitUser = !!dlUser && usedUser >= DL_DAY_LIMIT_USER;
      const hitIp = usedIp >= limitIp;
      if (hitUser || hitIp) {
        const resetSeconds = Math.max(60, Math.ceil((86400000 - (Date.now() % 86400000)) / 1000));
        const alertKey = hitUser ? dlUser : ipHash;
        if (await firstAlert(`dlday/${alertKey}`, 86400000)) {
          await rememberIp(env, callerIp, ipBan);
          const text = hitUser
            ? `Daily limit reached: <@${dlUser}> used ${usedUser} of ${DL_DAY_LIMIT_USER} downloads today.`
            : `Daily limit reached: one connection used ${usedIp} of ${limitIp} downloads today (${dlUser ? `logged in as <@${dlUser}>` : "not logged in"}).`;
          await notifyAdmin(env, `${text}${ipHint(ipBan)}`);
        }
        return json({
          allowed: false,
          banned: false,
          seconds: resetSeconds,
          reason: "daily",
          limit: hitUser ? DL_DAY_LIMIT_USER : limitIp,
          loggedIn: !!dlUser,
          userLimit: DL_DAY_LIMIT_USER
        });
      }
      const stmts = [
        env.DB.prepare("INSERT INTO counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(ipDayKey),
        env.DB.prepare("INSERT OR IGNORE INTO counters (k, n) VALUES (?, 1)").bind(`dli:${ipHash}:${day}:${idHash.slice(0, 12)}`)
      ];
      if (userDayKey) stmts.push(env.DB.prepare("INSERT INTO counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(userDayKey));
      await env.DB.batch(stmts);
      dayLimit = dlUser ? DL_DAY_LIMIT_USER : DL_DAY_LIMIT_GUEST;
      remaining = dlUser ? Math.min(DL_DAY_LIMIT_USER - usedUser - 1, limitIp - usedIp - 1) : limitIp - usedIp - 1;
      const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM counters WHERE k GLOB ?").bind(`dli:${ipHash}:${day}:*`).first();
      if (cnt && cnt.n >= DL_PATTERN_INSTALLS && (await firstAlert(`dlpat/${ipHash}`, 86400000))) {
        await rememberIp(env, callerIp, ipBan);
        await notifyAdmin(env, `Possible scraper: one connection used ${cnt.n} different app installations for downloads today.${ipHint(ipBan)}`);
      }
    } catch (err) {
      console.error("daily limit check failed: " + (err && err.message ? err.message : String(err)));
    }
  }

  if (ipHash) await rateWindowPush(`dltempo/${ipHash}`, DL_TEMPO_WINDOW_MS);

  if (dlUser && env.DB) {
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO ship_downloaders (discord_id, ship, at) VALUES (?, ?, ?)").bind(dlUser, id, Date.now()).run();
    } catch (err) {
      console.error("record downloader failed: " + (err && err.message ? err.message : String(err)));
    }
  }

  ctx.waitUntil(
    recordDownloadStat(env, id, installId, callerIp).catch((err) => {
      console.error("recordDownloadStat failed: " + (err && err.message ? err.message : String(err)));
    })
  );
  const exp = Date.now() + 120000;
  const ticket = `${exp}.${(await hashDeleteCode(`ticket:${id}`, String(exp), env)).slice(0, 32)}`;
  const out = { allowed: true, ticket };
  if (remaining !== null && dayLimit !== null) {
    out.remaining = Math.max(0, remaining);
    out.limit = dayLimit;
    out.userLimit = DL_DAY_LIMIT_USER;
    out.loggedIn = !!dlUser;
  }
  return json(out);
}

async function handleLibraryAccess(request, env) {
  try {
    if (!deleteCodesReady(env)) return json({ blocked: false });
    const body = await readJsonBody(request);
    if (!body) return json({ blocked: false });
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    const checks = [{ key: ipKey, kind: "connection" }];
    let idKey = null;
    const rawInstall = (body.installId || "").toString().trim();
    if (INSTALL_ID_RE.test(rawInstall)) {
      idKey = await installBanKey(rawInstall.toLowerCase(), env);
      checks.push({ key: idKey, kind: "app installation" });
    }
    const token = (body.discordSession || "").toString();
    if (idKey && DISCORD_SESSION_RE.test(token) && env.DB) {
      const sess = await resolveDiscordSession(env, token, idKey.slice(7));
      if (sess) checks.push({ key: userBanKey(sess.discordId), kind: "Discord user" });
    }
    for (const c of checks) {
      if (c.key && (await env.DELETE_CODES.get(c.key))) {
        if (await firstAlert(`libblock/${c.key}`, 24 * 60 * 60 * 1000)) {
          if (c.kind === "connection") await rememberIp(env, ip, c.key);
          const person = (await describeKey(env, c.key)) || (await describeKey(env, idKey));
          await notifyAdmin(env, `Blocked visitor tried to open the library (${c.kind} ban)${person ? ` - ${person}` : ""}.${c.kind === "connection" ? ipHint(c.key) : ""}`);
        }
        console.log(JSON.stringify({ event: "library-blocked", kind: c.kind, ip }));
        return json({ blocked: true });
      }
    }
    return json({ blocked: false });
  } catch (err) {
    console.error("handleLibraryAccess failed: " + (err && err.message ? err.message : String(err)));
    return json({ blocked: false });
  }
}

const TICKET_IP_LIMIT_PER_HOUR = 30;

async function ticketValid(env, id, ticket) {
  if (!ticket) return false;
  const parts = ticket.split(".");
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  const now = Date.now();
  if (!Number.isFinite(exp) || exp < now || exp > now + 10 * 60 * 1000) return false;
  const good = (await hashDeleteCode(`ticket:${id}`, String(exp), env)).slice(0, 32);
  return safeEqualHex(good, parts[1]);
}

async function handleLibFile(request, env, url) {
  if (storageMode(env) === "github") return new Response("Not available.", { status: 404 });
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice("/lib/".length));
  } catch (e) {
    return new Response("Invalid request.", { status: 400 });
  }
  const m = /^ships\/([a-z0-9-]{1,80})\/ship\.json$/.exec(key);
  if (!m) return new Response("Not found.", { status: 404 });
  if (deleteCodesReady(env)) {
    const ok = await ticketValid(env, m[1], url.searchParams.get("ticket") || "");
    if (!ok) return new Response("Download this ship from the Optimizer app.", { status: 403 });
  }
  const buf = await storageReadBytes(env, key);
  if (!buf) return new Response("Not found.", { status: 404 });
  return new Response(buf, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function deleteShip(id, env) {
  const found = await findInIndex(env, id);
  if (!found) throw new Error("ship id not found in the index");
  const entry = found.entry;
  found.shard.list = found.shard.list.filter((e) => e.id !== id);
  await writeShard(env, found.shard, `Remove ${id} from index`);
  return deleteShipFiles(id, entry, env);
}

async function deleteShipFiles(id, entry, env) {
  await deleteFile(`ships/${id}/ship.json`, `Delete ${id}`, env);
  const imageCount = Math.max(1, Math.min(3, (entry && entry.imageCount) || 1));
  for (let i = 0; i < imageCount; i++) {
    const fname = i === 0 ? "preview.png" : `preview${i + 1}.png`;
    await deleteFile(`ships/${id}/${fname}`, `Delete ${id}`, env);
  }
  await deleteFile(`ships/${id}/info.json`, `Delete ${id}`, env);
  await removeDeleteCode(id, env);
  if (env.DELETE_CODES) await env.DELETE_CODES.delete(`sub:${id}`);
  if (env.DB) {
    try {
      await ensureD1(env);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM dl_seen WHERE ship = ?").bind(id),
        env.DB.prepare("DELETE FROM comments WHERE ship = ?").bind(id),
        env.DB.prepare("DELETE FROM comment_counts WHERE ship = ?").bind(id),
        env.DB.prepare("DELETE FROM comment_reads WHERE ship = ?").bind(id),
        env.DB.prepare("DELETE FROM ship_downloaders WHERE ship = ?").bind(id)
      ]);
    } catch (err) {
      console.error("d1 cleanup failed: " + (err && err.message ? err.message : String(err)));
    }
  }
  return entry ? entry.name : id;
}

async function readDisabled(env) {
  const got = await storageReadText(env, "disabled.json");
  if (!got) return { sha: undefined, list: [] };
  let list = [];
  try {
    list = JSON.parse(got.text);
    if (!Array.isArray(list)) list = [];
  } catch (e) {
    list = [];
  }
  return { sha: got.sha, list };
}

async function writeDisabled(env, d, message) {
  await storageWriteText(env, "disabled.json", JSON.stringify(d.list, null, 2), message, d.sha);
}

const PURGE_DAYS = 7;

function installCode(key) {
  if (!key) return "????";
  if (key.startsWith("ban:user:")) return key.slice(-4);
  return key.slice(7, 11);
}

function disabledComponents(id, disabled, scheduled) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: scheduled ? "Restore" : "Put back online", custom_id: `enable:${id}`, disabled: !!disabled },
        { type: 2, style: 4, label: scheduled ? "Delete now" : "Delete permanently", custom_id: `purge:${id}`, disabled: !!disabled }
      ]
    }
  ];
}

async function takeOffline(id, who, env, purgeAtMs) {
  const found = await findInIndex(env, id);
  if (!found) return { ok: false, text: "That ship is not in the library list (already offline or removed). Nothing changed." };
  const entry = found.entry;
  const name = entry.name || id;
  const disabled = await readDisabled(env);
  const rec = { ...entry, disabledAt: new Date().toISOString(), disabledBy: who };
  if (purgeAtMs) rec.purgeAt = new Date(purgeAtMs).toISOString();
  disabled.list = disabled.list.filter((e) => e.id !== id);
  disabled.list.push(rec);
  await writeDisabled(env, disabled, purgeAtMs ? `Schedule delete ${id}` : `Disable ${id}`);
  found.shard.list = found.shard.list.filter((e) => e.id !== id);
  await writeShard(env, found.shard, `Take ${id} offline`);
  const owner = await getSubmissionOwner(id, env);
  const key = owner ? owner.userKey || owner.ipKey : null;
  const fields = [
    { name: "Builder", value: entry.submitter || "unknown", inline: true },
    { name: "Ship ID", value: `\`${id}\``, inline: true },
    ...(owner && owner.discordId ? [{ name: "Discord user", value: `<@${owner.discordId}>`, inline: true }] : []),
    { name: "Installation", value: key ? `${installCode(key)} (${owner.userKey ? "app" : "guest connection"})` : "unknown (older upload)", inline: true },
    { name: purgeAtMs ? "Removed by" : "Taken offline by", value: who, inline: true }
  ];
  if (purgeAtMs) fields.push({ name: "Deleted for good on", value: new Date(purgeAtMs).toISOString().slice(0, 10), inline: true });
  const embed = { title: `${purgeAtMs ? "Scheduled for deletion" : "Offline"}: ${name}`, color: purgeAtMs ? 0xe05555 : 0xe89a2f, fields };
  let noticeOk = false;
  try {
    const resp = await discordApi(`/channels/${env.ADMIN_CHANNEL_ID}/messages`, env, {
      method: "POST",
      body: JSON.stringify({ embeds: [embed], components: disabledComponents(id, false, !!purgeAtMs) })
    });
    if (resp.ok) {
      noticeOk = true;
      try {
        const msg = await resp.json();
        const d2 = await readDisabled(env);
        const r2 = d2.list.find((e) => e.id === id);
        if (r2 && msg && msg.id) {
          r2.noticeId = msg.id;
          await writeDisabled(env, d2, `Notice for ${id}`);
        }
      } catch (e) {
        console.error("could not store notice id for " + id);
      }
    } else {
      console.error("offline notice failed: " + resp.status + " " + (await resp.text()));
    }
  } catch (err) {
    console.error("offline notice error: " + (err && err.message ? err.message : String(err)));
  }
  return { ok: true, name, noticeOk };
}

async function disableShip(id, who, env) {
  const r = await takeOffline(id, who, env, 0);
  if (!r.ok) return r.text;
  if (!r.noticeOk) return `"${r.name}" is offline, but the message in the supervisor channel could not be posted. Check the bot's permissions there.`;
  return `"${r.name}" is now offline. A supervisor can put it back from the supervisor channel.`;
}

async function enableShip(id, env) {
  const disabled = await readDisabled(env);
  const rec = disabled.list.find((e) => e.id === id);
  if (!rec) return { ok: false, text: "This ship is not in the offline list anymore." };
  const entry = { ...rec };
  delete entry.disabledAt;
  delete entry.disabledBy;
  delete entry.purgeAt;
  delete entry.noticeId;
  await addToIndex(env, entry, `Put ${id} back online`);
  disabled.list = disabled.list.filter((e) => e.id !== id);
  await writeDisabled(env, disabled, `Enable ${id}`);
  return { ok: true };
}

async function purgeDisabledShip(id, env) {
  const disabled = await readDisabled(env);
  const rec = disabled.list.find((e) => e.id === id);
  if (!rec) return { ok: false, text: "This ship is not in the offline list anymore." };
  await deleteShipFiles(id, rec, env);
  disabled.list = disabled.list.filter((e) => e.id !== id);
  await writeDisabled(env, disabled, `Delete ${id}`);
  return { ok: true };
}

async function myShipChoices(env, discordId, q) {
  const [owners, list] = await Promise.all([scanSubmissionOwners(env), readIndexList(env)]);
  const mine = new Set(owners.filter((o) => o.discordId === discordId).map((o) => o.slug));
  return list
    .filter((e) => mine.has(e.id))
    .filter((e) => !q || (e.name || "").toLowerCase().includes(q) || (e.id || "").toLowerCase().includes(q))
    .sort((a, b) => (b.approvedAt || "").localeCompare(a.approvedAt || ""))
    .slice(0, 25)
    .map((e) => ({ name: shipLabel(e).slice(0, 100), value: e.id }));
}

async function runRemoveOwn(env, discordId, username, shipId) {
  const owner = await getSubmissionOwner(shipId, env);
  if (!owner || !owner.discordId) {
    return "I cannot link this ship to a Discord account. Log in with Discord in the Optimizer app first, then try again. Nothing was removed.";
  }
  if (owner.discordId !== discordId) {
    return "You can only remove your own ships. Nothing was removed.";
  }
  const purgeAtMs = Date.now() + PURGE_DAYS * 86400000;
  const res = await takeOffline(shipId, `${username} (uploader)`, env, purgeAtMs);
  if (!res.ok) return res.text;
  return `Removed "${res.name}" from the library. It is gone from the app now.`;
}

async function handleRemoveCommand(interaction, env, ctx) {
  const clicker = interaction.member?.user || interaction.user;
  if (!clicker || !clicker.id) return ephemeral("Could not read your Discord account.");
  if (env.DISCORD_GUILD_ID && interaction.guild_id !== env.DISCORD_GUILD_ID) return ephemeral("This command only works in our Discord server.");
  if (env.REMOVE_CHANNEL_ID && interaction.channel_id !== env.REMOVE_CHANNEL_ID) {
    return ephemeral(`This command only works in <#${env.REMOVE_CHANNEL_ID}>.`);
  }
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const shipId = (opts.ship || "").toString().trim();
  if (!shipId) return ephemeral("Pick one of your ships first.");
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await runRemoveOwn(env, clicker.id, clicker.global_name || clicker.username || "a user", shipId);
      } catch (err) {
        console.error("handleRemoveCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not remove that ship. Please try again in a minute.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("remove reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

const UPDATE_FILE_RE = /\.(nmsship|nmsbase|nmsprefab|json|txt)$/i;

function isDiscordCdnUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && (x.hostname.endsWith(".discordapp.com") || x.hostname.endsWith(".discordapp.net"));
  } catch (e) {
    return false;
  }
}

async function runUpdate(env, clicker, shipId, att, newNameRaw, extra = {}) {
  const owner = await getSubmissionOwner(shipId, env);
  if (!owner || !owner.discordId) {
    return "I cannot link this ship to a Discord account. Log in with Discord in the Optimizer app first, then try again. Nothing was sent.";
  }
  if (owner.discordId !== clicker.id) return "You can only update your own ships. Nothing was sent.";

  const access = await checkDiscordAccess(env, clicker.id, false);
  if (!access.ok) return access.text;

  const found = await findInIndex(env, shipId);
  if (!found) return "That ship is not in the library list anymore. Nothing was sent.";
  const entry = found.entry;

  let newName = (newNameRaw || "").toString().replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (newName === entry.name) newName = "";
  const hasFile = !!att;
  const hasPhotos = !!extra.photos;
  const metaIn = extra.meta || {};
  let newDescription;
  if (metaIn.description !== undefined) {
    const d = metaIn.description.toString().replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
    if (d.length > DESCRIPTION_MAX) return `The instructions are longer than ${DESCRIPTION_MAX} characters. Nothing was sent.`;
    if (d !== (entry.description || "")) newDescription = d;
  }
  let newYoutube;
  let newPatreon;
  if (metaIn.youtube !== undefined || metaIn.patreon !== undefined) {
    const links = classifyLinks(
      metaIn.youtube !== undefined ? metaIn.youtube : entry.youtubeUrl || "",
      metaIn.patreon !== undefined ? metaIn.patreon : entry.patreonUrl || "",
      ""
    );
    if (!links.ok) return `Could not accept the links: ${links.error}. Nothing was sent.`;
    if ((links.youtubeUrl || "") !== (entry.youtubeUrl || "")) newYoutube = links.youtubeUrl || "";
    if ((links.patreonUrl || "") !== (entry.patreonUrl || "")) newPatreon = links.patreonUrl || "";
  }
  const metaChanged = newDescription !== undefined || newYoutube !== undefined || newPatreon !== undefined;
  if (!hasFile && !newName && !hasPhotos && !metaChanged) return "Change the file, the name, the photos, the instructions or the links first. Nothing was sent.";
  const note = (extra.note || "").toString().replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

  const waiting = await env.DELETE_CODES.get(`upd:${shipId}`);
  if (waiting && (await pendingGet(env, waiting))) {
    return "You already have an update waiting for approval for this ship. Please wait until it has been checked.";
  }
  if ((await pendingCount(env)) >= MAX_PENDING_ITEMS) return "The waiting list is full, please try again later.";

  let images = [];
  if (hasPhotos) {
    const oldCount = Math.max(1, Math.min(3, entry.imageCount || 1));
    const order = extra.photos.order || [];
    if (order.length < 1) return "A Corvette needs at least 1 photo. Nothing was sent.";
    if (order.length > 3) return "A Corvette can have at most 3 photos. Nothing was sent.";
    const usedExisting = new Set();
    for (const tok of order) {
      if (tok.t === "e") {
        if (!Number.isInteger(tok.n) || tok.n < 1 || tok.n > oldCount || usedExisting.has(tok.n)) return "Invalid photo order. Nothing was sent.";
        usedExisting.add(tok.n);
        const existing = await storageReadBytes(env, `ships/${shipId}/${tok.n === 1 ? "preview.png" : `preview${tok.n}.png`}`);
        if (!existing) return "Could not read the existing photos. Please try again.";
        images.push(existing);
      } else {
        const buf = extra.photos.buffers[tok.n - 1];
        if (!buf) return "Invalid photo order. Nothing was sent.";
        images.push(buf);
      }
    }
  }

  let objectsText = "";
  let meta = { objectCount: entry.objectCount || 0, score: entry.score || 0, utilities: entry.utilities || [] };
  let check = "";
  if (hasFile) {
    if (!att.bytes && (!att.url || !isDiscordCdnUrl(att.url))) return "Could not read the attached file. Please try again.";
    if (!UPDATE_FILE_RE.test(att.filename || "")) return "The file must be .nmsship, .nmsbase, .nmsprefab, .json or .txt. Nothing was sent.";
    if (att.size && att.size > 3 * 1024 * 1024) return "The file is larger than 3 MB. Nothing was sent.";
    let bytes = att.bytes;
    if (!bytes) {
      const resp = await fetch(att.url);
      if (!resp.ok) return "Could not download the attached file. Please try again.";
      bytes = new Uint8Array(await resp.arrayBuffer());
    }
    if (bytes.length === 0 || bytes.length > 3 * 1024 * 1024) return "The file is empty or larger than 3 MB. Nothing was sent.";
    const norm = await normalizeShipBytes(bytes);
    if (!norm.ok) return `Could not accept this file: ${norm.error}. Nothing was sent.`;
    meta = computeShipMeta(norm.objectsText);
    if (meta.objectCount < 1) return "There are no objects in this file. Nothing was sent.";
    objectsText = norm.objectsText;
    check = inspectShipText(objectsText);
  }

  const version = hasFile ? (entry.version || 0) + 1 : entry.version || 0;
  const slug = `upd-${Math.random().toString(36).slice(2, 8)}-${shipId}`.slice(0, 80);
  const info = {
    name: entry.name, id: slug, updateOf: shipId, version,
    newName, renameOnly: !hasFile, photosChanged: hasPhotos, updateNote: note,
    meta: metaChanged ? { description: newDescription, youtubeUrl: newYoutube, patreonUrl: newPatreon } : null,
    submitter: entry.submitter || "", description: entry.description || "",
    patreonUrl: entry.patreonUrl || "", youtubeUrl: entry.youtubeUrl || "",
    objectCount: meta.objectCount, score: meta.score, utilities: meta.utilities,
    imageCount: hasPhotos ? images.length : 0, stagedAt: new Date().toISOString()
  };
  const packed = packPending(info, objectsText, hasPhotos ? images : []);
  if (packed.byteLength > MAX_PENDING_BYTES) return "The files are too large. Nothing was sent.";
  const label = hasFile ? `Update v${version}: ${entry.name}` : `Edit: ${entry.name}`;
  await pendingPut(env, slug, packed, {
    n: label.slice(0, 60),
    s: (entry.submitter || "").slice(0, 40),
    o: meta.objectCount,
    sc: meta.score,
    c: 0,
    k: check.slice(0, 220)
  });
  const dname = clicker.global_name || clicker.username || "unknown";
  await saveSubmissionOwner(slug, null, null, `${entry.name} (${hasFile ? "update v" + version : "edit"})`, env, clicker.id, dname, access.verified);
  await uploaderBump(env, userBanKey(clicker.id), "submitted", label);
  await env.DELETE_CODES.put(`upd:${shipId}`, slug, { expirationTtl: 14 * 86400 });

  const current = entry.version ? `v${entry.version}` : "the original version";
  const metaFields = [];
  if (newDescription !== undefined) {
    metaFields.push({ name: "New instructions", value: (newDescription || "(empty)").slice(0, 900), inline: false });
    metaFields.push({ name: "Old instructions", value: (entry.description || "(empty)").slice(0, 500), inline: false });
  }
  if (newYoutube !== undefined) {
    metaFields.push({ name: "New YouTube link", value: `${newYoutube || "(removed)"}\nWas: ${entry.youtubeUrl || "(none)"}`.slice(0, 500), inline: false });
  }
  if (newPatreon !== undefined) {
    metaFields.push({ name: "New Patreon link", value: `${newPatreon || "(removed)"}\nWas: ${entry.patreonUrl || "(none)"}`.slice(0, 500), inline: false });
  }
  const photoLine = hasPhotos ? { name: "Photos", value: `Changed - ${images.length} photo(s) in total`, inline: true } : null;
  const embed = hasFile
    ? {
        title: `UPDATE v${version} - ${entry.name}`.slice(0, 250),
        color: 0x8b5cf6,
        description: `# UPDATE - version ${version}\n**This replaces the online ship (now ${current}). Downloads stay.**`,
        fields: [
          { name: "Update of", value: `${entry.name} by ${entry.submitter || "unknown"}\n\`${shipId}\``, inline: true },
          { name: "New version", value: `v${version}`, inline: true },
          ...(newName ? [{ name: "New name", value: newName, inline: true }] : []),
          ...(photoLine ? [photoLine] : []),
          ...metaFields,
          { name: "Reason for this update (written by the builder)", value: note || "(nothing written)", inline: false },
          { name: "Objects", value: `${meta.objectCount} \u00b7 utility score ${meta.score}/10${entry.objectCount ? ` (was ${entry.objectCount})` : ""}`, inline: true },
          ...(await approvalExtraFields(slug, env, check, hasPhotos ? images.length : 0))
        ]
      }
    : {
        title: `EDIT - ${entry.name}${newName ? ` to ${newName}` : ""}`.slice(0, 250),
        color: 0x8b5cf6,
        description: "# EDIT\n**The ship file stays the same. Only the name, photos, instructions and/or links change.**",
        fields: [
          { name: "Ship", value: `${entry.name} by ${entry.submitter || "unknown"}\n\`${shipId}\``, inline: true },
          ...(newName ? [{ name: "New name", value: newName, inline: true }] : []),
          ...(photoLine ? [photoLine] : []),
          ...metaFields,
          ...(note ? [{ name: "Reason for this change (written by the builder)", value: note, inline: false }] : []),
          ...(await approvalExtraFields(slug, env, "", hasPhotos ? images.length : 0))
        ]
      };
  const posted = await postApprovalMessage(env, embed, slug, hasPhotos ? images : []);
  if (!posted) console.error("update approval message could not be posted for " + slug + " - use /pending");
  if (!hasFile) return `Your changes for "${entry.name}" were sent for approval. The current version stays online until it is approved.`;
  return `Your update for "${entry.name}" (version ${version}) was sent for approval. The current version stays online until it is approved.`;
}

async function handleUpdateCommand(interaction, env, ctx) {
  const clicker = interaction.member?.user || interaction.user;
  if (!clicker || !clicker.id) return ephemeral("Could not read your Discord account.");
  if (env.DISCORD_GUILD_ID && interaction.guild_id !== env.DISCORD_GUILD_ID) return ephemeral("This command only works in our Discord server.");
  if (env.REMOVE_CHANNEL_ID && interaction.channel_id !== env.REMOVE_CHANNEL_ID) {
    return ephemeral(`This command only works in <#${env.REMOVE_CHANNEL_ID}>.`);
  }
  if (!env.DB || !deleteCodesReady(env)) return ephemeral("Updating is not available right now. Please try again later.");
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const shipId = (opts.ship || "").toString().trim();
  const attId = (opts.file || "").toString();
  const att = attId && interaction.data.resolved && interaction.data.resolved.attachments ? interaction.data.resolved.attachments[attId] : null;
  const newName = (opts.name || "").toString();
  if (!shipId) return ephemeral("Pick one of your ships first.");
  if (!att && !newName.trim()) return ephemeral("Attach a new file, give a new name, or both.");
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        await ensureD1(env);
        content = await runUpdate(env, clicker, shipId, att, newName);
      } catch (err) {
        console.error("handleUpdateCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not send the update. Please try again in a minute.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("update reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function runRestore(env, shipId, who) {
  const disabled = await readDisabled(env);
  const rec = disabled.list.find((e) => e.id === shipId);
  if (!rec) return "That ship is not in the offline or removed list anymore.";
  const res = await enableShip(shipId, env);
  if (!res.ok) return res.text;
  const name = shipLabel(rec);
  if (rec.noticeId && env.ADMIN_CHANNEL_ID) {
    await editApprovalMessage(
      env,
      rec.noticeId,
      { embeds: [{ title: `Back online: ${name}`, color: 0x2d7a2d, fields: [{ name: "Restored by", value: who, inline: true }] }], components: [] },
      env.ADMIN_CHANNEL_ID
    );
  }
  return `"${name}" is back online.`;
}

async function handleRestoreCommand(interaction, env, ctx) {
  const gate = removeGate(interaction, env);
  if (gate) return gate;
  const clicker = interaction.member?.user || interaction.user;
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const shipId = (opts.ship || "").toString().trim();
  if (!shipId) return ephemeral("Pick a ship first.");
  const who = clicker && clicker.username ? clicker.username : "a supervisor";
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await runRestore(env, shipId, who);
      } catch (err) {
        console.error("handleRestoreCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not restore that ship - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("restore reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function runLink(env, shipIds, target, sameBuilder, overwrite, who) {
  if (!env.DELETE_CODES) return "Storage is not connected.";
  const list = await readIndexList(env);
  const picks = [];
  const seen = new Set();
  const notFound = [];
  const addPick = (e) => {
    if (e && !seen.has(e.id)) {
      seen.add(e.id);
      picks.push(e);
    }
  };
  for (const id of shipIds) {
    const e = list.find((x) => x.id === id);
    if (e) addPick(e);
    else notFound.push(id);
  }
  if (sameBuilder) {
    const names = new Set(picks.map((e) => (e.submitter || "").trim().toLowerCase()).filter(Boolean));
    for (const e of list) {
      if (names.has((e.submitter || "").trim().toLowerCase())) addPick(e);
    }
  }
  if (!picks.length) return "None of those ships are in the library list. Nothing was linked.";
  const linked = [];
  const already = [];
  const skipped = [];
  for (let i = 0; i < picks.length && i < 200; i += 10) {
    const chunk = picks.slice(i, i + 10);
    const owners = await Promise.all(chunk.map((e) => getSubmissionOwner(e.id, env)));
    for (let j = 0; j < chunk.length; j++) {
      const e = chunk[j];
      const owner = owners[j];
      const explicit = !!(owner && owner.discordId && !owner.discordFromLink);
      if (explicit && owner.discordId === target.id) {
        already.push(shipLabel(e));
        continue;
      }
      if (explicit && !overwrite) {
        skipped.push(`${shipLabel(e)} (linked to <@${owner.discordId}>)`);
        continue;
      }
      const rec = {
        ...(owner || { ipKey: null, userKey: null, label: `${e.name || e.id} by ${e.submitter || "unknown"}` }),
        discordId: target.id,
        discordName: target.name
      };
      delete rec.discordFromLink;
      await env.DELETE_CODES.put(`sub:${e.id}`, JSON.stringify(rec));
      linked.push(shipLabel(e));
    }
  }
  if (linked.length) {
    const knownName = await env.DELETE_CODES.get(`dname:${target.id}`);
    if (!knownName && target.name) await env.DELETE_CODES.put(`dname:${target.id}`, target.name);
  }
  const lines = [];
  const block = (title, arr) => {
    if (!arr.length) return;
    lines.push(`${title} (${arr.length}):`);
    for (const n of arr.slice(0, 12)) lines.push(`- ${n}`);
    if (arr.length > 12) lines.push(`...and ${arr.length - 12} more`);
  };
  lines.push(linked.length ? `Linked ${linked.length} ship(s) to <@${target.id}> (by ${who}).` : `Nothing was linked to <@${target.id}>.`);
  block("Linked", linked);
  block("Already belonged to this user", already);
  block("Skipped, already linked to someone else (use overwrite to change)", skipped);
  if (notFound.length) lines.push(`Not found in the library: ${notFound.length}`);
  return lines.join("\n").slice(0, 1900);
}

async function handleLinkCommand(interaction, env, ctx) {
  const gate = removeGate(interaction, env);
  if (gate) return gate;
  const clicker = interaction.member?.user || interaction.user;
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const shipIds = [];
  for (const key of ["ship", "ship2", "ship3", "ship4", "ship5", "ship6", "ship7", "ship8", "ship9", "ship10"]) {
    const v = (opts[key] || "").toString().trim();
    if (v && !shipIds.includes(v)) shipIds.push(v);
  }
  const userId = ((opts.user || opts.user_id || "").toString().replace(/[<@!>\s]/g, ""));
  if (!shipIds.length || !/^[0-9]{5,25}$/.test(userId)) {
    return ephemeral("Pick at least one ship and a Discord user, or paste a Discord user ID in user_id.");
  }
  const resolved = interaction.data.resolved && interaction.data.resolved.users ? interaction.data.resolved.users[userId] : null;
  const target = { id: userId, name: resolved ? (resolved.global_name || resolved.username || "").toString().slice(0, 60) : "" };
  const needsLookup = !opts.user && !resolved;
  const who = clicker && clicker.username ? clicker.username : "a supervisor";
  ctx.waitUntil(
    (async () => {
      let content = "";
      try {
        if (needsLookup) {
          const m = await fetchGuildMember(env, userId);
          if (!m.ok) {
            content = "Could not check that Discord ID right now. Please try again.";
          } else if (!m.member) {
            content = "That Discord ID is not a member of this server. Nothing was linked.";
          } else {
            const u = m.member.user || {};
            target.name = (m.member.nick || u.global_name || u.username || "").toString().slice(0, 60);
          }
        }
        if (!content) content = await runLink(env, shipIds, target, opts.same_builder === true, opts.overwrite === true, who);
      } catch (err) {
        console.error("handleLinkCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not link - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
      });
      if (!resp.ok) console.error("link reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function handleDisabledButton(interaction, env, ctx, action, id) {
  if (!isSupervisor(interaction, env)) return ephemeral("Only a supervisor can use these buttons.");
  const message = interaction.message;
  const channelId = message.channel_id || interaction.channel_id;
  const title = (message.embeds && message.embeds[0] && message.embeds[0].title) || id;
  const scheduled = /^Scheduled for deletion: /.test(title);
  const name = title.replace(/^(Offline|Scheduled for deletion): /, "");
  ctx.waitUntil(
    (async () => {
      let result;
      try {
        result = action === "enable" ? await enableShip(id, env) : await purgeDisabledShip(id, env);
      } catch (err) {
        const msg = err && err.message ? String(err.message) : String(err);
        console.error("handleDisabledButton failed: " + msg);
        result = { ok: false, text: msg.slice(0, 300) };
      }
      const okTitle = action === "enable" ? `Back online: ${name}` : `Deleted: ${name}`;
      const okColor = action === "enable" ? 0x2d7a2d : 0x8b2020;
      const embeds = (message.embeds || []).map((e, i) =>
        i === 0
          ? result.ok
            ? { ...e, color: okColor, title: okTitle }
            : { ...e, color: 0xe05555, title: `Failed, try again: ${name}`, description: `Error: ${result.text}` }
          : e
      );
      await editApprovalMessage(env, message.id, { embeds, components: result.ok ? [] : disabledComponents(id, false, scheduled) }, channelId);
    })()
  );
  return json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: { embeds: message.embeds || [], components: disabledComponents(id, true, scheduled) }
  });
}

async function handleDisableCommand(interaction, env, ctx) {
  const gate = pendingGate(interaction, env);
  if (gate) return gate;
  if (!env.ADMIN_CHANNEL_ID) return ephemeral("The supervisor channel is not set up, so nothing was taken offline.");
  const clicker = interaction.member?.user || interaction.user;
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const id = (opts.ship || "").toString().trim();
  if (!id) return ephemeral("Pick a ship first.");
  const who = clicker && clicker.username ? clicker.username : "a reviewer";
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await disableShip(id, who, env);
      } catch (err) {
        console.error("handleDisableCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not take that ship offline - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("disable reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function scanSubmissionOwners(env) {
  const out = [];
  const res = await env.DELETE_CODES.list({ prefix: "sub:" });
  const names = res.keys.map((k) => k.name).slice(0, 900);
  for (let i = 0; i < names.length; i += 25) {
    const chunk = names.slice(i, i + 25);
    const vals = await Promise.all(chunk.map((n) => env.DELETE_CODES.get(n)));
    vals.forEach((raw, j) => {
      try {
        const rec = JSON.parse(raw);
        out.push({ slug: chunk[j].slice(4), ...rec });
      } catch (e) {}
    });
  }
  const need = [...new Set(out.filter((o) => !o.discordId && o.userKey).map((o) => o.userKey))];
  const linkMap = new Map();
  for (let i = 0; i < need.length; i += 25) {
    const chunk = need.slice(i, i + 25);
    const vals = await Promise.all(chunk.map((k) => env.DELETE_CODES.get(linkKey(k))));
    vals.forEach((v, j) => {
      if (v) linkMap.set(chunk[j], v);
    });
  }
  for (const o of out) {
    if (!o.discordId && o.userKey && linkMap.has(o.userKey)) {
      o.discordId = linkMap.get(o.userKey);
      o.discordFromLink = true;
    }
  }
  return out;
}

async function buildUsersLookup(env, uopts) {
  if (!env.DELETE_CODES) return "Storage is not available.";
  const owners = await scanSubmissionOwners(env);
  let keys = [];
  if (uopts.ship) {
    const id = uopts.ship.toString().trim();
    const rec = owners.find((o) => o.slug === id);
    if (!rec) return "No submitter data is stored for this ship (older upload), so I cannot find the installation.";
    const key = rec.discordId ? userBanKey(rec.discordId) : rec.userKey || rec.ipKey;
    if (!key) return "No installation or connection is stored for this ship.";
    keys = [key];
  } else if (uopts.user) {
    const uid = uopts.user.toString().trim();
    if (!/^[0-9]{5,25}$/.test(uid)) return "Pick a Discord user.";
    keys = [userBanKey(uid)];
  } else {
    const code = (uopts.code || "").toString().trim().toLowerCase();
    if (!/^[0-9a-f]{4}$/.test(code)) return "Type the 4 characters of the installation code (digits and the letters a to f).";
    const set = new Set();
    for (const o of owners) {
      for (const k of [o.userKey, o.ipKey]) {
        if (k && k.slice(7, 11) === code) set.add(k);
      }
    }
    if (env.DB) {
      try {
        await ensureD1(env);
        const res = await env.DB.prepare("SELECT k FROM uploaders WHERE substr(k, 8, 4) = ?").bind(code).all();
        for (const r of res.results || []) set.add(r.k);
      } catch (e) {}
    }
    keys = [...set].slice(0, 3);
    if (!keys.length) return `Nothing found for code ${code}.`;
  }
  const indexIds = new Set((await readIndexList(env)).map((e) => e.id));
  let disabledMap = new Map();
  try {
    disabledMap = new Map((await readDisabled(env)).list.map((e) => [e.id, e]));
  } catch (e) {}
  const blocks = [];
  for (const key of keys) {
    const isUser = key.startsWith("ban:user:");
    const isApp = key.startsWith("ban:id:");
    const mine = owners.filter((o) => (isUser ? o.discordId === key.slice(9) : isApp ? o.userKey === key : o.ipKey === key && !o.userKey));
    let stat = null;
    if (env.DB) {
      try {
        await ensureD1(env);
        stat = await env.DB.prepare("SELECT submitted, approved, rejected FROM uploaders WHERE k = ?").bind(key).first();
      } catch (e) {}
    }
    let flag = "";
    if (await env.DELETE_CODES.get(key)) flag = " - BANNED";
    else if (isApp && (await lockSecondsLeft(env, "lock:id:" + key.slice(7))) > 0) flag = " - LOCKED";
    else if (isUser && (await lockSecondsLeft(env, "lock:user:" + key.slice(9))) > 0) flag = " - LOCKED";
    let who;
    let extra = "";
    if (isUser) {
      who = `<@${key.slice(9)}> (Discord user)`;
      const ins = [...new Set(mine.map((o) => o.userKey).filter(Boolean))].map((k) => installCode(k));
      if (ins.length) extra = `\nInstallations: ${ins.join(", ")}`;
    } else {
      who = `${installCode(key)} (${isApp ? "app" : "guest connection"})`;
      if (isApp) {
        const ld = await env.DELETE_CODES.get(linkKey(key));
        if (ld) extra = `\nDiscord: <@${ld}>`;
      }
    }
    const lines = mine.slice(0, 15).map((o) => {
      const dr = disabledMap.get(o.slug);
      const st = indexIds.has(o.slug)
        ? "online"
        : dr
          ? dr.purgeAt
            ? `removed, restorable until ${dr.purgeAt.slice(0, 10)}`
            : "offline (disabled)"
          : "waiting for approval";
      return `- ${o.label || o.slug} - ${st}`;
    });
    const counts = stat ? `Sent ${stat.submitted}, approved ${stat.approved}, rejected ${stat.rejected}` : "No upload counts yet";
    blocks.push(`${who}${flag}${extra}\n${counts}\nShips on file (${mine.length}):\n${lines.join("\n") || "- none"}`);
  }
  return blocks.join("\n\n").slice(0, 1900);
}

async function handleRegister(url, env) {
  const key = url.searchParams.get("key");
  if (!env.SETUP_KEY || key !== env.SETUP_KEY) {
    return new Response("Not authorized.", { status: 401 });
  }
  const deleteCommand = {
    name: "delete",
    description: "Admin only: remove a Corvette from the library",
    options: [
      { name: "ship", description: "Start typing a ship name or builder and pick the ship", type: 3, required: true, autocomplete: true }
    ]
  };
  const linkCommand = {
    name: "link",
    description: "Admin only: link a ship to a Discord user so that person can remove it and gets the credit",
    options: [
      { name: "ship", description: "Start typing a ship name or builder and pick the ship", type: 3, required: true, autocomplete: true },
      { name: "user", description: "The Discord user who uploaded these ships (pick from the list)", type: 6, required: false },
      { name: "user_id", description: "Or paste the Discord user ID here if you cannot find the user in the list", type: 3, required: false },
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ name: `ship${n}`, description: `Another ship to link (${n})`, type: 3, required: false, autocomplete: true })),
      { name: "same_builder", description: "Also link all other unlinked ships with the same builder name", type: 5, required: false },
      { name: "overwrite", description: "Also take over ships that were already linked to someone else", type: 5, required: false }
    ]
  };
  const updateCommand = {
    name: "update",
    description: "Send a new file and/or a new name for one of your own Corvettes for approval",
    options: [
      { name: "ship", description: "Pick one of your own ships", type: 3, required: true, autocomplete: true },
      { name: "file", description: "The new file (.nmsship, .nmsbase, .nmsprefab, .json or .txt)", type: 11, required: false },
      { name: "name", description: "A new name for the ship (optional)", type: 3, required: false, max_length: 80 }
    ]
  };
  const removeCommand = {
    name: "remove",
    description: "Remove one of your own Corvettes from the library",
    options: [
      { name: "ship", description: "Pick one of your own ships", type: 3, required: true, autocomplete: true }
    ]
  };
  const restoreCommand = {
    name: "restore",
    description: "Admin only: bring a removed or offline Corvette back online",
    options: [
      { name: "ship", description: "Pick the removed or offline ship", type: 3, required: true, autocomplete: true }
    ]
  };
  const banCommand = {
    name: "ban",
    description: "Admin only: ban the app installation of a ship's submitter from uploading and counting downloads",
    options: [
      { name: "ship", description: "Start typing a ship name or builder and pick the ship", type: 3, required: true, autocomplete: true },
      { name: "also_ip", description: "Also ban their internet connection (IP). Only for extreme cases.", type: 5, required: false }
    ]
  };
  const unbanCommand = {
    name: "unban",
    description: "Admin only: remove a ban or lock",
    options: [
      { name: "ban", description: "Pick the ban or lock to remove", type: 3, required: true, autocomplete: true }
    ]
  };
  const recalcCommand = {
    name: "recalc",
    description: "Admin only: recalculate the utility lists of ships already in the library",
    options: [
      { name: "count", description: "How many ships per run (1 to 25, default 10)", type: 4, required: false, min_value: 1, max_value: 25 }
    ]
  };
  const pendingCommand = {
    name: "pending",
    description: "Admin only: post all waiting submissions again with Approve and Reject buttons",
    options: []
  };
  const usersCommand = {
    name: "users",
    description: "Staff: list uploaders, or look up the Discord user or installation behind a ship, user or code",
    options: [
      { name: "ship", description: "Pick a ship to see its installation and all other ships from it", type: 3, required: false, autocomplete: true },
      { name: "code", description: "The 4 character installation code", type: 3, required: false, min_length: 4, max_length: 4 },
      { name: "user", description: "Pick a Discord user to see all their ships", type: 6, required: false }
    ]
  };
  const statsCommand = {
    name: "stats",
    description: "Staff: download numbers, uploads and bans for the whole library, or for one ship",
    options: [
      { name: "ship", description: "Pick a ship to see only its numbers", type: 3, required: false, autocomplete: true }
    ]
  };
  const r2CheckCommand = {
    name: "r2check",
    description: "Admin only: check that the ship files in R2 match the library",
    options: [
      { name: "ship", description: "Optional: a ship ID to see only its files", type: 3, required: false }
    ]
  };
  const r2SyncCommand = {
    name: "r2sync",
    description: "Admin only: copy ship files from GitHub to R2 where they differ or are missing",
    options: [
      { name: "count", description: "How many ships per run (1 to 14, default 10)", type: 4, required: false, min_value: 1, max_value: 14 }
    ]
  };
  const botCheckCommand = {
    name: "botcheck",
    description: "Admin only: check which rights the bot really has in the approvals and supervisor channels",
    options: []
  };
  const disableCommand = {
    name: "disable",
    description: "Take a Corvette offline for now. A supervisor can put it back online",
    options: [
      { name: "ship", description: "Start typing a ship name or builder and pick the ship", type: 3, required: true, autocomplete: true }
    ]
  };
  const resp = await discordApi(
    `/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
    env,
    { method: "PUT", body: JSON.stringify([deleteCommand, banCommand, unbanCommand, pendingCommand, recalcCommand, usersCommand, statsCommand, removeCommand, updateCommand, restoreCommand, linkCommand, disableCommand, botCheckCommand, r2CheckCommand, r2SyncCommand]) }
  );
  const text = await resp.text();
  return new Response(`Status ${resp.status}\n${text}`, {
    status: 200,
    headers: { "content-type": "text/plain" }
  });
}

function ephemeral(content) {
  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 }
  });
}

async function readIndexList(env) {
  const shards = await readIndexShards(env);
  return shards.flatMap((sh) => sh.list);
}

function shipLabel(e) {
  const by = e.submitter ? ` - by ${e.submitter}` : "";
  return `${e.name || e.id}${by}`;
}

function memberRoles(interaction) {
  return (interaction.member && interaction.member.roles) || [];
}

function isOwnerUser(interaction, env) {
  const u = interaction.member?.user || interaction.user;
  return !!u && !!env.APPROVER_USER_ID && u.id === env.APPROVER_USER_ID;
}

function isSupervisor(interaction, env) {
  if (isOwnerUser(interaction, env)) return true;
  return !!env.SUPERVISOR_ROLE_ID && memberRoles(interaction).includes(env.SUPERVISOR_ROLE_ID);
}

function isReviewer(interaction, env) {
  if (isSupervisor(interaction, env)) return true;
  return !!env.REVIEW_ROLE_ID && memberRoles(interaction).includes(env.REVIEW_ROLE_ID);
}

function adminGate(interaction, env) {
  if (!isSupervisor(interaction, env)) return ephemeral("Only a supervisor can use this command.");
  if (env.ADMIN_CHANNEL_ID && interaction.channel_id !== env.ADMIN_CHANNEL_ID) {
    return ephemeral("This command only works in the supervisor channel.");
  }
  return null;
}

function removeGate(interaction, env) {
  if (!isSupervisor(interaction, env)) return ephemeral("Only a supervisor can use this command.");
  const ch = interaction.channel_id;
  if (ch !== env.ADMIN_CHANNEL_ID && ch !== env.CHECK_CHANNEL_ID) {
    return ephemeral("This command only works in the supervisor channel or the staff channel.");
  }
  return null;
}

function pendingGate(interaction, env) {
  if (!isReviewer(interaction, env)) return ephemeral("Only Corvette reviewers can use this command.");
  const ch = interaction.channel_id;
  if (ch !== env.APPROVAL_CHANNEL_ID && ch !== env.ADMIN_CHANNEL_ID) {
    return ephemeral("This command only works in the approvals channel.");
  }
  return null;
}

async function applyTimeout(slug, env) {
  if (!env.DELETE_CODES) return "Timeout storage is not available, no timeout given.";
  const owner = await getSubmissionOwner(slug, env);
  if (!owner) return "No submitter data found, no timeout given.";
  const hasInstall = !!owner.userKey && owner.userKey.startsWith("ban:id:");
  if (!hasInstall && !owner.discordId) {
    return "No Discord user or app installation stored (guest upload), no timeout given.";
  }
  const seconds = 86400;
  const lockBody = JSON.stringify({ label: `${owner.label || "submitter"} - timeout by reviewer`, until: Date.now() + seconds * 1000, strikes: [] });
  if (owner.discordId) {
    await env.DELETE_CODES.put(`lock:user:${owner.discordId}`, lockBody, { expirationTtl: seconds + 3600 });
  }
  if (hasInstall) {
    await env.DELETE_CODES.put("lock:id:" + owner.userKey.slice(7), lockBody, { expirationTtl: seconds + 3600 });
  }
  return "Submitter got a 24 hour timeout. Use /unban to remove it.";
}

async function sendToSupervisor(env, slug, embed, clicker, note) {
  if (!env.ADMIN_CHANNEL_ID) return false;
  let images = [];
  try {
    const buf = await pendingGet(env, slug);
    if (buf) images = unpackPending(buf).images.slice(0, 3);
  } catch (e) {
    console.error("could not read images for " + slug);
  }
  const who = clicker && clicker.username ? clicker.username : "a reviewer";
  const clean = {
    title: embed.title,
    color: 0xe89a2f,
    fields: [
      ...(embed.fields || []).map((f) => ({ name: f.name, value: f.value, inline: !!f.inline })),
      { name: "Sent by", value: note ? `${who}\n${note}` : who, inline: false }
    ]
  };
  return postApprovalMessage(env, clean, slug, images, env.ADMIN_CHANNEL_ID, true);
}

async function uploaderBump(env, key, field, label) {
  if (!env.DB || !key) return;
  if (field !== "submitted" && field !== "approved" && field !== "rejected") return;
  try {
    await ensureD1(env);
    const kind = key.startsWith("ban:user:") ? "discord" : key.startsWith("ban:id:") ? "app" : "guest";
    await env.DB.prepare(
      `INSERT INTO uploaders (k, kind, label, submitted, approved, rejected, last_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET ${field} = ${field} + 1, last_at = excluded.last_at, label = CASE WHEN excluded.label = '' THEN uploaders.label ELSE excluded.label END`
    )
      .bind(key, kind, label || "", field === "submitted" ? 1 : 0, field === "approved" ? 1 : 0, field === "rejected" ? 1 : 0, Date.now())
      .run();
  } catch (err) {
    console.error("uploaderBump failed: " + (err && err.message ? err.message : String(err)));
  }
}

async function handleUsersCommand(interaction, env, ctx) {
  const gate = usersGate(interaction, env);
  if (gate) return gate;
  const uopts = {};
  for (const o of interaction.data.options || []) uopts[o.name] = o.value;
  if (uopts.ship || uopts.code || uopts.user) {
    ctx.waitUntil(
      (async () => {
        let content;
        try {
          content = await buildUsersLookup(env, uopts);
        } catch (err) {
          console.error("buildUsersLookup failed: " + (err && err.message ? err.message : String(err)));
          content = "Could not look that up - check logs.";
        }
        const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
          method: "PATCH",
          body: JSON.stringify({ content })
        });
        if (!resp.ok) console.error("users reply failed: " + resp.status + " " + (await resp.text()));
      })()
    );
    return json({ type: 5, data: { flags: 64 } });
  }
  if (!env.DB) return ephemeral("The database is not available.");
  try {
    await ensureD1(env);
    const res = await env.DB.prepare(
      "SELECT k, kind, label, submitted, approved, rejected FROM uploaders ORDER BY rejected DESC, submitted DESC LIMIT 15"
    ).all();
    const rows = res.results || [];
    if (!rows.length) return ephemeral("No uploads counted yet. Counting starts with the latest update.");
    const lines = [];
    for (const r of rows) {
      const isUserRow = r.k.startsWith("ban:user:");
      const code = isUserRow ? `<@${r.k.slice(9)}>` : r.k.slice(7, 11);
      let flag = "";
      if (env.DELETE_CODES) {
        if (await env.DELETE_CODES.get(r.k)) flag = " - BANNED";
        else if (r.kind === "app" && (await lockSecondsLeft(env, "lock:id:" + r.k.slice(7))) > 0) flag = " - LOCKED";
        else if (isUserRow && (await lockSecondsLeft(env, "lock:user:" + r.k.slice(9))) > 0) flag = " - LOCKED";
      }
      lines.push(`${code} (${r.kind}) - sent ${r.submitted}, approved ${r.approved}, rejected ${r.rejected}${flag}\n   last: ${r.label || "unknown"}`);
    }
    return ephemeral(("Uploaders, most rejected first\n" + lines.join("\n")).slice(0, 1900));
  } catch (err) {
    console.error("handleUsersCommand failed: " + (err && err.message ? err.message : String(err)));
    return ephemeral("Could not read the uploader list - check logs.");
  }
}

async function counterSum(env, kind, minUnit) {
  const like = kind === "hour" ? "cap:%" : "capd:%";
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(n), 0) AS n FROM counters WHERE k LIKE ? AND CAST(substr(k, length(rtrim(k, '0123456789')) + 1) AS INTEGER) >= ?"
  ).bind(like, minUnit).first();
  return row ? row.n : 0;
}

async function countKvKeys(env, prefix) {
  const names = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    const res = await env.DELETE_CODES.list({ prefix, cursor });
    for (const k of res.keys) names.push(k.name);
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  return names;
}

async function statsWho(env, k) {
  let did = "";
  if (k.startsWith("ban:user:")) did = k.slice(9);
  else if (k.startsWith("ban:id:") && env.DELETE_CODES) did = (await env.DELETE_CODES.get(linkKey(k))) || "";
  if (did) {
    const name = env.DELETE_CODES ? await env.DELETE_CODES.get(`dname:${did}`) : null;
    return name ? `${name} (<@${did}>)` : `<@${did}>`;
  }
  return `${installCode(k)} (${k.startsWith("ban:id:") ? "app" : "guest"})`;
}

async function buildStats(env, shipId) {
  await ensureD1(env);
  const now = Date.now();
  const hourNow = Math.floor(now / 3600000);
  const dayNow = Math.floor(now / 86400000);
  const ships = await readIndexList(env);

  if (shipId) {
    const e = ships.find((x) => x.id === shipId);
    if (!e) return { content: "That ship was not found." };
    const prefix = `capd:${shipId}:`;
    const esc = prefix.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    const sumDays = async (fromDay) => {
      const row = await env.DB.prepare(
        "SELECT COALESCE(SUM(n), 0) AS n FROM counters WHERE k LIKE ? ESCAPE '\\' AND CAST(substr(k, length(rtrim(k, '0123456789')) + 1) AS INTEGER) >= ?"
      ).bind(esc, fromDay).first();
      return row ? row.n : 0;
    };
    const owner = await getSubmissionOwner(shipId, env);
    const lines = [
      `Downloads in total: ${e.downloads || 0}`,
      `Counted today: ${await sumDays(dayNow)}`,
      `Counted last 7 days: ${await sumDays(dayNow - 6)}`,
      `Counted last 30 days: ${await sumDays(dayNow - 29)}`,
      `Online since: ${e.approvedAt ? e.approvedAt.slice(0, 10) : "unknown"}${e.disabledAt ? " (offline now)" : ""}`
    ];
    if (owner && owner.discordId) lines.push(`Uploader: <@${owner.discordId}>`);
    return { embeds: [{ title: shipLabel(e).slice(0, 200), description: lines.join("\n"), color: 0x3a6ea5 }] };
  }

  const total = ships.reduce((a, e) => a + (e.downloads || 0), 0);
  const newWeek = ships.filter((e) => e.approvedAt && now - Date.parse(e.approvedAt) <= 7 * 86400000).length;
  const d24 = await counterSum(env, "hour", hourNow - 23);
  const d7 = await counterSum(env, "day", dayNow - 6);
  const d30 = await counterSum(env, "day", dayNow - 29);

  let banText = "Not available";
  if (env.DELETE_CODES) {
    const bans = await countKvKeys(env, "ban:");
    const locks = await countKvKeys(env, "lock:");
    let activeLocks = 0;
    for (let i = 0; i < locks.length && i < 200; i += 25) {
      const vals = await Promise.all(locks.slice(i, i + 25).map((k) => env.DELETE_CODES.get(k)));
      for (const v of vals) {
        try {
          if (v && JSON.parse(v).until > now) activeLocks++;
        } catch (e) {}
      }
    }
    const byKind = (pre) => bans.filter((k) => k.startsWith(pre)).length;
    banText = `Bans: ${bans.length} (Discord ${byKind("ban:user:")}, app ${byKind("ban:id:")}, connection ${byKind("ban:ip:")})\nTimeouts running: ${activeLocks}`;
  }

  return {
    embeds: [
      {
        title: "Library stats",
        color: 0x3a6ea5,
        fields: [
          { name: "Downloads", value: `In total: ${total}\nLast 24 hours: ${d24}\nLast 7 days: ${d7}\nLast 30 days: ${d30}` },
          { name: "Ships", value: `Total ships: ${ships.length}\nNew ships this week: ${newWeek}` },
          { name: "Bans and timeouts", value: banText }
        ]
      }
    ]
  };
}

async function handleStatsCommand(interaction, env, ctx) {
  const gate = usersGate(interaction, env);
  if (gate) return gate;
  if (!env.DB) return ephemeral("The stats database is not connected.");
  const shipId = ((interaction.data.options || []).find((o) => o.name === "ship") || {}).value || "";
  ctx.waitUntil(
    (async () => {
      let body;
      try {
        body = await buildStats(env, shipId.toString());
      } catch (err) {
        console.error("buildStats failed: " + (err && err.message ? err.message : String(err)));
        body = { content: "Could not read the stats - check logs." };
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      if (!resp.ok) console.error("stats reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5 });
}

function usersAllowed(interaction, env) {
  const ch = interaction.channel_id;
  if (env.ADMIN_CHANNEL_ID && ch === env.ADMIN_CHANNEL_ID) return isSupervisor(interaction, env);
  if (env.CHECK_CHANNEL_ID && ch === env.CHECK_CHANNEL_ID) return isReviewer(interaction, env);
  return false;
}

function usersGate(interaction, env) {
  if (usersAllowed(interaction, env)) return null;
  const ch = interaction.channel_id;
  const inKnown = ch === env.ADMIN_CHANNEL_ID || ch === env.CHECK_CHANNEL_ID;
  return ephemeral(inKnown ? "You do not have the role for this command here." : "This command only works in the staff chat or the supervisor channel.");
}

const BOT_PERMS = [
  ["View Channel", 1n << 10n],
  ["Send Messages", 1n << 11n],
  ["Embed Links", 1n << 14n],
  ["Attach Files", 1n << 15n],
  ["Read Message History", 1n << 16n]
];

function explainBotPerm(bit, base, overwrites, roleIds, guildId, botId, nameOf) {
  let has = (base & bit) !== 0n;
  let why = has ? "" : "no server role gives it";
  const ev = overwrites.find((o) => o.id === guildId);
  if (ev) {
    if (BigInt(ev.deny) & bit) {
      if (has) why = "the channel rule for @everyone denies it";
      has = false;
    }
    if (BigInt(ev.allow) & bit) {
      has = true;
      why = "";
    }
  }
  const denyBy = [];
  let allowAny = false;
  for (const o of overwrites) {
    if (o.type !== 0 || o.id === guildId || !roleIds.includes(o.id)) continue;
    if (BigInt(o.deny) & bit) denyBy.push(nameOf(o.id));
    if (BigInt(o.allow) & bit) allowAny = true;
  }
  if (denyBy.length && has) {
    has = false;
    why = `a channel rule denies it for role ${denyBy.join(", ")}`;
  }
  if (allowAny) {
    has = true;
    why = "";
  }
  const mo = overwrites.find((o) => o.type === 1 && o.id === botId);
  if (mo) {
    if (BigInt(mo.deny) & bit) {
      has = false;
      why = "a channel rule for the bot itself denies it";
    }
    if (BigInt(mo.allow) & bit) {
      has = true;
      why = "";
    }
  }
  return { has, why };
}

async function buildBotCheck(env) {
  const guildId = env.DISCORD_GUILD_ID;
  const meResp = await discordApi("/users/@me", env, { method: "GET" });
  if (!meResp.ok) return `Could not read the bot account (${meResp.status}).`;
  const me = await meResp.json();
  const memResp = await discordApi(`/guilds/${guildId}/members/${me.id}`, env, { method: "GET" });
  if (!memResp.ok) return `Could not read the bot's roles (${memResp.status}).`;
  const member = await memResp.json();
  const rolesResp = await discordApi(`/guilds/${guildId}/roles`, env, { method: "GET" });
  if (!rolesResp.ok) return `Could not read the server roles (${rolesResp.status}).`;
  const roles = await rolesResp.json();
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const roleIds = member.roles || [];
  const nameOf = (id) => (rolesById.get(id) ? rolesById.get(id).name : id);
  const everyone = rolesById.get(guildId);
  let base = BigInt(everyone ? everyone.permissions : "0");
  for (const rid of roleIds) {
    const r = rolesById.get(rid);
    if (r) base |= BigInt(r.permissions);
  }
  const blocks = [`Bot roles: ${roleIds.map(nameOf).join(", ") || "none"}`];
  if (base & (1n << 3n)) {
    blocks.push("The bot has the Administrator right, so it has every right in every channel.");
    return blocks.join("\n");
  }
  const targets = [["Approvals channel", env.APPROVAL_CHANNEL_ID], ["Supervisor channel", env.ADMIN_CHANNEL_ID]];
  for (const [label, id] of targets) {
    if (!id) continue;
    const chResp = await discordApi(`/channels/${id}`, env, { method: "GET" });
    if (!chResp.ok) {
      blocks.push(`${label}: could not read it (${chResp.status}). The bot may not see this channel.`);
      continue;
    }
    const ch = await chResp.json();
    const overwrites = ch.permission_overwrites || [];
    const lines = [`${label}:`];
    for (const [pname, bit] of BOT_PERMS) {
      const r = explainBotPerm(bit, base, overwrites, roleIds, guildId, me.id, nameOf);
      lines.push(r.has ? `  OK  ${pname}` : `  MISSING  ${pname} - ${r.why}`);
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n").slice(0, 1900);
}

async function runPurgeDue(env) {
  if (storageMode(env) === "github" && !env.GITHUB_TOKEN) return;
  const d = await readDisabled(env);
  const now = Date.now();
  const due = d.list.filter((e) => e.purgeAt && Date.parse(e.purgeAt) <= now).slice(0, 3);
  for (const rec of due) {
    try {
      await deleteShipFiles(rec.id, rec, env);
      d.list = d.list.filter((e) => e.id !== rec.id);
      await writeDisabled(env, d, `Delete ${rec.id}`);
    } catch (err) {
      console.error("purge failed for " + rec.id + ": " + (err && err.message ? err.message : String(err)));
      continue;
    }
    if (rec.noticeId && env.ADMIN_CHANNEL_ID) {
      const embed = {
        title: `Deleted for good: ${rec.name || rec.id}`,
        color: 0x8b2020,
        fields: [
          { name: "Builder", value: rec.submitter || "unknown", inline: true },
          { name: "Ship ID", value: `\`${rec.id}\``, inline: true }
        ]
      };
      await editApprovalMessage(env, rec.noticeId, { embeds: [embed], components: [] }, env.ADMIN_CHANNEL_ID);
    }
  }
}

async function buildR2Check(env, shipId) {
  if (!env.SHIPS) return "R2 is not connected. The SHIPS binding is missing.";
  const files = new Map();
  let cursor;
  let objects = 0;
  let bytes = 0;
  let photoBytes = 0;
  let biggest = { key: "", size: 0 };
  for (let guard = 0; guard < 60; guard++) {
    const page = await env.SHIPS.list({ prefix: "ships/", cursor, limit: 1000 });
    for (const o of page.objects) {
      const parts = o.key.split("/");
      if (parts.length < 3) continue;
      const slug = parts[1];
      const name = parts.slice(2).join("/");
      if (!files.has(slug)) files.set(slug, new Map());
      files.get(slug).set(name, o.size);
      objects++;
      bytes += o.size;
      if (/^preview\d*\.png$/.test(name)) {
        photoBytes += o.size;
        if (o.size > biggest.size) biggest = { key: o.key, size: o.size };
      }
    }
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  if (shipId) {
    const f = files.get(shipId);
    if (!f) return `Nothing found in R2 under ships/${shipId}/`;
    const lines = [...f.entries()].map(([n, sz]) => `${n}: ${kb(sz)}`);
    return `R2 ships/${shipId}/\n${lines.join("\n")}`.slice(0, 1900);
  }

  const index = await readIndexList(env);
  const inIndex = new Set(index.map((e) => e.id));
  const missingShips = [];
  const missingFiles = [];
  for (const e of index) {
    const f = files.get(e.id);
    if (!f) {
      missingShips.push(e.id);
      continue;
    }
    if (!f.has("ship.json")) missingFiles.push(`${e.id}: ship.json`);
  }
  const extra = [...files.keys()].filter((k) => !inIndex.has(k));
  const out = [];
  out.push(`Ships in the library: ${index.length}`);
  out.push(`Ship folders in R2: ${files.size}`);
  out.push(`Files in R2: ${objects} (${mb(bytes)}), photos: ${mb(photoBytes)}`);
  if (biggest.size) out.push(`Biggest photo: ${kb(biggest.size)} (${biggest.key})`);
  out.push(missingShips.length ? `Missing in R2 (${missingShips.length}): ${missingShips.slice(0, 8).join(", ")}${missingShips.length > 8 ? " ..." : ""}` : "Missing in R2: none");
  out.push(missingFiles.length ? `Missing files (${missingFiles.length}): ${missingFiles.slice(0, 8).join(", ")}${missingFiles.length > 8 ? " ..." : ""}` : "Missing files: none");
  out.push(extra.length ? `In R2 but not in the library (${extra.length}): ${extra.slice(0, 8).join(", ")}${extra.length > 8 ? " ..." : ""}` : "In R2 but not in the library: none");
  return out.join("\n").slice(0, 1900);
}

async function handleR2CheckCommand(interaction, env, ctx) {
  const gate = adminGate(interaction, env);
  if (gate) return gate;
  const shipId = (((interaction.data.options || []).find((o) => o.name === "ship") || {}).value || "").toString().trim();
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await buildR2Check(env, shipId);
      } catch (err) {
        console.error("handleR2CheckCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not check R2 - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("r2check reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

async function buildR2Sync(env, limit) {
  if (!env.SHIPS) return "R2 is not connected. The SHIPS binding is missing.";
  if (!env.GITHUB_TOKEN) return "GitHub is not connected, so there is nothing to copy from.";
  const index = await readIndexList(env);
  let start = 0;
  if (env.DELETE_CODES) start = parseInt((await env.DELETE_CODES.get("r2sync:cursor")) || "0", 10) || 0;
  if (start >= index.length) start = 0;
  let checked = 0;
  let same = 0;
  let copied = 0;
  let failed = 0;
  let i = start;
  for (; i < index.length && checked < limit; i++) {
    const id = index[i].id;
    const key = `ships/${id}/ship.json`;
    checked++;
    try {
      const resp = await ghRequest(`/contents/${key}`, env, { method: "GET", headers: { Accept: "application/vnd.github.raw" } });
      if (!resp.ok) {
        failed++;
        continue;
      }
      const fromGit = await resp.arrayBuffer();
      const obj = await env.SHIPS.get(key);
      if (obj && sameBytes(await obj.arrayBuffer(), fromGit)) {
        same++;
        continue;
      }
      await env.SHIPS.put(key, fromGit, { httpMetadata: { contentType: "application/json" } });
      copied++;
    } catch (err) {
      failed++;
      console.error("r2sync failed for " + id + ": " + (err && err.message ? err.message : String(err)));
    }
  }
  const finished = i >= index.length;
  if (env.DELETE_CODES) await env.DELETE_CODES.put("r2sync:cursor", String(finished ? 0 : i));
  const out = [];
  out.push(`Checked ${checked} ships (${start + 1} to ${start + checked} of ${index.length})`);
  out.push(`Already the same: ${same}`);
  out.push(`Copied to R2: ${copied}`);
  out.push(`Failed: ${failed}`);
  out.push(finished ? "All ships have been checked. Run it once more to be sure nothing changed." : "Run /r2sync again for the next ships.");
  return out.join("\n");
}

async function handleR2SyncCommand(interaction, env, ctx) {
  const gate = adminGate(interaction, env);
  if (gate) return gate;
  const opt = (interaction.data.options || []).find((o) => o.name === "count");
  const limit = Math.max(1, Math.min(14, parseInt(opt && opt.value, 10) || 10));
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await buildR2Sync(env, limit);
      } catch (err) {
        console.error("handleR2SyncCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not sync R2 - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("r2sync reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function handleBotCheckCommand(interaction, env, ctx) {
  const gate = adminGate(interaction, env);
  if (gate) return gate;
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await buildBotCheck(env);
      } catch (err) {
        console.error("handleBotCheckCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not check the bot rights - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("botcheck reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function handleAutocomplete(interaction, env) {
  const empty = json({ type: 8, data: { choices: [] } });
  const clicker = interaction.member?.user || interaction.user;
  const cmdName = interaction.data.name;
  if (!["delete", "ban", "unban", "disable", "users", "stats", "remove", "update", "restore", "link"].includes(cmdName)) return empty;
  const allowed = cmdName === "remove" || cmdName === "update" ? true : cmdName === "disable" ? isReviewer(interaction, env) : cmdName === "users" || cmdName === "stats" ? usersAllowed(interaction, env) : isSupervisor(interaction, env);
  if (!clicker || !allowed) return empty;

  const focused = (interaction.data.options || []).find((o) => o.focused);
  if (!focused) return empty;
  const q = (focused.value || "").toString().trim().toLowerCase();

  if (cmdName === "remove" || cmdName === "update") {
    if (focused.name !== "ship" || !clicker.id) return empty;
    try {
      return json({ type: 8, data: { choices: await myShipChoices(env, clicker.id, q) } });
    } catch (err) {
      console.error("remove autocomplete failed: " + (err && err.message ? err.message : String(err)));
      return empty;
    }
  }

  if (cmdName === "restore") {
    if (focused.name !== "ship") return empty;
    try {
      const d = await readDisabled(env);
      const choices = d.list
        .filter((e) => !q || (e.name || "").toLowerCase().includes(q) || (e.submitter || "").toLowerCase().includes(q) || (e.id || "").toLowerCase().includes(q))
        .slice(0, 25)
        .map((e) => ({
          name: `${shipLabel(e)}${e.purgeAt ? ` - removed until ${e.purgeAt.slice(0, 10)}` : " - offline"}`.slice(0, 100),
          value: e.id
        }));
      return json({ type: 8, data: { choices } });
    } catch (err) {
      console.error("restore autocomplete failed: " + (err && err.message ? err.message : String(err)));
      return empty;
    }
  }

  if (cmdName === "unban") {
    if (focused.name !== "ban" || !env.DELETE_CODES) return empty;
    try {
      const banRes = await env.DELETE_CODES.list({ prefix: "ban:" });
      const lockRes = await env.DELETE_CODES.list({ prefix: "lock:" });
      const keys = [...banRes.keys.map((k) => k.name), ...lockRes.keys.map((k) => k.name)].slice(0, 50);
      const choices = [];
      for (const name of keys) {
        const raw = await env.DELETE_CODES.get(name);
        let label = name;
        try {
          const rec = JSON.parse(raw);
          if (name.startsWith("lock:")) {
            const left = Math.max(0, Math.ceil((rec.until - Date.now()) / 60000));
            label = `LOCK ${left} min - ${rec.label || name}`;
          } else {
            label = `BAN - ${rec.label || "ban"} (${name.split(":")[1]})`;
          }
        } catch (e) {}
        if (!q || label.toLowerCase().includes(q)) choices.push({ name: label.slice(0, 100), value: name });
        if (choices.length >= 25) break;
      }
      return json({ type: 8, data: { choices } });
    } catch (err) {
      console.error("unban autocomplete failed: " + (err && err.message ? err.message : String(err)));
      return empty;
    }
  }

  const isShipField = focused.name === "ship" || (cmdName === "link" && /^ship([2-9]|10)$/.test(focused.name));
  if (!isShipField) return empty;

  try {
    let list = await readIndexList(env);
    if (cmdName === "ban" || cmdName === "users") {
      try {
        const off = await readDisabled(env);
        const seen = new Set(list.map((e) => e.id));
        list = [...list, ...off.list.filter((e) => !seen.has(e.id)).map((e) => ({ ...e, offline: true }))];
      } catch (e) {
        console.error("autocomplete could not read the offline list");
      }
    }
    const exclude = new Set();
    if (cmdName === "link") {
      for (const o of interaction.data.options || []) {
        if (!o.focused && /^ship([2-9]|10)?$/.test(o.name) && o.value) exclude.add(o.value.toString());
      }
      try {
        const owners = await scanSubmissionOwners(env);
        for (const o of owners) {
          if (o.discordId && !o.discordFromLink) exclude.add(o.slug);
        }
      } catch (e) {
        console.error("link autocomplete owner scan failed");
      }
    }
    const matches = list
      .filter((e) => !exclude.has(e.id))
      .filter((e) => {
        if (!q) return true;
        return (e.name || "").toLowerCase().includes(q) ||
          (e.submitter || "").toLowerCase().includes(q) ||
          (e.id || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (cmdName === "ban" && !!a.offline !== !!b.offline) return a.offline ? -1 : 1;
        if (cmdName !== "link") return (b.approvedAt || "").localeCompare(a.approvedAt || "");
        if (q) {
          const as = (a.name || "").toLowerCase().startsWith(q) ? 0 : 1;
          const bs = (b.name || "").toLowerCase().startsWith(q) ? 0 : 1;
          if (as !== bs) return as - bs;
        }
        return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
      })
      .slice(0, 25)
      .map((e) => ({ name: (shipLabel(e) + (e.offline ? " (offline)" : "")).slice(0, 100), value: e.id }));
    return json({ type: 8, data: { choices: matches } });
  } catch (err) {
    console.error("handleAutocomplete failed: " + (err && err.message ? err.message : String(err)));
    return empty;
  }
}

async function runDelete(query, env, who) {
  const list = await readIndexList(env);

  let target = list.find((e) => e.id === query);
  if (!target) {
    const matches = list.filter((e) => (e.name || "").toLowerCase().includes(query.toLowerCase()));
    if (matches.length === 0) return `No ship matches "${query}".`;
    if (matches.length > 1) {
      const list_text = matches.slice(0, 15).map((m) => `${shipLabel(m)} - \`${m.id}\``).join("\n");
      return `Multiple matches. Run /delete again and pick one from the list:\n${list_text}`;
    }
    target = matches[0];
  }

  const purgeAtMs = Date.now() + PURGE_DAYS * 86400000;
  const res = await takeOffline(target.id, who, env, purgeAtMs);
  if (!res.ok) return res.text;
  const when = new Date(purgeAtMs).toISOString().slice(0, 10);
  return `Removed "${res.name}" by ${target.submitter || "unknown"} (${target.id}) from the library. It is deleted for good on ${when}. Until then you can restore it from the supervisor channel.` +
    (res.noticeOk ? "" : " The message in the supervisor channel could not be posted, check the bot's permissions there.");
}

async function handleDeleteCommand(interaction, env, ctx) {
  const clicker = interaction.member?.user || interaction.user;
  const gate = removeGate(interaction, env);
  if (gate) return gate;

  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const query = (opts.ship || "").toString().trim();
  if (!query) return ephemeral("Pick a ship first.");

  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await runDelete(query, env, clicker && clicker.username ? clicker.username : "a supervisor");
      } catch (err) {
        console.error("handleDeleteCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not delete that ship - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) {
        console.error("delete reply failed: " + resp.status + " " + (await resp.text()));
      }
    })()
  );

  return json({ type: 5, data: { flags: 64 } });
}

async function handleBanCommand(interaction, env) {
  const clicker = interaction.member?.user || interaction.user;
  const gate = adminGate(interaction, env);
  if (gate) return gate;
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const id = (opts.ship || "").toString().trim();
  if (!id) return ephemeral("Pick a ship first.");
  const owner = await getSubmissionOwner(id, env);
  if (!owner) return ephemeral("No submitter data is stored for this ship (older upload or not picked from the list). Nobody was banned.");
  const parts = [];
  if (owner.discordId) {
    await addBan(env, userBanKey(owner.discordId), owner.label, "banned by admin");
    parts.push("Discord user");
  }
  if (owner.userKey) {
    await addBan(env, owner.userKey, owner.label, "banned by admin");
    parts.push("app installation");
  }
  let banIpKey = null;
  if (opts.also_ip === true) {
    if (owner.ipKey) {
      await addBan(env, owner.ipKey, owner.label, "banned by admin (IP)");
      parts.push("internet connection (IP)");
      banIpKey = owner.ipKey;
    }
  }
  if (!parts.length) {
    return ephemeral("No Discord user or app installation was stored for this ship (guest upload or older upload), so nobody was banned. Run /ban again with also_ip set to true if you want to ban the connection.");
  }
  await notifyAdmin(env, `Ban by ${clicker && clicker.username ? clicker.username : "a supervisor"}: **${owner.label}**${owner.discordId ? ` <@${owner.discordId}>` : ""} - banned: ${parts.join(" + ")}.${ipHint(banIpKey)}`);
  return ephemeral(`Banned the submitter of "${owner.label}" (${parts.join(" + ")}). They can no longer upload, open the library or count downloads. Use /unban to undo.`);
}

async function handleUnbanCommand(interaction, env) {
  const clicker = interaction.member?.user || interaction.user;
  const gate = adminGate(interaction, env);
  if (gate) return gate;
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const key = (opts.ban || "").toString().trim();
  if (!(key.startsWith("ban:") || key.startsWith("lock:")) || !env.DELETE_CODES) return ephemeral("Pick a ban or lock from the list.");
  const raw = await env.DELETE_CODES.get(key);
  let unbanLabel = "";
  if (raw) {
    try {
      const rec = JSON.parse(raw);
      unbanLabel = rec.label || "";
      for (const sk of rec.strikes || []) await env.DELETE_CODES.delete(sk);
    } catch (e) {}
  }
  await env.DELETE_CODES.delete(key);
  await notifyAdmin(env, `${key.startsWith("lock:") ? "Lock" : "Ban"} removed by ${clicker && clicker.username ? clicker.username : "a supervisor"}: ${unbanLabel || key.split(":").slice(0, 2).join(":")}.`);
  return ephemeral(key.startsWith("lock:") ? "Lock removed. The visitor starts fresh." : "Ban removed. The visitor starts fresh.");
}

async function handlePendingCommand(interaction, env, ctx) {
  const clicker = interaction.member?.user || interaction.user;
  const gate = pendingGate(interaction, env);
  if (gate) return gate;
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        let posted = 0;
        let found = 0;
        for (const item of await pendingList(env)) {
          const slug = item.slug;
          const md = item.md || {};
          found++;
          let imgList = [];
          let imageCount = 1;
          try {
            const buf = await pendingGet(env, slug);
            if (buf) {
              const imgs = unpackPending(buf).images;
              imgList = imgs.slice(0, 3);
              imageCount = imgs.length;
            }
          } catch (e) {
            console.error("could not read image for " + slug);
          }
          const embed = {
            title: md.n || slug,
            color: 0x5b9bd5,
            fields: [
              { name: "Submitted by", value: md.s || "unknown", inline: true },
              { name: "Objects", value: `${md.o} \u00b7 utility score ${md.sc}/10`, inline: true },
              ...(await approvalExtraFields(slug, env, md.k, imageCount))
            ]
          };
          if (await postApprovalMessage(env, embed, slug, imgList)) posted++;
        }
        const dirResp = await ghRequest(`/contents/pending`, env, { method: "GET" });
        if (dirResp.ok) {
          const dirs = (await dirResp.json()).filter((e) => e.type === "dir").slice(0, 10);
          const branch = env.GITHUB_BRANCH || "main";
          for (const d of dirs) {
            const infoResp = await ghRequest(`/contents/pending/${d.name}/info.json`, env, { method: "GET" });
            if (!infoResp.ok) continue;
            const info = JSON.parse(decodeBase64Utf8((await infoResp.json()).content));
            found++;
            const embed = {
              title: info.name || d.name,
              color: 0x5b9bd5,
              image: { url: `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${branch}/pending/${d.name}/preview.png` },
              fields: [
                { name: "Submitted by", value: info.submitter || "unknown", inline: true },
                { name: "Objects", value: `${info.objectCount} \u00b7 utility score ${info.score}/10`, inline: true },
              ]
            };
            if (await postApprovalMessage(env, embed, d.name)) posted++;
          }
        }
        content = found === 0
          ? "No pending submissions."
          : `Posted ${posted} of ${found} pending submission(s) again. If an older message for the same ship still has buttons, ignore it.` +
            (lastApprovalError ? `\nProblem: ${lastApprovalError}` : "");
      } catch (err) {
        console.error("handlePendingCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "Could not list pending submissions - check logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("pending reply failed: " + resp.status + " " + (await resp.text()));
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function recalcBatch(env, limit) {
  await ensureCatalog(env, true);
  const shards = await readIndexShards(env);
  let done = 0;
  let remaining = 0;
  let failed = 0;
  for (const sh of shards) {
    let changed = false;
    for (const e of sh.list) {
      if ((e.utilVersion || 0) >= utilCatalogVersion()) continue;
      if (done + failed >= limit) {
        remaining++;
        continue;
      }
      try {
        const shipRead = await storageReadText(env, `ships/${e.id}/ship.json`);
        if (!shipRead) throw new Error("ship.json not found");
        const ids = idsFromShipText(shipRead.text);
        const result = scoreShip(ids);
        e.score = result.score;
        e.utilities = result.utilities;
        e.utilVersion = utilCatalogVersion();
        changed = true;
        done++;
      } catch (err) {
        failed++;
        remaining++;
        console.error("recalc failed for " + e.id + ": " + (err && err.message ? err.message : String(err)));
      }
    }
    if (changed) await writeShard(env, sh, "Recalculate utilities");
  }
  return { done, remaining, failed };
}

async function handleRecalcCommand(interaction, env, ctx) {
  const clicker = interaction.member?.user || interaction.user;
  const gate = adminGate(interaction, env);
  if (gate) return gate;
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const limit = Math.max(1, Math.min(25, parseInt(opts.count, 10) || 10));
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        const r = await recalcBatch(env, limit);
        if (r.done === 0 && r.remaining === 0) content = "All ships are already up to date. Nothing to do.";
        else if (r.remaining === 0) content = `Done. ${r.done} ship(s) updated. All ships are now up to date.`;
        else content = `${r.done} ship(s) updated. ${r.remaining} still to do${r.failed ? ` (${r.failed} could not be read)` : ""}. Run /recalc again to continue.`;
      } catch (err) {
        console.error("handleRecalcCommand failed: " + (err && err.message ? err.message : String(err)));
        content = "The recalculation failed. Check the logs.";
      }
      const resp = await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, env, {
        method: "PATCH",
        body: JSON.stringify({ content })
      });
      if (!resp.ok) console.error("recalc reply failed: " + resp.status);
    })()
  );
  return json({ type: 5, data: { flags: 64 } });
}

async function handleCommand(interaction, env, ctx) {
  if (interaction.data.name === "recalc") return handleRecalcCommand(interaction, env, ctx);
  if (interaction.data.name === "botcheck") return handleBotCheckCommand(interaction, env, ctx);
  if (interaction.data.name === "r2check") return handleR2CheckCommand(interaction, env, ctx);
  if (interaction.data.name === "r2sync") return handleR2SyncCommand(interaction, env, ctx);
  if (interaction.data.name === "disable") return handleDisableCommand(interaction, env, ctx);
  if (interaction.data.name === "users") return handleUsersCommand(interaction, env, ctx);
  if (interaction.data.name === "stats") return handleStatsCommand(interaction, env, ctx);
  if (interaction.data.name === "remove") return handleRemoveCommand(interaction, env, ctx);
  if (interaction.data.name === "update") return handleUpdateCommand(interaction, env, ctx);
  if (interaction.data.name === "restore") return handleRestoreCommand(interaction, env, ctx);
  if (interaction.data.name === "link") return handleLinkCommand(interaction, env, ctx);
  if (interaction.data.name === "ban") return handleBanCommand(interaction, env);
  if (interaction.data.name === "unban") return handleUnbanCommand(interaction, env);
  if (interaction.data.name === "pending") return handlePendingCommand(interaction, env, ctx);
  if (interaction.data.name === "delete") {
    return handleDeleteCommand(interaction, env, ctx);
  }
  if (interaction.data.name === "submit") {
    return ephemeral("Uploading Corvettes now works only from the Optimizer app. Open the Community Library tab and press Upload Corvette.");
  }
  return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: "Unknown command.", flags: 64 } });
}

async function handleComponent(interaction, env, ctx) {
  const customId = interaction.data.custom_id;
  const clicker = interaction.member?.user || interaction.user;
  console.log(JSON.stringify({ event: "button", customId, user: clicker && clicker.username, channel: interaction.channel_id }));
  const [rawAction, slug] = customId.split(":");
  const isModalSubmit = interaction.type === 5;
  const action = rawAction === "rejmodal" ? "reject" : rawAction;
  let rejectReason = "";
  if (isModalSubmit) {
    const rows = interaction.data.components || [];
    for (const row of rows) {
      for (const c of row.components || []) {
        if (c.custom_id === "reason") rejectReason = (c.value || "").trim().slice(0, 500);
      }
    }
  }
  if ((action === "enable" || action === "purge") && slug) return handleDisabledButton(interaction, env, ctx, action, slug);
  if (action === "cdel" && slug) return handleCommentDeleteButton(interaction, env, slug);
  const isFinal = action === "reject" || action === "rejban";

  if (!clicker || !(isFinal ? isSupervisor(interaction, env) : isReviewer(interaction, env))) {
    return ephemeral(isFinal ? "Only a supervisor can reject submissions." : "Only Corvette reviewers can use these buttons.");
  }

  if (action === "reject" && !isModalSubmit && slug) {
    return json({
      type: 9,
      data: {
        custom_id: `rejmodal:${slug}`,
        title: "Reject Corvette",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "reason",
                label: "Reason (optional, the user can see this)",
                style: 2,
                required: false,
                max_length: 500,
                placeholder: "Why is this Corvette rejected?"
              }
            ]
          }
        ]
      }
    });
  }

  const message = interaction.message;
  const embed = message.embeds?.[0];
  if (!embed) {
    console.log(JSON.stringify({ event: "button-no-embed", customId }));
    return ephemeral("This message has no submission data anymore.");
  }

  if (!slug) {
    console.log(JSON.stringify({ event: "button-no-slug", customId }));
    return ephemeral("This button has no submission id. Please tell the developer.");
  }

  const channelId = message.channel_id || interaction.channel_id;
  const supervisorMode = !!env.ADMIN_CHANNEL_ID && channelId === env.ADMIN_CHANNEL_ID;
  const comps = (disabled) => approvalComponents(slug, disabled, supervisorMode);
  const retitle = (title, color) =>
    message.embeds.map((e, i) => (i === 0 ? { ...e, title, ...(color !== undefined ? { color } : {}) } : e));

  if (action === "tosup" || action === "timeout") {
    ctx.waitUntil(
      (async () => {
        let note = "";
        if (action === "timeout") {
          note = await applyTimeout(slug, env);
          if (note.startsWith("Submitter got")) {
            const ow = await getSubmissionOwner(slug, env);
            await notifyAdmin(env, `Timeout 24h by ${clicker && clicker.username ? clicker.username : "a reviewer"}: **${ow && ow.label ? ow.label : embed.title}**${ow && ow.discordId ? ` <@${ow.discordId}>` : ""}.`);
          }
        }
        const sent = await sendToSupervisor(env, slug, embed, clicker, note);
        const label = action === "timeout" ? "Timeout given, sent to supervisor" : "Sent to supervisor";
        const payload = sent
          ? { embeds: retitle(`${label} - ${embed.title}`, 0xe89a2f), components: [] }
          : { embeds: retitle(`Could not send to supervisor - try again - ${embed.title}`, 0xe05555), components: comps(false) };
        await editApprovalMessage(env, message.id, payload, channelId);
      })()
    );
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: retitle(`Sending to supervisor - ${embed.title}`), components: comps(true) }
    });
  }

  if (action === "reject" || action === "rejban") {
    ctx.waitUntil(
      (async () => {
        const ownerRec = await getSubmissionOwner(slug, env);
        let banNote = "";
        if (action === "rejban") {
          const owner = await getSubmissionOwner(slug, env);
          if (owner) {
            if (owner.discordId) {
              await addBan(env, userBanKey(owner.discordId), owner.label, "rejected and banned");
            }
            if (owner.userKey) {
              await addBan(env, owner.userKey, owner.label, "rejected and banned");
              banNote = owner.discordId ? " and banned (Discord user + app installation)" : " and banned (app installation)";
            } else if (owner.discordId) {
              banNote = " and banned (Discord user)";
            } else if (owner.ipKey) {
              await addBan(env, owner.ipKey, owner.label, "rejected and banned (IP)");
              banNote = " and banned (connection IP)";
            } else {
              banNote = " (no app installation or IP stored, nobody banned)";
            }
          } else {
            banNote = " (no submitter data found, nobody banned)";
          }
        }
        const result = await rejectPending(slug, env);
        if (result.ok && action === "rejban" && banNote.startsWith(" and banned")) {
          const rbIp = banNote.includes("connection IP") && ownerRec ? ownerRec.ipKey : null;
          await notifyAdmin(env, `Reject and ban by ${clicker && clicker.username ? clicker.username : "a supervisor"}: **${embed.title}**${ownerRec && ownerRec.discordId ? ` <@${ownerRec.discordId}>` : ""} - banned${banNote.slice(11)}.${ipHint(rbIp)}`);
        }
        if (result.ok && ownerRec) await uploaderBump(env, ownerStatKey(ownerRec), "rejected", "");
        if (result.ok && action === "reject" && ownerRec && ownerRec.discordId && env.DELETE_CODES) {
          try {
            await env.DELETE_CODES.put(
              `rej:${ownerRec.discordId}:${slug}`,
              JSON.stringify({ title: String(embed.title || slug).slice(0, 200), reason: rejectReason, at: new Date().toISOString() }),
              { expirationTtl: 7 * 24 * 60 * 60 }
            );
          } catch (e) {
            console.error("save rejection note failed: " + (e && e.message ? e.message : String(e)));
          }
        }
        const payload = result.ok
          ? { embeds: retitle(`Rejected${banNote} - ${embed.title}`, 0x8b2020), components: [] }
          : {
              embeds: message.embeds.map((e, i) => (i === 0 ? { ...e, color: 0xe89a2f, title: `Reject failed - try again - ${embed.title}`, description: `Error: ${result.error}` } : e)),
              components: comps(false)
            };
        await editApprovalMessage(env, message.id, payload, channelId);
      })()
    );
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: retitle(`Rejecting - ${embed.title}`), components: comps(true) }
    });
  }

  if (action === "approve") {
    ctx.waitUntil(
      (async () => {
        let ownerRec = null;
        let result;
        try {
          ownerRec = await getSubmissionOwner(slug, env);
          result = await promotePendingToLibraryTry(slug, env);
          if (result.ok && ownerRec) await uploaderBump(env, ownerStatKey(ownerRec), "approved", "");
        } catch (err) {
          const em = err && err.message ? String(err.message) : String(err);
          console.error("approve crashed: " + em);
          result = { ok: false, error: em.slice(0, 180) };
        }
        console.log(JSON.stringify({ event: "approve-result", slug, ok: result.ok, error: result.error || "" }));
        const payload = result.ok
          ? { embeds: retitle(`Approved - ${embed.title}`, 0x2d7a2d), components: [] }
          : {
              embeds: message.embeds.map((e, i) => (i === 0 ? { ...e, color: 0xe05555, title: `Approve failed - try again - ${embed.title}`, description: `Error: ${result.error}` } : e)),
              components: comps(false)
            };
        await editApprovalMessage(env, message.id, payload, channelId);
      })()
    );
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: retitle(`Publishing - ${embed.title}`), components: comps(true) }
    });
  }

  console.log(JSON.stringify({ event: "button-unknown", customId }));
  return ephemeral(`Unknown button: ${rawAction}`);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runPurgeDue(env).catch((err) => console.error("runPurgeDue failed: " + (err && err.message ? err.message : String(err))))
    );
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    workerOrigin = url.origin;

    const fgIp = request.headers.get("CF-Connecting-IP") || "unknown";
    if (url.pathname !== "/" && fgIp !== "unknown" && deleteCodesReady(env) && !request.headers.get("x-signature-ed25519")) {
      const blockedResp = await frontGate(env, fgIp);
      if (blockedResp) return blockedResp;
      if (request.method === "POST" && IP_GATED_PATHS.has(url.pathname)) {
        if (await isBanned(env, [await ipBanKey(fgIp, env)])) {
          return json({ ok: false, banned: true, error: BLOCKED_MESSAGE }, 403);
        }
      }
    }

    if (request.method === "POST") await ensureCatalog(env);

    if (request.method === "GET") {
      if (url.pathname.startsWith("/img/")) return handlePendingImage(url, env);
      if (url.pathname.startsWith("/ship/")) return handlePendingShip(url, env);
      if (url.pathname === "/register") return handleRegister(url, env);
      if (url.pathname === "/upload") return new Response("Bulk upload now works inside the Optimizer app. Open the Community Library tab, press Upload Corvette to library and then Private Bulk Upload.", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
      if (url.pathname === "/human") return handleHumanPage(url, env);
      if (url.pathname === "/human-status") return handleHumanStatus(url, env);
      if (url.pathname === "/uploader-name") return handleUploaderName(url, env);
      if (url.pathname === "/discord-login") return handleDiscordLogin(url, env);
      if (url.pathname === "/discord-callback") return handleDiscordCallback(url, env);
      if (url.pathname === "/discord-status") return handleDiscordStatus(url, env);
      if (url.pathname === "/comment-counts") return handleCommentCounts(request, env);
      if (url.pathname.startsWith("/lib/")) return handleLibFile(request, env, url);
      return new Response("Corvette Library bot is running.", { status: 200 });
    }

    if (request.method === "POST") {
      if (url.pathname === "/upload-app") return handleAppUpload(request, env, ctx);
      if (url.pathname === "/upload-app-login") return handleAppBatchLogin(request, env);
      if (url.pathname === "/upload-app-batch") return handleAppBatchUpload(request, env, ctx);
      if (url.pathname === "/human-start") return handleHumanStart(request, env);
      if (url.pathname === "/discord-start") return handleDiscordStart(request, env);
      if (url.pathname === "/my-ships") return handleMyShips(request, env);
      if (url.pathname === "/my-remove") return handleMyRemove(request, env);
      if (url.pathname === "/my-dismiss") return handleMyDismiss(request, env);
      if (url.pathname === "/comment-counts") return handleCommentCounts(request, env);
      if (url.pathname === "/comments-list") return handleCommentsList(request, env);
      if (url.pathname === "/comment-post") return handleCommentPost(request, env, ctx);
      if (url.pathname === "/comments-unread") return handleCommentsUnread(request, env);
      if (url.pathname === "/comments-read") return handleCommentsRead(request, env);
      if (url.pathname === "/my-update") return handleMyUpdate(request, env);
      if (url.pathname === "/staff-pending") return handleStaffPending(request, env);
      if (url.pathname === "/staff-ship") return handleStaffShip(request, env);
      if (url.pathname === "/human") return handleHumanVerify(request, env);
      if (url.pathname === "/download-request") return handleDownloadRequest(request, env, ctx);
      if (url.pathname === "/library-access") return handleLibraryAccess(request, env);

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
      if (interaction.type === 4) {
        return handleAutocomplete(interaction, env);
      }
      if (interaction.type === InteractionType.MESSAGE_COMPONENT || interaction.type === 5) {
        return handleComponent(interaction, env, ctx);
      }

      return json({ type: InteractionResponseType.PONG });
    }

    return new Response("Not found", { status: 404 });
  }
};
