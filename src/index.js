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
  const isYouTube = host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" ||
    host === "youtu.be" || host === "www.youtu.be";
  if (kind === "youtube" && !isYouTube) {
    return { ok: false, error: "the YouTube link must be a youtube.com or youtu.be link" };
  }
  if (kind === "patreon" && !isPatreon) {
    return { ok: false, error: "the Patreon link must be a patreon.com link" };
  }
  if (parsed.protocol !== "https:" || (!isPatreon && !isYouTube)) {
    return { ok: false, error: "the link must be a patreon.com or YouTube link" };
  }
  if (isYouTube && (parsed.pathname === "/" || parsed.pathname === "")) {
    return { ok: false, error: "the YouTube link must point to a video, playlist or channel" };
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
  if (youtubeUrl) f.push({ name: "YouTube", value: youtubeUrl.slice(0, 200), inline: false });
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

async function saveSubmissionOwner(slug, ipKey, userKey, label, env) {
  if (!env.DELETE_CODES || (!ipKey && !userKey)) return;
  await env.DELETE_CODES.put(`sub:${slug}`, JSON.stringify({ ipKey: ipKey || null, userKey: userKey || null, label }));
}

async function getSubmissionOwner(slug, env) {
  if (!env.DELETE_CODES) return null;
  const raw = await env.DELETE_CODES.get(`sub:${slug}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function approvalComponents(slug, disabled) {
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

function imageExt(type) {
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return "jpg";
}

let lastApprovalError = "";

async function postApprovalMessage(env, embed, slug, image) {
  lastApprovalError = "";
  const bytes = image ? new Uint8Array(image) : null;
  const type = bytes ? sniffImageType(bytes) : null;
  const filename = bytes ? `preview.${imageExt(type)}` : null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const withImage = !!bytes && attempt < 3;
    try {
      let resp;
      if (withImage) {
        const form = new FormData();
        form.append(
          "payload_json",
          JSON.stringify({
            embeds: [{ ...embed, image: { url: `attachment://${filename}` } }],
            components: approvalComponents(slug, false),
            attachments: [{ id: 0, filename }]
          })
        );
        form.append("files[0]", new Blob([bytes], { type }), filename);
        resp = await fetch(`https://discord.com/api/v10/channels/${env.APPROVAL_CHANNEL_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
          body: form
        });
      } else {
        let outEmbed = embed;
        if (bytes) {
          const fb = await pendingImageUrl(slug, env, 0);
          outEmbed = {
            ...embed,
            ...(fb ? { image: { url: fb } } : {}),
            fields: [
              ...(embed.fields || []),
              { name: "Image note", value: "The photo could not be attached. Use the Images links above to check it before you approve.", inline: false }
            ]
          };
        }
        resp = await discordApi(`/channels/${env.APPROVAL_CHANNEL_ID}/messages`, env, {
          method: "POST",
          body: JSON.stringify({ embeds: [outEmbed], components: approvalComponents(slug, false) })
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

async function editApprovalMessage(env, messageId, payload) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await discordApi(`/channels/${env.APPROVAL_CHANNEL_ID}/messages/${messageId}`, env, {
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

async function readShard(env, n) {
  const resp = await ghRequest(`/contents/${shardPath(n)}`, env, { method: "GET", headers: { Accept: OBJECT_ACCEPT } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Could not read ${shardPath(n)}: ${resp.status}`);
  const data = await resp.json();
  let list = [];
  try {
    list = JSON.parse(decodeBase64Utf8(data.content));
    if (!Array.isArray(list)) list = [];
  } catch (e) {
    list = [];
  }
  return { n, path: shardPath(n), sha: data.sha, list };
}

