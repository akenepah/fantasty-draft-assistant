import { matchKeyFor } from "./projections";
import type {
  CategoryKey,
  Position,
  ProjectionDataset,
  ProjectionRow,
  StatLine,
} from "./types";

/**
 * A bundled sample projection set, so the app is usable before anyone has a
 * workbook to hand.
 *
 * It is a normal `ProjectionDataset` and travels the same import, merge and
 * scoring path as a real upload — nothing downstream knows or cares that it
 * came from here. Both sources are labelled "Sample" in the UI so the
 * numbers are never mistaken for a real analyst's.
 *
 * Two sources ship rather than one so that consensus and
 * primary-supplemental blending are exercised for real, including the case
 * that matters most: the second analyst deliberately does not publish shots
 * or faceoffs, and those gaps must stay unknown rather than becoming zero.
 */

const POOL = [
  "Connor McDavid|C|EDM",
  "Nathan MacKinnon|C|COL",
  "Nikita Kucherov|RW|TBL",
  "Auston Matthews|C|TOR",
  "David Pastrnak|RW|BOS",
  "Cale Makar|D|COL",
  "Quinn Hughes|D|VAN",
  "Leon Draisaitl|C,LW|EDM",
  "Kirill Kaprizov|LW|MIN",
  "Brady Tkachuk|LW|OTT",
  "Jack Eichel|C|VGK",
  "Mikko Rantanen|RW|DAL",
  "Matthew Tkachuk|LW,RW|FLA",
  "Artemi Panarin|LW|NYR",
  "Kyle Connor|LW|WPG",
  "Sam Reinhart|C,RW|FLA",
  "Jason Robertson|LW|DAL",
  "Tage Thompson|C,RW|BUF",
  "William Nylander|RW,C|TOR",
  "Sidney Crosby|C|PIT",
  "Brayden Point|C|TBL",
  "Zach Werenski|D|CBJ",
  "Roman Josi|D|NSH",
  "Adam Fox|D|NYR",
  "Igor Shesterkin|G|NYR",
  "Connor Hellebuyck|G|WPG",
  "Jack Hughes|C|NJD",
  "Tim Stutzle|C,LW|OTT",
  "Elias Pettersson|C|VAN",
  "Filip Forsberg|LW|NSH",
  "Mitch Marner|RW|VGK",
  "Clayton Keller|RW,LW|UTA",
  "Wyatt Johnston|C,RW|DAL",
  "Dylan Larkin|C|DET",
  "Robert Thomas|C|STL",
  "Nick Suzuki|C|MTL",
  "Cole Caufield|RW|MTL",
  "Lucas Raymond|RW,LW|DET",
  "Matty Beniers|C|SEA",
  "Seth Jarvis|RW,C|CAR",
  "Andrei Svechnikov|LW|CAR",
  "Sebastian Aho|C|CAR",
  "Aleksander Barkov|C|FLA",
  "Carter Verhaeghe|LW,C|FLA",
  "Sam Bennett|C|FLA",
  "Evan Bouchard|D|EDM",
  "Victor Hedman|D|TBL",
  "Rasmus Dahlin|D|BUF",
  "Miro Heiskanen|D|DAL",
  "Devon Toews|D|COL",
  "Jake Oettinger|G|DAL",
  "Andrei Vasilevskiy|G|TBL",
  "Ilya Sorokin|G|NYI",
  "Jordan Binnington|G|STL",
  "Kevin Fiala|LW,C|LAK",
  "Anze Kopitar|C|LAK",
  "Adrian Kempe|RW,C|LAK",
  "Brandon Hagel|LW|TBL",
  "Jake Guentzel|LW,RW|TBL",
  "Matt Boldy|LW,RW|MIN",
  "Joel Eriksson Ek|C|MIN",
  "Bo Horvat|C|NYI",
  "Mathew Barzal|C,RW|NYI",
  "Alex DeBrincat|LW,RW|DET",
  "Moritz Seider|D|DET",
  "Josh Morrissey|D|WPG",
  "Mark Scheifele|C|WPG",
  "Gabriel Vilardi|RW,C|WPG",
  "Nikolaj Ehlers|LW,RW|CAR",
  "Travis Konecny|RW,LW|PHI",
  "Matvei Michkov|RW|PHI",
  "Owen Tippett|RW,LW|PHI",
  "Logan Cooley|C|UTA",
  "Dylan Guenther|RW|UTA",
  "Nick Schmaltz|C,RW|UTA",
  "Jordan Kyrou|RW,C|STL",
  "Pavel Buchnevich|RW,LW|STL",
  "Colton Parayko|D|STL",
  "Vincent Trocheck|C|NYR",
  "Alexis Lafreniere|LW,RW|NYR",
  "Chris Kreider|LW|ANA",
  "Trevor Zegras|C,LW|PHI",
  "Leo Carlsson|C|ANA",
  "Mason McTavish|C,LW|ANA",
  "Troy Terry|RW,C|ANA",
  "Macklin Celebrini|C|SJS",
  "William Eklund|LW|SJS",
  "Tyler Toffoli|RW,LW|SJS",
  "Connor Bedard|C|CHI",
  "Tyler Bertuzzi|LW|CHI",
  "Ryan Donato|C,LW|CHI",
  "Alex Ovechkin|LW|WSH",
  "Dylan Strome|C|WSH",
  "Tom Wilson|RW|WSH",
  "John Carlson|D|WSH",
  "Jake Sanderson|D|OTT",
  "Drake Batherson|RW|OTT",
  "Josh Norris|C|BUF",
  "Alex Tuch|RW,LW|BUF",
  "JJ Peterka|LW,RW|UTA",
  "Matthew Knies|LW|TOR",
  "John Tavares|C,LW|TOR",
  "Morgan Rielly|D|TOR",
  "Bowen Byram|D|BUF",
  "Owen Power|D|BUF",
  "Charlie McAvoy|D|BOS",
  "Pavel Zacha|C,LW|BOS",
  "Morgan Geekie|RW,C|BOS",
  "Elias Lindholm|C|BOS",
  "Rickard Rakell|RW,LW|PIT",
  "Bryan Rust|RW|PIT",
  "Erik Karlsson|D|PIT",
  "Kris Letang|D|PIT",
  "Jesper Bratt|LW,RW|NJD",
  "Nico Hischier|C|NJD",
  "Dougie Hamilton|D|NJD",
  "Timo Meier|RW,LW|NJD",
  "Filip Gustavsson|G|MIN",
  "Linus Ullmark|G|OTT",
  "Darcy Kuemper|G|LAK",
  "Logan Thompson|G|WSH",
  "Mackenzie Blackwood|G|COL",
  "Adin Hill|G|VGK",
  "Sergei Bobrovsky|G|FLA",
  "Joseph Woll|G|TOR",
  "Karel Vejmelka|G|UTA",
  "Thatcher Demko|G|VAN",
  "Stuart Skinner|G|EDM",
  "Juuse Saros|G|NSH",
  "Jeremy Swayman|G|BOS",
  "Dustin Wolf|G|CGY",
  "Lukas Dostal|G|ANA",
  "Yaroslav Askarov|G|SJS",
  "Spencer Knight|G|CHI",
  "Pyotr Kochetkov|G|CAR",
  "Anthony Stolarz|G|TOR",
  "Elvis Merzlikins|G|CBJ",
  "Sam Montembeault|G|MTL",
  "Ilya Samsonov|G|VGK",
  "Alex Lyon|G|BUF",
  "Cam Talbot|G|DET",
  "Joey Daccord|G|SEA",
  "Kevin Lankinen|G|VAN",
  "Shea Theodore|D|VGK",
  "Noah Dobson|D|MTL",
  "Lane Hutson|D|MTL",
  "Brock Faber|D|MIN",
  "Vince Dunn|D|SEA",
  "Jaccob Slavin|D|CAR",
  "Brandon Montour|D|SEA",
  "MacKenzie Weegar|D|CGY",
  "Luke Hughes|D|NJD",
  "Jake Walman|D|EDM",
  "Simon Edvinsson|D|DET",
  "Jackson LaCombe|D|ANA",
  "Alex Vlasic|D|CHI",
  "Josh Manson|D|COL",
  "Ryan McDonagh|D|NSH",
  "Zach Whitecloud|D|VGK",
  "Nick Jensen|D|OTT",
  "Zach Hyman|LW,RW|EDM",
  "Michael Bunting|LW|NSH",
  "Warren Foegele|LW|LAK",
  "Anthony Beauvillier|LW,C|WSH",
  "Jared McCann|LW,C|SEA",
  "Jaden Schwartz|RW,LW|SEA",
  "Kirill Marchenko|RW|CBJ",
  "Adam Fantilli|C|CBJ",
  "Dmitri Voronkov|LW|CBJ",
  "Nazem Kadri|C|CGY",
  "Jonathan Huberdeau|LW|CGY",
  "Rasmus Andersson|D|CGY",
  "Mikael Backlund|C|CGY",
  "Quinton Byfield|C,LW|LAK",
  "Drew Doughty|D|LAK",
  "Marco Rossi|C|MIN",
  "Kaapo Kakko|RW|SEA",
];

