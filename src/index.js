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
  "catalogVersion": 2,
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
            "AM_SUITTREE"
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
            "AM_WEAPONTREE"
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
const SHIP_WINDOW_MS = 30 * 60 * 1000;
const SHIP_LIMIT = 10;
const ALL_WINDOW_MS = 60 * 60 * 1000;
const ALL_LIMIT = 60;
const REJECT_WINDOW_MS = 30 * 60 * 1000;
const REJECT_LIMIT = 10;
const MAX_PENDING_ITEMS = 50;

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
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true, codes: [] };
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

async function stageSubmission({ name, submitter, patreonUrl, youtubeUrl, shipBytes, imageBufs, deleteCode, ipKey, userKey }, env) {
  if ((await pendingCount(env)) >= MAX_PENDING_ITEMS) {
    return { ok: false, error: "the waiting list is full, please try again later" };
  }
  const norm = await normalizeShipBytes(shipBytes);
  if (!norm.ok) return { ok: false, error: norm.error };

  const meta = computeShipMeta(norm.objectsText);
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
  const images = (imageBufs || []).slice(0, 3);

  const info = {
    name, id: slug, submitter: submitter || "", patreonUrl: patreonUrl || "", youtubeUrl: youtubeUrl || "",
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
button:disabled{opacity:.5;cursor:not-allowed}
.rules{background:#1f1f23;border:1px solid #3f3f46;border-radius:6px;padding:12px 16px;margin-top:22px;font-size:13px;line-height:1.5;color:#d4d4d4}
.rules h3{margin:0 0 6px 0;font-size:15px}
.rules ol{margin:0;padding-left:20px}
.rules li{margin-top:5px}
.rulesbody{max-height:150px;overflow-y:auto;padding-right:10px;scrollbar-width:thin;scrollbar-color:#555 #1f1f23}
.rulesbody::-webkit-scrollbar{width:8px}
.rulesbody::-webkit-scrollbar-track{background:#1f1f23}
.rulesbody::-webkit-scrollbar-thumb{background:#555;border-radius:4px}
.rulesnote{font-size:11px;color:#9da5b4;margin-top:6px}
.agree{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:14px;color:#ddd;cursor:pointer}
.agree input{width:auto;margin:3px 0 0 0}
#status{margin-top:16px;font-size:14px}
.hint{font-size:12px;color:#9da5b4;margin-top:6px;line-height:1.45}
.file{position:relative;margin-top:4px}
.file input[type=file]{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;margin:0;border:0}
.filebtn{display:block;padding:8px;background:#2a2a2e;border:1px solid #444;border-radius:4px;color:#ddd;cursor:pointer;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.filebtn:hover{border-color:#3a6ea5}
.filebtn.done{background:#1f5a2a;border-color:#2d7a2d;color:#fff}
.file input:focus + .filebtn{outline:2px solid #3a6ea5}
</style>
</head>
<body>
<h2>Submit a Corvette</h2>
<form id="f">
<label>Your name (builder)<input type="text" name="builder" required maxlength="80"></label>
<label>Ship name<input type="text" name="name" required maxlength="80"></label>
<label>YouTube link (optional)<input type="text" name="youtube" placeholder="https://youtu.be/..." maxlength="200"></label>
<label>Patreon link (optional)<input type="text" name="patreon" placeholder="https://www.patreon.com/yourname" maxlength="200"></label>
<div class="hint">You can fill in one, both or none. YouTube: youtube.com, youtu.be, shorts, playlists and channels all work. Patreon: patreon.com only.</div>
<label>Fill in your delete code (optional)<input type="text" name="deletecode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" placeholder="6 digits, for example 482915"></label>
<div class="hint">A delete code is what you supply to me when you want your ship to be removed from the Corvette library. Pick 6 random digits, only for this. Never use a code from anywhere else (bank, phone, accounts). You can use the same code for every upload. This browser remembers it for next time. I cannot see or recover it, so write it down.</div>
<label>Ship file (.nmsship, .nmsbase, .nmsprefab, .json or .txt)<div class="file"><input type="file" name="ship" accept=".nmsship,.nmsbase,.nmsprefab,.json,.txt" required><span class="filebtn">Choose file</span></div></label>
<label>Preview image<div class="file"><input type="file" name="image1" accept="image/*" required><span class="filebtn">Choose file</span></div></label>
<label>Extra image 2 (optional)<div class="file"><input type="file" name="image2" accept="image/*"><span class="filebtn">Choose file</span></div></label>
<label>Extra image 3 (optional)<div class="file"><input type="file" name="image3" accept="image/*"><span class="filebtn">Choose file</span></div></label>
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
<label class="agree"><input type="checkbox" id="agree" name="agree" value="yes" required><span>I have read the rules and I agree to them.</span></label>
<div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onTsOk" data-expired-callback="onTsExpired" data-error-callback="onTsError" style="margin-top:16px"></div>
${siteKey ? '' : '<div class="hint">Verification is not set up on the server (TURNSTILE_SITE_KEY is missing). Uploads will fail until the admin fixes this.</div>'}
<button type="submit">Submit for approval</button>
</form>
<div id="status"></div>
<script>
function loadSavedFields() {
  try {
    const name = localStorage.getItem('builderName');
    if (name) document.querySelector('input[name="builder"]').value = name;
    const code = localStorage.getItem('deleteCode');
    if (code) document.querySelector('input[name="deletecode"]').value = code;
    if (localStorage.getItem('agreeRules') === 'yes') document.getElementById('agree').checked = true;
  } catch (e) {}
}
function saveField(key, value, valid) {
  try {
    if (value && valid) localStorage.setItem(key, value);
    else if (!value) localStorage.removeItem(key);
  } catch (e) {}
}
let tsToken = '';
let tsIssued = 0;
let tsWaiters = [];
function onTsOk(token) {
  tsToken = token;
  tsIssued = Date.now();
  const waiting = tsWaiters;
  tsWaiters = [];
  waiting.forEach((f) => f(token));
}
function onTsExpired() { tsToken = ''; }
function onTsError() { tsToken = ''; }
function waitForToken(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), ms);
    tsWaiters.push((t) => { clearTimeout(timer); resolve(t); });
  });
}
async function freshToken(status) {
  const age = (Date.now() - tsIssued) / 1000;
  if (tsToken && age < 120) return tsToken;
  status.textContent = 'Verifying... (if a box appears, tick it)';
  tsToken = '';
  resetTurnstile();
  return await waitForToken(25000);
}
function updateFileButtons() {
  document.querySelectorAll('.file').forEach((box) => {
    const input = box.querySelector('input[type="file"]');
    const btn = box.querySelector('.filebtn');
    if (input.files && input.files[0]) {
      btn.textContent = '✓ ' + input.files[0].name + '   ✎ change';
      btn.className = 'filebtn done';
    } else {
      btn.textContent = 'Choose file';
      btn.className = 'filebtn';
    }
  });
}
document.querySelectorAll('.file input[type="file"]').forEach((i) => i.addEventListener('change', updateFileButtons));
updateFileButtons();
const agreeBox = document.getElementById('agree');
const submitBtn = document.querySelector('#f button[type="submit"]');
function updateSubmitState() { submitBtn.disabled = !agreeBox.checked; }
agreeBox.addEventListener('change', () => {
  updateSubmitState();
  try {
    if (agreeBox.checked) localStorage.setItem('agreeRules', 'yes');
    else localStorage.removeItem('agreeRules');
  } catch (e) {}
});
updateSubmitState();
loadSavedFields();
updateSubmitState();
document.querySelector('input[name="builder"]').addEventListener('input', (ev) => {
  const v = ev.target.value.trim();
  saveField('builderName', v, true);
});
document.querySelector('input[name="deletecode"]').addEventListener('input', (ev) => {
  const v = ev.target.value.trim();
  saveField('deleteCode', v, /^[0-9]{6}$/.test(v));
});
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const status = document.getElementById('status');
  btn.disabled = true;
  status.textContent = 'Uploading...';
  let stage = 'preparing the form';
  try {
    const form = new FormData(e.target);
    const token = await freshToken(status);
    if (!token) {
      status.textContent = 'The verification did not finish. Wait for the green check mark or reload the page, then press Submit again.';
      updateSubmitState();
      return;
    }
    form.set('cf-turnstile-response', token);
    status.textContent = 'Uploading...';
    for (const name of ['image1', 'image2', 'image3']) {
      const input = e.target.querySelector('input[name="' + name + '"]');
      if (input.files && input.files[0]) {
        stage = 'reading image ' + input.files[0].name;
        const compressed = await compressImage(input.files[0]);
        form.set(name, compressed, name + '.jpg');
      } else {
        form.delete(name);
      }
    }
    stage = 'sending to the server';
    const resp = await fetch('/upload', { method: 'POST', body: form });
    stage = 'reading the server answer';
    let text = await resp.text();
    const tokenAge = Math.round((Date.now() - tsIssued) / 1000);
    tsToken = '';
    if (!resp.ok && text.indexOf('[') >= 0) text += ' (verification age ' + tokenAge + 's)';
    status.textContent = text;
    if (resp.ok) {
      e.target.reset();
      loadSavedFields();
      updateFileButtons();
      updateSubmitState();
    }
    resetTurnstile();
  } catch (err) {
    const why = err && err.message ? err.message : 'unknown error';
    status.textContent = 'Something went wrong while ' + stage + ' (' + why + '). Try a smaller JPG image, or tell the admin this message.';
    resetTurnstile();
  }
  updateSubmitState();
});

function resetTurnstile() {
  try {
    if (typeof turnstile !== 'undefined') turnstile.reset();
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
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image compression failed, the image may be too large')), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('this image cannot be opened by the browser'));
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
  try {
    const res = await handleUploadSubmitInner(request, env, ctx);
    if (res.status === 400 || (res.status === 429 && res.headers.get("x-blocked") !== "1")) {
      const key = await ipBanKey(request.headers.get("CF-Connecting-IP") || "unknown", env);
      if (key) await recordRejection(env, "ip", key.slice(7), key.slice(7, 11));
    }
    return res;
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("handleUploadSubmit failed: " + msg);
    return new Response("Server error while saving your submission: " + msg.slice(0, 120), { status: 500 });
  }
}

async function handleUploadSubmitInner(request, env, ctx) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ownIpKey = await ipBanKey(ip, env);
  if (await isBanned(env, [ownIpKey])) {
    return new Response("Uploads from this connection are blocked.", { status: 403 });
  }
  if (ownIpKey) {
    const left = await lockSecondsLeft(env, `lock:ip:${ownIpKey.slice(7)}`);
    if (left > 0) {
      return new Response(`Too many rejected uploads. Please try again in ${Math.max(1, Math.ceil(left / 60))} minutes.`, {
        status: 429,
        headers: { "x-blocked": "1" }
      });
    }
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return new Response("Invalid form submission.", { status: 400 });
  }

  if (form.get("agree") !== "yes") {
    return new Response("Could not accept this submission: you must agree to the upload rules first.", { status: 400 });
  }

  const turnstileToken = form.get("cf-turnstile-response");
  const turnstile = await verifyTurnstile(turnstileToken, ip, env);
  if (!turnstile.ok) {
    console.error("turnstile failed: " + turnstile.codes.join(","));
    return new Response(turnstileMessage(turnstile.codes), { status: 400 });
  }

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return new Response("Please wait a minute before submitting again.", { status: 429 });
  }

  const name = (form.get("name") || "Unnamed Corvette").toString().slice(0, 80);
  const builder = (form.get("builder") || "").toString().trim().slice(0, 80);
  const shipFile = form.get("ship");
  const imageFiles = [form.get("image1"), form.get("image2"), form.get("image3")].filter((f) => f instanceof File);

  if (!builder) {
    return new Response("Could not accept this submission: your name is required.", { status: 400 });
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
    if (!/^image\//.test(f.type || "")) problems.push(`${f.name} is not an image`);
  }

  if (problems.length) {
    return new Response(`Could not accept this submission: ${problems.join(", ")}.`, { status: 400 });
  }

  const patreonCheck = classifyLinks(form.get("youtube"), form.get("patreon"), form.get("link"));
  if (!patreonCheck.ok) {
    return new Response(`Could not accept this submission: ${patreonCheck.error}.`, { status: 400 });
  }

  const deleteCode = normalizeDeleteCode(form.get("deletecode"));
  if (deleteCode && !DELETE_CODE_RE.test(deleteCode)) {
    return new Response("Could not accept this submission: the delete code must be exactly 6 digits.", { status: 400 });
  }
  if (deleteCode && !deleteCodesReady(env)) {
    return new Response("Delete codes are not available right now. Leave the delete code empty or try again later.", { status: 503 });
  }

  const shipBytes = new Uint8Array(await shipFile.arrayBuffer());
  const imageBufs = [];
  for (const f of imageFiles) imageBufs.push(await f.arrayBuffer());

  const staged = await stageSubmission(
    { name, submitter: builder, patreonUrl: patreonCheck.patreonUrl, youtubeUrl: patreonCheck.youtubeUrl, shipBytes, imageBufs, deleteCode, ipKey: ownIpKey },
    env
  );
  if (!staged.ok) {
    return new Response(`Could not accept this ship file: ${staged.error}.`, { status: 400 });
  }
  const slug = staged.slug;

  ctx.waitUntil(
    (async () => {
      const embed = {
        title: name,
        color: 0x5b9bd5,
        fields: [
          { name: "Submitted by", value: `${builder} (via website)`, inline: true },
          ...linkFields(patreonCheck.youtubeUrl, patreonCheck.patreonUrl),
          { name: "Objects", value: `${staged.meta.objectCount} \u00b7 utility score ${staged.meta.score}/10`, inline: true },
          ...(await approvalExtraFields(slug, env, staged.check, imageBufs.length))
        ]
      };
      const posted = await postApprovalMessage(env, embed, slug, imageBufs[0]);
      if (!posted) console.error("approval message could not be posted for " + slug + " - use /pending");
    })()
  );

  return new Response("Thanks! Your Corvette was submitted for approval.", { status: 200 });
}

let d1SchemaReady = false;

async function ensureD1(env) {
  if (d1SchemaReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS pending (slug TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, meta TEXT, PRIMARY KEY (slug, part)) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS dl_seen (ship TEXT NOT NULL, kind TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (ship, kind, hash)) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID")
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
  const who = kind === "id" ? "visitor" : kind === "ip" ? "website visitor" : "Discord user";
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

async function recordDownloadStat(env, id, installId) {
  if (!env.DB || !env.DELETE_PEPPER) return;
  const idHash = (await hashDeleteCode(`dlid:${id}`, installId.toLowerCase(), env)).slice(0, 32);
  await ensureD1(env);
  const seen = await env.DB.prepare("SELECT 1 AS x FROM dl_seen WHERE ship = ? AND kind = 'id' AND hash = ?").bind(id, idHash).first();
  if (seen) return;
  const hourKey = `cap:${id}:${Math.floor(Date.now() / 3600000)}`;
  const dayKey = `capd:${id}:${Math.floor(Date.now() / 86400000)}`;
  const capHour = await env.DB.prepare("SELECT n FROM counters WHERE k = ?").bind(hourKey).first();
  const capDay = await env.DB.prepare("SELECT n FROM counters WHERE k = ?").bind(dayKey).first();
  if ((capHour && capHour.n >= STAT_CAP_PER_HOUR) || (capDay && capDay.n >= STAT_CAP_PER_DAY)) return;

  const found = await findInIndex(env, id);
  if (!found) return;
  found.entry.downloads = (found.entry.downloads || 0) + 1;
  await writeShard(env, found.shard, `Track download: ${id}`);

  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO dl_seen (ship, kind, hash) VALUES (?, 'id', ?)").bind(id, idHash),
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
    recordDownloadStat(env, id, installId).catch((err) => {
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
  const submitCommand = {
    name: "submit",
    description: "Submit a Corvette to the community library",
    options: [
      { name: "name", description: "Name for this Corvette", type: 3, required: true },
      { name: "ship", description: "The .nmsship or .json ship file", type: 11, required: true },
      { name: "image1", description: "A preview screenshot", type: 11, required: true },
      { name: "agree", description: "Set to True: I built this myself and I agree to the upload rules.", type: 5, required: true },
      { name: "image2", description: "Extra screenshot (optional)", type: 11, required: false },
      { name: "image3", description: "Extra screenshot (optional)", type: 11, required: false },
      { name: "youtube", description: "Your YouTube link for this ship (optional)", type: 3, required: false },
      { name: "patreon", description: "Your Patreon link (optional)", type: 3, required: false },
      {
        name: "delete_code",
        description: "Optional 6-digit delete code. Random code, only for this. Never use a real code.",
        type: 3, required: false, min_length: 6, max_length: 6
      }
    ]
  };
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
    description: "Admin only: ban the submitter of a ship from uploading and counting downloads",
    options: [
      { name: "ship", description: "Start typing a ship name or builder and pick the ship", type: 3, required: true, autocomplete: true }
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
    { method: "PUT", body: JSON.stringify([submitCommand, deleteCommand, banCommand, unbanCommand, pendingCommand, recalcCommand]) }
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
  await addBan(env, owner.ipKey, owner.label, "banned by admin");
  await addBan(env, owner.userKey, owner.label, "banned by admin");
  const parts = [];
  if (owner.ipKey) parts.push("website connection");
  if (owner.userKey) parts.push("Discord user");
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
  if (interaction.data.name !== "submit") {
    return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: "Unknown command.", flags: 64 } });
  }
  return handleSubmitCommand(interaction, env, ctx);
}

async function handleSubmitCommand(interaction, env, ctx) {
  const res = await handleSubmitInner(interaction, env, ctx);
  try {
    const data = await res.clone().json();
    const content = (data && data.data && data.data.content) || "";
    const user = interaction.member?.user || interaction.user;
    if (user && content.startsWith("Could not accept")) {
      await recordRejection(env, "user", user.id, user.id.slice(-4));
    }
  } catch (e) {}
  return res;
}

async function handleSubmitInner(interaction, env, ctx) {
  const opts = {};
  for (const o of interaction.data.options || []) opts[o.name] = o.value;
  const attachments = interaction.data.resolved?.attachments || {};
  const shipAtt = attachments[opts.ship];
  const imgAtts = [attachments[opts.image1], attachments[opts.image2], attachments[opts.image3]].filter(Boolean);
  const name = (opts.name || "Unnamed Corvette").slice(0, 80);

  if (opts.agree !== true) {
    return ephemeral(`Could not accept this submission: you must agree to the upload rules. Read them here: ${workerOrigin}/upload`);
  }

  const problems = [];
  if (!shipAtt) problems.push("no ship file attached");
  if (imgAtts.length === 0) problems.push("no image attached");
  if (shipAtt && shipAtt.size > 3 * 1024 * 1024) problems.push("ship file is larger than 3 MB");
  if (shipAtt && !/\.(nmsship|nmsbase|nmsprefab|json|txt)$/i.test(shipAtt.filename)) problems.push("ship file must be .nmsship, .nmsbase, .nmsprefab, .json or .txt");
  for (const a of imgAtts) {
    if (a.size > 8 * 1024 * 1024) problems.push(`${a.filename} is larger than 8 MB`);
    if (!/^image\//.test(a.content_type || "")) problems.push(`${a.filename} is not an image`);
  }

  if (problems.length) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Could not accept this submission: ${problems.join(", ")}.`, flags: 64 }
    });
  }

  const patreonCheck = classifyLinks(opts.youtube, opts.patreon, opts.link);
  if (!patreonCheck.ok) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Could not accept this submission: ${patreonCheck.error}.`, flags: 64 }
    });
  }

  const deleteCode = normalizeDeleteCode(opts.delete_code);
  if (deleteCode && !DELETE_CODE_RE.test(deleteCode)) {
    return ephemeral("Could not accept this submission: the delete code must be exactly 6 digits.");
  }
  if (deleteCode && !deleteCodesReady(env)) {
    return ephemeral("Delete codes are not available right now. Submit again without a delete code or try later.");
  }

  const submitUser = interaction.member?.user || interaction.user;
  if (submitUser && (await isBanned(env, [userBanKey(submitUser.id)]))) {
    return ephemeral("You are not allowed to submit Corvettes to this library.");
  }
  if (submitUser) {
    const left = await lockSecondsLeft(env, `lock:user:${submitUser.id}`);
    if (left > 0) {
      return ephemeral(`Too many rejected submissions. Please try again in ${Math.max(1, Math.ceil(left / 60))} minutes.`);
    }
  }

  ctx.waitUntil(
    (async () => {
      const submitter = interaction.member?.user || interaction.user;

      let shipBytes, imageBufs;
      try {
        shipBytes = new Uint8Array(await (await fetch(shipAtt.url)).arrayBuffer());
        imageBufs = [];
        for (const a of imgAtts) imageBufs.push(await (await fetch(a.url)).arrayBuffer());
      } catch (err) {
        console.error("could not fetch discord attachments: " + (err && err.message ? err.message : String(err)));
        await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`, env, {
          method: "POST",
          body: JSON.stringify({ content: "Could not read your attachments. Please submit again.", flags: 64 })
        });
        return;
      }

      const staged = await stageSubmission(
        { name, submitter: submitter.username || "", patreonUrl: patreonCheck.patreonUrl, youtubeUrl: patreonCheck.youtubeUrl, shipBytes, imageBufs, deleteCode, userKey: userBanKey(submitter.id) },
        env
      );

      if (!staged.ok) {
        await discordApi(`/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`, env, {
          method: "POST",
          body: JSON.stringify({ content: `Could not accept this submission: ${staged.error}.`, flags: 64 })
        });
        return;
      }

      const embed = {
        title: name,
        color: 0x5b9bd5,
        fields: [
          { name: "Submitted by", value: `<@${submitter.id}> (${submitter.username})`, inline: true },
          ...linkFields(patreonCheck.youtubeUrl, patreonCheck.patreonUrl),
          { name: "Objects", value: `${staged.meta.objectCount} \u00b7 utility score ${staged.meta.score}/10`, inline: true },
          ...(await approvalExtraFields(staged.slug, env, staged.check, imageBufs.length))
        ]
      };
      const posted = await postApprovalMessage(env, embed, staged.slug, imageBufs[0]);
      if (!posted) console.error("approval message could not be posted for " + staged.slug + " - use /pending");
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

  if (action === "reject" || action === "rejban") {
    ctx.waitUntil(
      (async () => {
        let banNote = "";
        if (action === "rejban") {
          const owner = await getSubmissionOwner(slug, env);
          if (owner) {
            await addBan(env, owner.ipKey, owner.label, "rejected and banned");
            await addBan(env, owner.userKey, owner.label, "rejected and banned");
            banNote = " and banned";
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
      if (url.pathname === "/upload") return handleUploadPage(env);
      return new Response("Corvette Library bot is running.", { status: 200 });
    }

    if (request.method === "POST") {
      if (url.pathname === "/upload") return handleUploadSubmit(request, env, ctx);
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