async function writeShard(env, sh, message) {
  const body = { message, content: utf8ToBase64(JSON.stringify(sh.list, null, 2)) };
  if (sh.sha) body.sha = sh.sha;
  const resp = await ghRequest(`/contents/${sh.path}`, env, { method: "PUT", body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`${sh.path} update failed: ${resp.status} ${await resp.text()}`);
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

async function putFile(path, contentB64, message, env) {
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

const DELETE_CODE_RE = /^[0-9]{6}$/;

function normalizeDeleteCode(raw) {
  return (raw || "").toString().trim();
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

async function storeDeleteCode(slug, code, env) {
  const h = await hashDeleteCode(slug, code, env);
  await env.DELETE_CODES.put(`code:${slug}`, JSON.stringify({ h, at: new Date().toISOString() }));
}

async function getStoredDeleteCode(slug, env) {
  if (!env.DELETE_CODES) return null;
  const raw = await env.DELETE_CODES.get(`code:${slug}`);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    return rec && rec.h ? rec : null;
  } catch (e) {
    return null;
  }
}

async function verifyDeleteCode(slug, code, env) {
  const rec = await getStoredDeleteCode(slug, env);
  if (!rec) return false;
  const h = await hashDeleteCode(slug, code, env);
  return safeEqualHex(h, rec.h);
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

async function pendingList(env) {
  const out = [];
  if (env.DB) {
    await ensureD1(env);
    const res = await env.DB.prepare("SELECT slug, meta FROM pending WHERE part = 0 LIMIT 10").all();
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
    for (const k of res.keys.slice(0, 10)) out.push({ slug: k.name.slice(5), md: k.metadata || {} });
  }
  return out.slice(0, 10);
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
        if (typeof e[k] !== "string" || !/^[A-Za-z0-9+/=\s]*$/.test(e[k])) {
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

async function approvalExtraFields(slug, env, check, imageCount) {
  const fields = [];
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

async function stageSubmission({ name, submitter, description, patreonUrl, youtubeUrl, shipBytes, imageBufs, deleteCode, ipKey, userKey }, env) {
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
    c: deleteCode ? 1 : 0,
    k: check.slice(0, 220)
  });

  if (deleteCode) await storeDeleteCode(slug, deleteCode, env);
  await saveSubmissionOwner(slug, ipKey, userKey, `${name} by ${submitter || "unknown"}`, env);

  return { ok: true, slug, meta, hasDeleteCode: !!deleteCode, check };
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
  const buf = await pendingGet(env, slug);
  if (!buf) return promoteLegacyPending(slug, env);
  const { info: stagedInfo, shipBytes, images } = unpackPending(buf);
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
  return stagedInfo.name;
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
      return new Response("Uploads from this connection are blocked.", { status: 403 });
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
      return new Response("This app installation is blocked from uploading.", { status: 403 });
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
      return new Response("Uploads from this connection are blocked.", { status: 403 });
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
const UPLOAD_PER_ID_PER_DAY = 3;
const UPLOAD_PER_IP_PER_DAY = 10;
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

  const deleteCode = normalizeDeleteCode(form.get("deletecode"));
  if (deleteCode && !DELETE_CODE_RE.test(deleteCode)) {
    return { response: await refuse(400, "Could not accept this submission: the delete code must be exactly 6 digits.") };
  }
  return { sub: { name, builder, description, shipFile, imageBufs, linkCheck, deleteCode } };
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
  const refuse = async (status, text, blocked) => {
    if (status === 400 && idHash && env.DELETE_CODES) {
      await recordRejection(env, "id", idHash, idHash.slice(0, 4));
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
      return new Response("Uploads from this connection are blocked.", { status: 403, headers: { "x-blocked": "1" } });
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
      return new Response("This app installation is blocked from uploading.", { status: 403, headers: { "x-blocked": "1" } });
    }
    const left = await lockSecondsLeft(env, `lock:id:${idHash}`);
    if (left > 0) {
      return new Response(`Too many rejected uploads. Please try again in ${Math.max(1, Math.ceil(left / 60))} minutes.`, {
        status: 429,
        headers: { "x-blocked": "1" }
      });
    }

    if (form.get("agree") !== "yes") {
      return refuse(400, "Could not accept this submission: you must agree to the upload rules first.");
    }
    if (!(await checkRateLimit(ip))) {
      return new Response("Please wait a minute before submitting again.", { status: 429, headers: { "x-blocked": "1" } });
    }
    const ipQuotaKey = ipKey ? `ip:${ipKey.slice(7)}` : null;
    if ((await uploadQuotaUsed(env, `id:${idHash}`)) >= UPLOAD_PER_ID_PER_DAY) {
      return new Response(`Daily upload limit reached (${UPLOAD_PER_ID_PER_DAY} per 24 hours). Please try again tomorrow.`, {
        status: 429,
        headers: { "x-blocked": "1" }
      });
    }
    if (ipQuotaKey && (await uploadQuotaUsed(env, ipQuotaKey)) >= UPLOAD_PER_IP_PER_DAY) {
      return new Response("Too many uploads from this connection today. Please try again tomorrow.", {
        status: 429,
        headers: { "x-blocked": "1" }
      });
    }

    const humanToken = (form.get("humanToken") || "").toString();
    let humanOk = false;
    if (HUMAN_TOKEN_RE.test(humanToken)) {
      const row = await env.DB.prepare("SELECT id_hash, verified, used, created FROM humans WHERE token = ?").bind(humanToken).first();
      humanOk = !!row && row.verified === 1 && row.used === 0 && row.id_hash === idHash && Date.now() - row.created < HUMAN_TTL_MS;
    }
    if (!humanOk) {
      return new Response("Could not accept this submission: please complete the human check first.", {
        status: 403,
        headers: { "x-blocked": "1" }
      });
    }

    const v = await validateSubmission(form, refuse);
    if (v.response) return v.response;
    const { name, builder, description, shipFile, imageBufs, linkCheck, deleteCode } = v.sub;

    const shipBytes = new Uint8Array(await shipFile.arrayBuffer());
    const staged = await stageSubmission(
      { name, submitter: builder, description, patreonUrl: linkCheck.patreonUrl, youtubeUrl: linkCheck.youtubeUrl, shipBytes, imageBufs, deleteCode, ipKey, userKey: idKey },
      env
    );
    if (!staged.ok) return refuse(400, `Could not accept this ship file: ${staged.error}.`);

    const used = await env.DB.prepare("UPDATE humans SET used = 1 WHERE token = ? AND used = 0").bind(humanToken).run();
    if (!used || !used.meta || used.meta.changes < 1) {
      await rejectPending(staged.slug, env);
      return new Response("Could not accept this submission: please complete the human check first.", {
        status: 403,
        headers: { "x-blocked": "1" }
      });
    }
    await uploadQuotaAdd(env, [`id:${idHash}`, ipQuotaKey]);

    const slug = staged.slug;
    ctx.waitUntil(
      (async () => {
        const embed = approvalEmbedFor(name, builder, "via app", description, linkCheck, staged, await approvalExtraFields(slug, env, staged.check, imageBufs.length));
        const posted = await postApprovalMessage(env, embed, slug, imageBufs[0]);
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

const GUEST_COOKIE = "guest_session";
const GUEST_SESSION_MS = 4 * 60 * 60 * 1000;
const GUEST_LOGIN_MAX_FAILS = 5;
const GUEST_LOGIN_WINDOW_MS = 60 * 60 * 1000;
const GUEST_UPLOADS_PER_HOUR = 30;
const GUEST_MAX_BATCH = 10;
const HOUR_MS = 60 * 60 * 1000;

async function hmacHex(keyText, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(keyText), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function guestConfigured(env) {
  return !!env.UPLOAD_PASSWORD && !!env.DB && deleteCodesReady(env);
}

async function guestPasswordMatches(env, given) {
  const k = "guest-pw|" + (env.DELETE_PEPPER || "");
  const a = await hmacHex(k, given);
  const b = await hmacHex(k, env.UPLOAD_PASSWORD);
  return constantTimeEqual(a, b);
}

function guestSessionKey(env) {
  return "guest-session|" + env.UPLOAD_PASSWORD + "|" + (env.DELETE_PEPPER || "");
}

async function makeGuestSession(env) {
  const exp = String(Date.now() + GUEST_SESSION_MS);
  return exp + "." + (await hmacHex(guestSessionKey(env), exp));
}

async function guestSessionValid(request, env) {
  if (!env.UPLOAD_PASSWORD) return false;
  const header = request.headers.get("Cookie") || "";
  const match = header.split(";").map((p) => p.trim()).find((p) => p.startsWith(GUEST_COOKIE + "="));
  if (!match) return false;
  const value = match.slice(GUEST_COOKIE.length + 1);
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^[0-9]{10,16}$/.test(exp) || Number(exp) < Date.now()) return false;
  return constantTimeEqual(sig, await hmacHex(guestSessionKey(env), exp));
}

function guestCookie(value, maxAgeSeconds) {
  return `${GUEST_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

function htmlResponse(html) {
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function handleGuestPage(request, env) {
  if (!guestConfigured(env)) return htmlResponse(guestLoginHtml("", false));
  if (await guestSessionValid(request, env)) return htmlResponse(guestBatchHtml());
  return htmlResponse(guestLoginHtml(env.TURNSTILE_SITE_KEY || "", true));
}

async function handleGuestLogin(request, env) {
  try {
    if (!guestConfigured(env)) return new Response("Guest upload is not set up on the server yet.", { status: 503 });
    await ensureD1(env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    if (await isBanned(env, [ipKey])) return new Response("This connection is blocked.", { status: 403 });
    const failKey = `lgfail:${ipKey ? ipKey.slice(7) : "x"}`;
    if ((await uploadQuotaUsed(env, failKey, GUEST_LOGIN_WINDOW_MS)) >= GUEST_LOGIN_MAX_FAILS) {
      return new Response("Too many wrong attempts. Please try again in an hour.", { status: 429 });
    }
    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return new Response("Invalid request.", { status: 400 });
    }
    const turnstile = await verifyTurnstile(form.get("cf-turnstile-response"), ip, env);
    if (!turnstile.ok) {
      console.error("turnstile failed: " + turnstile.codes.join(","));
      return new Response(turnstileMessage(turnstile.codes), { status: 400 });
    }
    const given = (form.get("password") || "").toString().slice(0, 200);
    if (!given || !(await guestPasswordMatches(env, given))) {
      await uploadQuotaAdd(env, [failKey]);
      return new Response("That code is not correct.", { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": guestCookie(await makeGuestSession(env), Math.floor(GUEST_SESSION_MS / 1000))
      }
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleGuestLogin failed: " + msg);
    return new Response("Server error: " + msg.slice(0, 120), { status: 500 });
  }
}

function handleGuestLogout() {
  return new Response("ok", { status: 200, headers: { "set-cookie": guestCookie("", 0) } });
}

async function handleGuestUpload(request, env, ctx) {
  const refuse = async (status, text, blocked) => new Response(text, { status, headers: blocked ? { "x-blocked": "1" } : {} });
  try {
    if (!guestConfigured(env)) return new Response("Guest upload is not set up on the server yet.", { status: 503 });
    if (!(await guestSessionValid(request, env))) {
      return new Response("Your session has expired. Reload the page and enter the code again.", { status: 401 });
    }
    await ensureD1(env);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = await ipBanKey(ip, env);
    if (await isBanned(env, [ipKey])) {
      return new Response("Uploads from this connection are blocked.", { status: 403, headers: { "x-blocked": "1" } });
    }
    const declared = parseInt(request.headers.get("content-length") || "0", 10);
    if (declared > UPLOAD_MAX_BODY) return new Response("The upload is too large.", { status: 413 });

    const hourKey = `guest:${ipKey ? ipKey.slice(7) : "x"}`;
    if ((await uploadQuotaUsed(env, hourKey, HOUR_MS)) >= GUEST_UPLOADS_PER_HOUR) {
      return new Response("Too many uploads in the last hour. Please try again later.", { status: 429, headers: { "x-blocked": "1" } });
    }

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return new Response("Invalid form submission.", { status: 400 });
    }
    if (form.get("agree") !== "yes") {
      return refuse(400, "Could not accept this submission: you must agree to the upload rules first.");
    }
    const v = await validateSubmission(form, refuse);
    if (v.response) return v.response;
    const { name, builder, description, shipFile, imageBufs, linkCheck, deleteCode } = v.sub;

    const shipBytes = new Uint8Array(await shipFile.arrayBuffer());
    const staged = await stageSubmission(
      { name, submitter: builder, description, patreonUrl: linkCheck.patreonUrl, youtubeUrl: linkCheck.youtubeUrl, shipBytes, imageBufs, deleteCode, ipKey, userKey: null },
      env
    );
    if (!staged.ok) return refuse(400, `Could not accept this ship file: ${staged.error}.`);
    await uploadQuotaAdd(env, [hourKey]);

    const slug = staged.slug;
    ctx.waitUntil(
      (async () => {
        const embed = approvalEmbedFor(name, builder, "guest upload", description, linkCheck, staged, await approvalExtraFields(slug, env, staged.check, imageBufs.length));
        const posted = await postApprovalMessage(env, embed, slug, imageBufs[0]);
        if (!posted) console.error("approval message could not be posted for " + slug + " - use /pending");
      })()
    );
    return new Response("Sent for approval.", { status: 200 });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleGuestUpload failed: " + msg);
    return new Response("Server error while saving your submission: " + msg.slice(0, 120), { status: 500 });
  }
}

function guestPageShell(title, body, script) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
body{font-family:sans-serif;background:#1e1e1e;color:#ddd;max-width:860px;margin:30px auto;padding:0 16px}
h2{margin:0 0 6px 0}
h3{margin:18px 0 6px 0;font-size:15px}
label{display:block;margin-top:12px;font-size:14px}
input[type=text],input[type=password],textarea,select{width:100%;padding:8px;margin-top:4px;background:#2a2a2e;border:1px solid #555;color:#ddd;border-radius:4px;box-sizing:border-box;font-family:inherit;font-size:14px}
textarea{resize:vertical;min-height:62px}
button{padding:9px 16px;background:#3a6ea5;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px}
button.grey{background:#3a3a40;border:1px solid #555}
button.small{padding:3px 9px;font-size:12px}
button:disabled{opacity:.5;cursor:not-allowed}
.hint{font-size:12px;color:#9da5b4;margin-top:6px;line-height:1.45}
.row{display:flex;gap:12px}
.row>*{flex:1}
.drop{margin-top:16px;padding:26px 14px;border:2px dashed #555;border-radius:8px;text-align:center;color:#9da5b4}
.drop.over{border-color:#3a6ea5;background:#232a33;color:#ddd}
.card{margin-top:14px;padding:12px 14px;background:#25252a;border:1px solid #3f3f46;border-radius:8px}
.card.done{border-color:#2d7a2d;background:#1d2a1f}
.card.error{border-color:#8b2020}
.card.sending{border-color:#3a6ea5}
.cardhead{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;color:#9da5b4}
.cardhead b{color:#ddd}
.count{font-size:11px;color:#9da5b4;text-align:right}
.thumbs{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.thumb{position:relative;width:104px}
.thumb img{width:104px;height:70px;object-fit:cover;border-radius:4px;border:1px solid #555;display:block}
.thumb .x{position:absolute;top:2px;right:2px;padding:0 6px;background:#000a;color:#fff;border-radius:3px;font-size:12px;line-height:18px}
.thumb select{margin-top:4px;padding:3px;font-size:11px}
.thumb .nm{font-size:10px;color:#9da5b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msg{margin-top:8px;font-size:13px}
.ok{color:#6fcf6f}
.err{color:#e05555}
.tray{margin:16px 0;padding:10px 14px;border:1px dashed #8a6d1f;border-radius:8px;background:#2b2619}
.rules{background:#1f1f23;border:1px solid #3f3f46;border-radius:6px;padding:12px 16px;margin-top:22px;font-size:13px;line-height:1.5;color:#d4d4d4}
.rules h3{margin:0 0 6px 0;font-size:15px}
.rules ol{margin:0;padding-left:20px}
.rules li{margin-top:5px}
.rulesbody{max-height:150px;overflow-y:auto;padding-right:10px;scrollbar-width:thin;scrollbar-color:#555 #1f1f23}
.rulesnote{font-size:11px;color:#9da5b4;margin-top:6px}
.agree{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:14px;cursor:pointer}
.agree input{width:auto;margin:3px 0 0 0}
#status{margin-top:14px;font-size:14px}
.top{display:flex;justify-content:space-between;align-items:center}
</style>
</head>
<body>
${body}
<script>
${script}
</script>
</body>
</html>`;
}

function guestLoginHtml(siteKey, configured) {
  const body = configured
    ? `<h2>Guest upload</h2>
<p class="hint">This upload is only for a few trusted builders. Ask TAZmd for permission.</p>
<p class="hint">This page is only for invited guests. Enter the code you received.</p>
<form id="lf">
<label>Code<input type="password" name="password" autocomplete="off" required></label>
<div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onTsOk" data-expired-callback="onTsGone" data-error-callback="onTsGone" style="margin-top:16px"></div>
${siteKey ? "" : '<div class="hint">Verification is not set up on the server (TURNSTILE_SITE_KEY is missing).</div>'}
<button type="submit" style="margin-top:16px">Continue</button>
</form>
<div id="status"></div>`
    : `<h2>Guest upload</h2><p class="hint">Guest upload is not set up on the server yet.</p>`;
  const script = `
let tsToken = '';
function onTsOk(t) { tsToken = t; }
function onTsGone() { tsToken = ''; }
const lf = document.getElementById('lf');
if (lf) lf.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('status');
  if (!tsToken) { status.className = 'err'; status.textContent = 'Please wait for the verification check mark first.'; return; }
  status.className = ''; status.textContent = 'Checking...';
  const form = new FormData(lf);
  form.set('cf-turnstile-response', tsToken);
  try {
    const resp = await fetch('/upload-login', { method: 'POST', body: form, credentials: 'same-origin' });
    if (resp.ok) { location.reload(); return; }
    status.className = 'err';
    status.textContent = await resp.text();
  } catch (err) {
    status.className = 'err';
    status.textContent = 'Network error. Please try again.';
  }
  tsToken = '';
  try { if (typeof turnstile !== 'undefined') turnstile.reset(); } catch (err) {}
});`;
  return guestPageShell("Guest upload", body, script);
}

function guestBatchHtml() {
  const body = `<div class="top"><h2>Submit Corvettes</h2><button class="grey small" id="logout" type="button">Log out</button></div>
<div class="hint">Add between 1 and ${GUEST_MAX_BATCH} Corvettes at once. Drop all Corvette files and all photos together. Photos whose file name starts with the Corvette file name are matched automatically, the rest you can assign yourself.</div>
<div class="row">
<label>Your name (builder)<input type="text" id="builder" maxlength="80"></label>
<label>Patreon link (optional)<input type="text" id="patreon" maxlength="200" placeholder="https://www.patreon.com/yourname"></label>
</div>
<div class="hint">The builder name and the Patreon link are used for every Corvette in this batch. Patreon: patreon.com only.</div>
<label>Delete code (optional)<input type="text" id="deletecode" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6 digits, for example 482915"></label>
<div class="hint">A delete code is what you supply to me when you want a ship to be removed from the Corvette library. Pick 6 random digits, only for this. Never use a code from anywhere else (bank, phone, accounts). The same code is used for every Corvette in this batch. This browser remembers it for next time. I cannot see or recover it, so write it down.</div>
<div class="drop" id="drop">Drop Corvette files (.nmsship, .json, .txt) and photos here<br><br><button type="button" class="grey" id="pick">Choose files</button><input type="file" id="files" multiple accept=".nmsship,.json,.txt,image/*" style="display:none"></div>
<div id="limitmsg" class="msg err"></div>
<div class="tray" id="tray" style="display:none"><b>Photos without a Corvette</b><div class="hint">Choose in the list under each photo which Corvette it belongs to. Photos you leave here are ignored.</div><div class="thumbs" id="trayList"></div></div>
<div id="ships"></div>
<div class="rules">
<h3>Upload rules</h3>
<div class="rulesbody">
<ol>
<li>Only upload Corvettes you built yourself. Do not upload someone else's Corvette, even if you only changed the color or made a few small changes.</li>
<li>No sexual, racist, hateful, discriminatory or otherwise offensive content. This applies to the Corvette, its name, photos and links.</li>
<li>Use your own builder name. Do not use someone else's name or pretend to be another builder.</li>
<li>Only use photos of the Corvette you are uploading.</li>
<li>Only link to your own Patreon or YouTube.</li>
<li>Do not upload the same Corvette more than once. Spam uploads are not allowed.</li>
<li>Only upload normal, unmodified Corvette files. Modified or tampered files will be rejected.</li>
<li>By uploading a Corvette, you allow other users to download and use it for free in their own game.</li>
<li>Every Corvette is checked before it is published. I can reject or remove a Corvette if needed.</li>
<li>Breaking these rules can result in a permanent ban.</li>
</ol>
</div>
<div class="rulesnote">Scroll to read all the rules.</div>
</div>
<label class="agree"><input type="checkbox" id="agree"><span>I have read the rules and I agree to them.</span></label>
<button type="button" id="send" style="margin-top:18px">Send for approval</button>
<div id="status"></div>`;
  const script = `
const MAX_SHIPS = ${GUEST_MAX_BATCH};
const MAX_PHOTOS = 3;
const SHIP_EXT = /\\.(nmsship|json|txt)$/i;
const IMG_EXT = /\\.(png|jpe?g|gif|webp|bmp)$/i;
let ships = [];
let tray = [];
let nextId = 1;
let busy = false;

function baseName(n) { return n.replace(/\\.[^.]+$/, ''); }
function normKey(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function stripPhotoSuffix(s) {
  let t = s.toLowerCase();
  let numberDone = false;
  for (let i = 0; i < 3; i++) {
    const before = t;
    if (!numberDone) {
      const noNumber = t.replace(/[\\s_\\-()\\[\\]]*[0-9]+[\\s_\\-()\\[\\]]*$/, '');
      if (noNumber !== t) {
        t = noNumber;
        numberDone = true;
        continue;
      }
    }
    t = t.replace(/[\\s_\\-()\\[\\]]+(?:preview|photo|picture|pic|screenshot|screen|image|img|view)$/, '');
    if (t === before) break;
  }
  return t;
}
function findShipForPhoto(photoName, shipList) {
  const raw = normKey(baseName(photoName));
  const stripped = normKey(stripPhotoSuffix(baseName(photoName)));
  const keys = shipList.map((s) => normKey(baseName(s.file.name)));
  const exact = [];
  keys.forEach((k, i) => { if (k && (k === raw || k === stripped)) exact.push(i); });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return -1;
  const loose = [];
  if (stripped.length >= 3) {
    keys.forEach((k, i) => { if (k.length >= 3 && (k.indexOf(stripped) === 0 || stripped.indexOf(k) === 0)) loose.push(i); });
  }
  return loose.length === 1 ? loose[0] : -1;
}
function matchBlockEnd() {}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach((k) => {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== false && attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  });
  (kids || []).forEach((c) => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function shipLabel(s) { return (s.name && s.name.trim()) ? s.name.trim() : baseName(s.file.name); }
function cleanName(fileName) { return baseName(fileName).replace(/[_-]+/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 80); }

function addFiles(fileList) {
  const limitMsg = document.getElementById('limitmsg');
  limitMsg.textContent = '';
  const incoming = Array.from(fileList);
  const newShips = [];
  const newPhotos = [];
  let skipped = 0;
  let ignored = 0;
  incoming.forEach((f) => {
    if (SHIP_EXT.test(f.name)) {
      if (ships.filter((x) => x.status !== 'done').length + newShips.length >= MAX_SHIPS) { skipped++; return; }
      newShips.push({ id: nextId++, file: f, name: cleanName(f.name), youtube: '', desc: '', photos: [], status: 'ready', msg: '' });
    } else if (IMG_EXT.test(f.name) || (f.type && f.type.indexOf('image/') === 0)) {
      newPhotos.push({ id: nextId++, file: f, url: URL.createObjectURL(f) });
    } else {
      ignored++;
    }
  });
  ships = ships.concat(newShips);
  const pool = ships.filter((s) => s.status !== 'done');
  newPhotos.forEach((p) => {
    const idx = findShipForPhoto(p.file.name, pool);
    let target = idx >= 0 ? pool[idx] : null;
    if (!target && pool.length === 1) target = pool[0];
    if (target && target.photos.length < MAX_PHOTOS) target.photos.push(p);
    else tray.push(p);
  });
  const notes = [];
  if (skipped) notes.push(skipped + ' Corvette file(s) were not added because the maximum is ' + MAX_SHIPS + ' per batch.');
  if (ignored) notes.push(ignored + ' file(s) were ignored because they are not Corvette files or photos.');
  limitMsg.textContent = notes.join(' ');
  render();
}

function assignPhoto(photo, fromList, targetValue) {
  const idx = fromList.indexOf(photo);
  if (idx >= 0) fromList.splice(idx, 1);
  if (targetValue === 'remove') { URL.revokeObjectURL(photo.url); render(); return; }
  if (targetValue === 'tray') { tray.push(photo); render(); return; }
  const target = ships.find((s) => String(s.id) === targetValue);
  if (target && target.photos.length < MAX_PHOTOS) target.photos.push(photo);
  else { tray.push(photo); document.getElementById('limitmsg').textContent = 'A Corvette can have at most ' + MAX_PHOTOS + ' photos.'; }
  render();
}

function photoThumb(photo, list, ownerId) {
  const sel = el('select', { onchange: (e) => assignPhoto(photo, list, e.target.value) });
  sel.appendChild(el('option', { value: ownerId === null ? 'tray' : String(ownerId), text: ownerId === null ? 'Assign to...' : 'Move to...' }));
  ships.forEach((s) => { if (s.id !== ownerId && s.status !== 'done') sel.appendChild(el('option', { value: String(s.id), text: shipLabel(s) })); });
  if (ownerId !== null) sel.appendChild(el('option', { value: 'tray', text: 'No Corvette' }));
  sel.appendChild(el('option', { value: 'remove', text: 'Remove photo' }));
  return el('div', { class: 'thumb' }, [
    el('img', { src: photo.url, alt: '' }),
    el('div', { class: 'nm', text: photo.file.name }),
    sel
  ]);
}

function render() {
  const holder = document.getElementById('ships');
  holder.textContent = '';
  ships.forEach((s, i) => {
    const locked = s.status === 'done' || s.status === 'sending' || busy;
    const nameIn = el('input', { type: 'text', maxlength: '80', value: s.name, disabled: locked, oninput: (e) => { s.name = e.target.value; } });
    const ytIn = el('input', { type: 'text', maxlength: '200', value: s.youtube, placeholder: 'https://youtu.be/...', disabled: locked, oninput: (e) => { s.youtube = e.target.value; } });
    const counter = el('div', { class: 'count', text: s.desc.length + '/250' });
    const descIn = el('textarea', { maxlength: '250', disabled: locked, placeholder: 'Instructions (optional). For example: how to enter the cockpit', oninput: (e) => { s.desc = e.target.value; counter.textContent = s.desc.length + '/250'; } });
    descIn.value = s.desc;
    const thumbs = el('div', { class: 'thumbs' });
    s.photos.forEach((p) => {
      const t = photoThumb(p, s.photos, s.id);
      if (locked) t.querySelector('select').disabled = true;
      thumbs.appendChild(t);
    });
    const addPhoto = el('button', { type: 'button', class: 'grey small', text: '+ Add photo', disabled: locked || s.photos.length >= MAX_PHOTOS, onclick: () => {
      const inp = el('input', { type: 'file', accept: 'image/*', multiple: true });
      inp.addEventListener('change', () => {
        Array.from(inp.files).forEach((f) => {
          if (s.photos.length < MAX_PHOTOS) s.photos.push({ id: nextId++, file: f, url: URL.createObjectURL(f) });
        });
        render();
      });
      inp.click();
    } });
    const rm = el('button', { type: 'button', class: 'grey small', text: 'Remove Corvette', disabled: s.status === 'sending' || busy, onclick: () => {
      s.photos.forEach((p) => URL.revokeObjectURL(p.url));
      ships = ships.filter((x) => x !== s);
      render();
    } });
    const statusText = s.status === 'done' ? 'Sent' : s.status === 'sending' ? 'Sending...' : s.status === 'error' ? 'Not sent' : 'Ready';
    const card = el('div', { class: 'card ' + (s.status === 'ready' ? '' : s.status) }, [
      el('div', { class: 'cardhead' }, [el('span', {}, [el('b', { text: 'Corvette ' + (i + 1) + ': ' }), s.file.name, ' (' + statusText + ')']), rm]),
      el('div', { class: 'row' }, [el('label', {}, ['Corvette name', nameIn]), el('label', {}, ['YouTube link (optional)', ytIn])]),
      el('label', {}, ['Instructions (optional)', descIn]),
      counter,
      el('div', { class: 'hint', text: 'Photos (1 to ' + MAX_PHOTOS + ', the first one is the preview image):' }),
      thumbs,
      el('div', { style: 'margin-top:8px' }, [addPhoto]),
      s.msg ? el('div', { class: 'msg ' + (s.status === 'done' ? 'ok' : 'err'), text: s.msg }) : null
    ]);
    holder.appendChild(card);
  });
  const trayBox = document.getElementById('tray');
  const trayList = document.getElementById('trayList');
  trayList.textContent = '';
  tray.forEach((p) => trayList.appendChild(photoThumb(p, tray, null)));
  trayBox.style.display = tray.length ? 'block' : 'none';
  updateSend();
}

function updateSend() {
  const pending = ships.filter((s) => s.status !== 'done').length;
  const btn = document.getElementById('send');
  btn.disabled = busy || pending === 0 || !document.getElementById('agree').checked;
  btn.textContent = busy ? 'Sending...' : (pending > 0 ? 'Send ' + pending + ' Corvette' + (pending === 1 ? '' : 's') + ' for approval' : 'Send for approval');
}

function loadSaved() {
  try {
    const b = localStorage.getItem('builderName');
    if (b) document.getElementById('builder').value = b;
    const p = localStorage.getItem('patreonLink');
    if (p) document.getElementById('patreon').value = p;
    const c = localStorage.getItem('deleteCode');
    if (c) document.getElementById('deletecode').value = c;
    if (localStorage.getItem('agreeRules') === 'yes') document.getElementById('agree').checked = true;
  } catch (e) {}
}
function saveField(key, value, valid) {
  try {
    if (value && valid) localStorage.setItem(key, value);
    else if (!value) localStorage.removeItem(key);
  } catch (e) {}
}

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
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image compression failed')), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('this image cannot be opened by the browser'));
    img.src = URL.createObjectURL(file);
  });
}

function validateBatch() {
  const builder = document.getElementById('builder').value.trim();
  const code = document.getElementById('deletecode').value.trim();
  if (!builder) return 'Please fill in your builder name.';
  if (code && !/^[0-9]{6}$/.test(code)) return 'The delete code must be exactly 6 digits.';
  const pending = ships.filter((s) => s.status !== 'done');
  if (pending.length === 0) return 'There is nothing to send.';
  for (let i = 0; i < pending.length; i++) {
    const s = pending[i];
    const label = '"' + shipLabel(s) + '"';
    if (!s.name.trim()) return 'Corvette ' + label + ' needs a name.';
    if (s.photos.length === 0) return 'Corvette ' + label + ' needs at least 1 photo.';
    if (s.desc.length > 250) return 'The instructions of ' + label + ' are longer than 250 characters.';
    if (s.file.size > 3 * 1024 * 1024) return 'The file of ' + label + ' is larger than 3 MB.';
  }
  return '';
}

async function sendAll() {
  const status = document.getElementById('status');
  status.className = '';
  const problem = validateBatch();
  if (problem) { status.className = 'err'; status.textContent = problem; return; }
  if (tray.length && !confirm(tray.length + ' photo(s) have no Corvette and will be ignored. Continue?')) return;
  busy = true;
  render();
  const builder = document.getElementById('builder').value.trim();
  const patreon = document.getElementById('patreon').value.trim();
  const code = document.getElementById('deletecode').value.trim();
  const todo = ships.filter((s) => s.status !== 'done');
  let sent = 0, failed = 0, expired = false;
  for (let n = 0; n < todo.length; n++) {
    const s = todo[n];
    status.textContent = 'Sending ' + (n + 1) + ' of ' + todo.length + ': ' + shipLabel(s);
    s.status = 'sending';
    s.msg = '';
    render();
    try {
      const form = new FormData();
      form.set('agree', 'yes');
      form.set('builder', builder);
      form.set('patreon', patreon);
      form.set('deletecode', code);
      form.set('name', s.name.trim());
      form.set('youtube', s.youtube.trim());
      form.set('description', s.desc.replace(/\\s+/g, ' ').trim());
      form.set('ship', s.file, s.file.name);
      for (let i = 0; i < s.photos.length; i++) {
        const blob = await compressImage(s.photos[i].file);
        form.set('image' + (i + 1), blob, 'image' + (i + 1) + '.jpg');
      }
      const resp = await fetch('/upload-guest', { method: 'POST', body: form, credentials: 'same-origin' });
      const text = await resp.text();
      if (resp.status === 401) { s.status = 'error'; s.msg = text; expired = true; failed++; render(); break; }
      if (resp.ok) { s.status = 'done'; s.msg = text; sent++; }
      else { s.status = 'error'; s.msg = text; failed++; }
    } catch (err) {
      s.status = 'error';
      s.msg = 'Something went wrong (' + (err && err.message ? err.message : 'unknown error') + '). Try a smaller JPG image or send this Corvette again.';
      failed++;
    }
    render();
  }
  todo.forEach((s) => { if (s.status === 'sending') s.status = 'ready'; });
  busy = false;
  render();
  if (expired) {
    status.className = 'err';
    status.textContent = 'Your session has expired. Reload the page and enter the code again. Corvettes that were already sent are safe.';
  } else {
    status.className = failed ? 'err' : 'ok';
    status.textContent = sent + ' sent for approval' + (failed ? ', ' + failed + ' not sent. Fix the red ones and press the button again.' : '. You can close this page.');
  }
}

document.getElementById('pick').addEventListener('click', () => document.getElementById('files').click());
document.getElementById('files').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
const drop = document.getElementById('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
document.getElementById('send').addEventListener('click', sendAll);
document.getElementById('agree').addEventListener('change', () => {
  updateSend();
  try {
    if (document.getElementById('agree').checked) localStorage.setItem('agreeRules', 'yes');
    else localStorage.removeItem('agreeRules');
  } catch (e) {}
});
document.getElementById('builder').addEventListener('input', (e) => saveField('builderName', e.target.value.trim(), true));
document.getElementById('patreon').addEventListener('input', (e) => saveField('patreonLink', e.target.value.trim(), true));
document.getElementById('deletecode').addEventListener('input', (e) => saveField('deleteCode', e.target.value.trim(), /^[0-9]{6}$/.test(e.target.value.trim())));
document.getElementById('logout').addEventListener('click', async () => {
  try { await fetch('/upload-logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
  location.reload();
});
loadSaved();
render();`;
  return guestPageShell("Submit Corvettes", body, script);
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
    env.DB.prepare("CREATE INDEX IF NOT EXISTS upload_log_k ON upload_log (k, at)")
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
    await discordApi(`/channels/${env.APPROVAL_CHANNEL_ID}/messages`, env, {
      method: "POST",
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error("notifyAdmin failed: " + (err && err.message ? err.message : String(err)));
  }
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
    : `${REJECT_LIMIT} rejected uploads in 30 minutes`;
  const who = kind === "id" ? "app installation" : kind === "ip" ? "connection" : "Discord user";
  const strikes = ["ship", "all", "upload"].map((r) => `strike:${kind}:${hash}:${r}`);

  let seconds = 0;
  if (rule === "all") seconds = n === 1 ? 3600 : 0;
  else seconds = n === 1 ? 3600 : n === 2 ? 86400 : 0;

  if (seconds === 0) {
    await addBan(env, banKey, `${who} ${code} - auto-ban: ${ruleText}`, "auto-ban", strikes);
    await env.DELETE_CODES.delete(lockKey);
    console.log(JSON.stringify({ event: "ban", kind, code, rule, ship: shipId || null, strike: n }));
    await notifyAdmin(env, `Ban: ${who} **${code}** is banned (${ruleText}, strike ${n}). Use /unban to lift it.`);
    return { banned: true, seconds: 0 };
  }
  const until = Date.now() + seconds * 1000;
  await env.DELETE_CODES.put(
    lockKey,
    JSON.stringify({ label: `${who} ${code} - ${ruleText}`, until, strikes }),
    { expirationTtl: seconds + 3600 }
  );
  console.log(JSON.stringify({ event: "lock", kind, code, rule, ship: shipId || null, strike: n, seconds }));
  await notifyAdmin(env, `Lock: ${who} **${code}** is locked for ${seconds >= 86400 ? "24 hours" : "1 hour"} (${ruleText}, strike ${n}).`);
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

  if (await env.DELETE_CODES.get(`ban:id:${idHash}`)) {
    console.log(JSON.stringify({ event: "denied-ban", code, ship: id }));
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

  ctx.waitUntil(
    recordDownloadStat(env, id, installId, request.headers.get("CF-Connecting-IP") || "unknown").catch((err) => {
      console.error("recordDownloadStat failed: " + (err && err.message ? err.message : String(err)));
    })
  );
  return json({ allowed: true });
}

async function deleteShip(id, env) {
  const found = await findInIndex(env, id);
  if (!found) throw new Error("ship id not found in the index");
  const entry = found.entry;
  found.shard.list = found.shard.list.filter((e) => e.id !== id);
  await writeShard(env, found.shard, `Remove ${id} from index`);

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
      await env.DB.prepare("DELETE FROM dl_seen WHERE ship = ?").bind(id).run();
    } catch (err) {
      console.error("d1 cleanup failed: " + (err && err.message ? err.message : String(err)));
    }
  }

  return entry ? entry.name : id;
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
      { name: "ship", description: "Start typing a ship name or builder and pick the ship", type: 3, required: true, autocomplete: true },
      { name: "code", description: "The 6-digit delete code the builder gave you", type: 3, required: false, min_length: 6, max_length: 6 },
      { name: "force", description: "Skip the code check (only if the code is lost or the builder cannot give it)", type: 5, required: false }
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
  const resp = await discordApi(
    `/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
    env,
    { method: "PUT", body: JSON.stringify([deleteCommand, banCommand, unbanCommand, pendingCommand, recalcCommand]) }
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

async function handleAutocomplete(interaction, env) {
  const empty = json({ type: 8, data: { choices: [] } });
  const clicker = interaction.member?.user || interaction.user;
  if (!clicker || clicker.id !== env.APPROVER_USER_ID) return empty;
  const cmdName = interaction.data.name;
  if (cmdName !== "delete" && cmdName !== "ban" && cmdName !== "unban") return empty;

  const focused = (interaction.data.options || []).find((o) => o.focused);
  if (!focused) return empty;
  const q = (focused.value || "").toString().trim().toLowerCase();

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

  if (focused.name !== "ship") return empty;

  try {
    const list = await readIndexList(env);
    const matches = list
      .filter((e) => {
        if (!q) return true;
        return (e.name || "").toLowerCase().includes(q) ||
          (e.submitter || "").toLowerCase().includes(q) ||
          (e.id || "").toLowerCase().includes(q);
      })
      .sort((a, b) => (b.approvedAt || "").localeCompare(a.approvedAt || ""))
      .slice(0, 25)
      .map((e) => ({ name: shipLabel(e).slice(0, 100), value: e.id }));
    return json({ type: 8, data: { choices: matches } });
  } catch (err) {
    console.error("handleAutocomplete failed: " + (err && err.message ? err.message : String(err)));
    return empty;
  }
}

async function runDelete(query, code, force, env) {
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

  const stored = await getStoredDeleteCode(target.id, env);
  let note = "";

  if (stored) {
    if (force) {
      note = " (code check skipped)";
    } else if (!code) {
      return `"${shipLabel(target)}" has a delete code. Run /delete again and fill in the code the builder gave you. Nothing was deleted.`;
    } else if (!deleteCodesReady(env) || !(await verifyDeleteCode(target.id, code, env))) {
      return `Wrong delete code for "${shipLabel(target)}". Nothing was deleted.`;
    } else {
      note = " (code matched)";
    }
  } else {
    if (code && !force) {
      return `"${shipLabel(target)}" has no delete code on file, so a code cannot be checked. Run /delete again without a code to delete it anyway. Nothing was deleted.`;
    }
    note = " (no delete code was set)";
  }

  const deletedName = await deleteShip(target.id, env);
  return `Deleted "${deletedName}" by ${target.submitter || "unknown"} (${target.id})${note}.`;
}

async function handleDeleteCommand(interaction, env, ctx) {
  const clicker = interaction.member?.user || interaction.user;
  if (!clicker || clicker.id !== env.APPROVER_USER_ID) {
    return ephemeral("Only the library admin can use this command.");
  }

  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const query = (opts.ship || "").toString().trim();
  const code = normalizeDeleteCode(opts.code);
  const force = opts.force === true;
  if (!query) return ephemeral("Pick a ship first.");
  if (code && !DELETE_CODE_RE.test(code)) return ephemeral("The delete code must be exactly 6 digits. Nothing was deleted.");

  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await runDelete(query, code, force, env);
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
  if (!clicker || clicker.id !== env.APPROVER_USER_ID) return ephemeral("Only the library admin can use this command.");
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const id = (opts.ship || "").toString().trim();
  if (!id) return ephemeral("Pick a ship first.");
  const owner = await getSubmissionOwner(id, env);
  if (!owner) return ephemeral("No submitter data is stored for this ship (older upload or not picked from the list). Nobody was banned.");
  const parts = [];
  if (owner.userKey) {
    await addBan(env, owner.userKey, owner.label, "banned by admin");
    parts.push("app installation");
  }
  if (opts.also_ip === true) {
    if (owner.ipKey) {
      await addBan(env, owner.ipKey, owner.label, "banned by admin (IP)");
      parts.push("internet connection (IP)");
    }
  }
  if (!parts.length) {
    return ephemeral("No app installation was stored for this ship (guest upload or older upload), so nobody was banned. Run /ban again with also_ip set to true if you want to ban the connection.");
  }
  return ephemeral(`Banned the submitter of "${owner.label}" (${parts.join(" + ")}). They can no longer upload or count downloads. Use /unban to undo.`);
}

async function handleUnbanCommand(interaction, env) {
  const clicker = interaction.member?.user || interaction.user;
  if (!clicker || clicker.id !== env.APPROVER_USER_ID) return ephemeral("Only the library admin can use this command.");
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const key = (opts.ban || "").toString().trim();
  if (!(key.startsWith("ban:") || key.startsWith("lock:")) || !env.DELETE_CODES) return ephemeral("Pick a ban or lock from the list.");
  const raw = await env.DELETE_CODES.get(key);
  if (raw) {
    try {
      const rec = JSON.parse(raw);
      for (const sk of rec.strikes || []) await env.DELETE_CODES.delete(sk);
    } catch (e) {}
  }
  await env.DELETE_CODES.delete(key);
  return ephemeral(key.startsWith("lock:") ? "Lock removed. The visitor starts fresh." : "Ban removed. The visitor starts fresh.");
}

async function handlePendingCommand(interaction, env, ctx) {
  const clicker = interaction.member?.user || interaction.user;
  if (!clicker || clicker.id !== env.APPROVER_USER_ID) return ephemeral("Only the library admin can use this command.");
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
          let firstImage = null;
          let imageCount = 1;
          try {
            const buf = await pendingGet(env, slug);
            if (buf) {
              const imgs = unpackPending(buf).images;
              firstImage = imgs[0] || null;
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
          if (await postApprovalMessage(env, embed, slug, firstImage)) posted++;
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
        const resp = await ghRequest(`/contents/ships/${e.id}/ship.json`, env, {
          method: "GET",
          headers: { Accept: "application/vnd.github.raw" }
        });
        if (!resp.ok) throw new Error("status " + resp.status);
        const ids = idsFromShipText(await resp.text());
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
  if (!clicker || clicker.id !== env.APPROVER_USER_ID) return ephemeral("Only the library admin can use this command.");
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

  if (action === "reject" || action === "rejban") {
    ctx.waitUntil(
      (async () => {
        let banNote = "";
        if (action === "rejban") {
          const owner = await getSubmissionOwner(slug, env);
          if (owner) {
            if (owner.userKey) {
              await addBan(env, owner.userKey, owner.label, "rejected and banned");
              banNote = " and banned (app installation)";
            } else {
              banNote = " (no app installation stored, nobody banned)";
            }
          } else {
            banNote = " (no submitter data found, nobody banned)";
          }
        }
        const result = await rejectPending(slug, env);
        const payload = result.ok
          ? { embeds: [{ ...embed, color: 0x8b2020, title: `Rejected${banNote} - ${embed.title}` }], components: [] }
          : {
              embeds: [{ ...embed, color: 0xe89a2f, title: `Reject failed - try again - ${embed.title}`, description: `Error: ${result.error}` }],
              components: approvalComponents(slug, false)
            };
        await editApprovalMessage(env, message.id, payload);
      })()
    );
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: [{ ...embed, title: `Rejecting - ${embed.title}` }], components: approvalComponents(slug, true) }
    });
  }

  if (action === "approve") {
    ctx.waitUntil(
      promotePendingToLibraryTry(slug, env).then(async (result) => {
        const payload = result.ok
          ? { embeds: [{ ...embed, color: 0x2d7a2d, title: `Approved - ${embed.title}` }], components: [] }
          : {
              embeds: [{ ...embed, color: 0xe05555, title: `Approve failed - try again - ${embed.title}`, description: `Error: ${result.error}` }],
              components: approvalComponents(slug, false)
            };
        await editApprovalMessage(env, message.id, payload);
      })
    );
    return json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { embeds: [{ ...embed, title: `Publishing - ${embed.title}` }], components: approvalComponents(slug, true) }
    });
  }

  return json({ type: InteractionResponseType.UPDATE_MESSAGE, data: {} });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    workerOrigin = url.origin;

    if (request.method === "POST") await ensureCatalog(env);

    if (request.method === "GET") {
      if (url.pathname.startsWith("/img/")) return handlePendingImage(url, env);
      if (url.pathname.startsWith("/ship/")) return handlePendingShip(url, env);
      if (url.pathname === "/register") return handleRegister(url, env);
      if (url.pathname === "/upload") return handleGuestPage(request, env);
      if (url.pathname === "/human") return handleHumanPage(url, env);
      if (url.pathname === "/human-status") return handleHumanStatus(url, env);
      return new Response("Corvette Library bot is running.", { status: 200 });
    }

    if (request.method === "POST") {
      if (url.pathname === "/upload-app") return handleAppUpload(request, env, ctx);
      if (url.pathname === "/upload-login") return handleGuestLogin(request, env);
      if (url.pathname === "/upload-logout") return handleGuestLogout();
      if (url.pathname === "/upload-guest") return handleGuestUpload(request, env, ctx);
      if (url.pathname === "/human-start") return handleHumanStart(request, env);
      if (url.pathname === "/human") return handleHumanVerify(request, env);
      if (url.pathname === "/download-request") return handleDownloadRequest(request, env, ctx);

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
      if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        return handleComponent(interaction, env, ctx);
      }

      return json({ type: InteractionResponseType.PONG });
    }

    return new Response("Not found", { status: 404 });
  }
};