/** Stable 32-bit hash so the sample never shifts between renders. */
function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function noise(name: string, salt: string): number {
  return (hash(`${name}:${salt}`) % 10000) / 10000;
}

const clamp = (value: number) => Math.max(0, Math.round(value));

function skaterLine(name: string, positions: Position[], strength: number): StatLine {
  const scoring = 0.85 + noise(name, "scoring") * 0.3;
  const physical = noise(name, "physical");
  const defender = positions.includes("D") && !positions.some((p) => p !== "D");
  const centre = positions.includes("C");

  if (defender) {
    return {
      G: clamp((2 + 24 * strength) * scoring),
      A: clamp((14 + 54 * strength) * scoring),
      PPP: clamp((3 + 32 * strength) * scoring),
      SOG: clamp((85 + 175 * strength) * scoring),
      HIT: clamp(38 + physical * 140),
      BLK: clamp(72 + noise(name, "blk") * 90),
      PIM: clamp(20 + noise(name, "pim") * 62),
      FOW: clamp(noise(name, "fow") * 6),
      PM: Math.round(-10 + strength * 32 + noise(name, "pm") * 12),
    };
  }

  return {
    G: clamp((9 + 34 * strength) * scoring),
    A: clamp((13 + 61 * strength) * scoring),
    PPP: clamp((5 + 38 * strength) * scoring),
    SOG: clamp((105 + 215 * strength) * scoring),
    HIT: clamp(24 + physical * 170),
    BLK: clamp(18 + noise(name, "blk") * 34),
    PIM: clamp(14 + noise(name, "pim") * 62),
    FOW: centre ? clamp(320 + strength * 780) : clamp(10 + noise(name, "fow") * 70),
    PM: Math.round(-8 + strength * 30 + noise(name, "pm") * 10),
  };
}

function goalieLine(name: string, strength: number): StatLine {
  const workload = 0.85 + noise(name, "workload") * 0.3;
  return {
    W: clamp((11 + 25 * strength) * workload),
    SV: clamp((880 + 880 * strength) * workload),
    SVPCT: Number((0.888 + strength * 0.031 + noise(name, "svp") * 0.004).toFixed(3)),
    GAA: Number((3.32 - strength * 0.95 - noise(name, "gaa") * 0.12).toFixed(2)),
    SO: clamp(strength * 6 + noise(name, "so") * 2),
  };
}

/** Values the second sample analyst does not publish at all. */
const SOURCE_B_OMITS: CategoryKey[] = ["SOG", "FOW"];

function buildRows(variant: "a" | "b"): ProjectionRow[] {
  return POOL.map((entry, index) => {
    const [name, positionField, team] = entry.split("|");
    const positions = positionField.split(",") as Position[];
    const rank = index + 1;
    const strength = Math.max(0.12, 1 - (rank - 1) / (POOL.length + 20));

    const base = positions.includes("G")
      ? goalieLine(name, strength)
      : skaterLine(name, positions, strength);

    const stats: StatLine = {};
    for (const [key, value] of Object.entries(base) as [CategoryKey, number][]) {
      if (variant === "b" && SOURCE_B_OMITS.includes(key)) continue;
      if (variant === "a") {
        stats[key] = value;
        continue;
      }
      // The second analyst reads the same players slightly differently.
      const drift = 0.94 + noise(`${name}:${key}`, "drift") * 0.12;
      const scaled = value * drift;
      stats[key] =
        key === "SVPCT" || key === "GAA" ? Number(scaled.toFixed(key === "SVPCT" ? 3 : 2)) : Math.round(scaled);
    }

    const rankDrift = variant === "a" ? 0 : Math.round((noise(name, "rank") - 0.5) * 8);
    const adpDrift = Math.round((noise(name, "adp") - 0.45) * Math.max(6, rank * 0.4));

    return {
      matchKey: matchKeyFor(name),
      name,
      team,
      positions,
      rank: Math.max(1, rank + rankDrift),
      adp: Math.max(1, rank + adpDrift),
      gamesPlayed: 68 + Math.round(noise(name, "gp") * 14),
      stats,
    };
  });
}

function dataset(variant: "a" | "b"): ProjectionDataset {
  const rows = buildRows(variant);
  return {
    source: {
      id: `sample-${variant}`,
      analyst: variant === "a" ? "Sample Analyst A" : "Sample Analyst B",
      projectionSet: variant === "a" ? "Sample 2026–27 projections" : "Sample 2026–27 rankings",
      season: "2026–27",
      fileName: variant === "a" ? "sample-analyst-a.csv" : "sample-analyst-b.csv",
      sheetName: "Skaters & Goalies",
      importedAt: "2026-09-01T00:00:00.000Z",
      sample: true,
      rowCount: rows.length,
    },
    rows,
  };
}

export function sampleDatasets(): ProjectionDataset[] {
  return [dataset("a"), dataset("b")];
}
