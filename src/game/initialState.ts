import type { GameState, Territory, Unit, UnitType, Faction, Nation, Bonds, Terrain, CanalId } from "./types";
import { PLAYER_ORDER, emptyBonds, freshEconomyFlags } from "./types";
import { MAP_SHAPES } from "./mapShapes";
import { MAP_SUBDIVISIONS } from "./mapSubdivisions";

let unitCounter = 0;
const mkUnit = (type: UnitType, owner: Faction): Unit => ({
  id: `u${++unitCounter}`,
  type,
  owner,
  movedThisTurn: false,
});

interface Seed {
  id: string;
  name: string;
  points: string;
  centroid: { x: number; y: number };
  adjacent: string[];
  owner: Faction;
  ipc: number;
  units?: Array<[UnitType, Faction, number]>;
  isSea?: boolean;
  terrain?: Terrain;
  canal?: CanalId;
}

// Phase 7 terrain — rulebook deserts / mountains / jungle / canals, pinned to
// the real-world territories they describe.
const TERRAIN_BY_ID: Record<string, { terrain?: Terrain; canal?: CanalId }> = {
  // Deserts — vehicles pass through but cannot stop.
  af_sah_w: { terrain: "desert" }, // Western Sahara
  af_sah_e: { terrain: "desert" }, // Central Sahara
  af_lib: { terrain: "desert" }, // Libya & Sinai
  as_ara: { terrain: "desert", canal: "suez" }, // Arabia — the map's Suez: its
  // two coasts are 17 sea tiles apart, so a controlled crossing is the
  // Mediterranean→Indian Ocean shortcut.
  as_mon: { terrain: "desert" }, // Mongolia (Gobi)
  au_nt: { terrain: "desert" }, // Northern Territory (outback)
  // Mountains — infantry, AA and zeppelins only.
  as_cau: { terrain: "mountain" }, // Caucasus & Anatolia
  as_kaz: { terrain: "mountain" }, // Central Asia (Pamir / Tian Shan)
  as_ura: { terrain: "mountain" }, // Urals
  as_kam: { terrain: "mountain" }, // Kamchatka
  sa_per: { terrain: "mountain" }, // Peru (Andes)
  sa_chl: { terrain: "mountain" }, // Chile (Andes)
  // Jungle — infantry, AA and zeppelins only; F.O.B. needed to build infantry.
  sa_amz: { terrain: "jungle" }, // Amazonia
  af_con: { terrain: "jungle" }, // Congo
  as_sea: { terrain: "jungle" }, // Southeast Asia
  au_sum: { terrain: "jungle" }, // Sumatra & Java
  au_bor: { terrain: "jungle" }, // Borneo & Sulawesi
  au_png: { terrain: "jungle" }, // New Guinea
  am1: { terrain: "jungle", canal: "panama" }, // Central America — Panama Canal
};

// North America — silhouette traced to match a real world-map reference.
// Shared coastline points (Great Lakes notch, Hudson Bay, Labrador bulge,
// jagged BC coast, US Pacific & Gulf coasts, Florida, Maine bump, Arctic
// archipelago) are defined as constants and reused across neighbouring
// polygons so borders line up perfectly.
//
// viewBox: -40 -360  →  1440 880

// --- US-Canada border (49th parallel with Great Lakes dip) ---
// Listed W → E. Shared by US t1..t5 (as their north edge) and Canada ca1..ca5
// (as their south edge, reversed).
const BORDER_W_to_E =
  "180,222 260,221 320,221 380,222 " +                          // t1 / ca1
  "450,223 520,224 580,224 " +                                  // t2 / ca2
  "605,228 625,244 650,256 680,262 705,262 725,256 745,248 770,238 780,232 " + // t3 / ca3 (Great Lakes)
  "810,228 850,228 900,228 940,228 980,228 " +                  // t4 / ca4
  "1040,229 1100,230 1180,231 1240,232";                        // t5 / ca5

// --- Hudson Bay (concave notch into Canada). Shared by ca3 (W shore),
//     ca4 (E shore), and ca7 (north opening).
//     Bay opens upward between x=700 and x=820 at y=40.
//     CW order from NE bay corner.
const BAY_NE = "820,40";
const BAY_E1 = "830,55";
const BAY_E2 = "842,90";
const BAY_E3 = "835,130";
const BAY_SE = "815,165";
const BAY_S  = "780,175";
const BAY_SW = "740,160";
const BAY_W2 = "715,125";
const BAY_W1 = "705,80";
const BAY_NW = "700,40";

// --- Hudson Bay ocean polygon (purely decorative — same fill as ocean so the
//     notch reads as water on the map; pointer events disabled so it never
//     intercepts clicks).
export const HUDSON_BAY_POINTS = [
  BAY_NW, BAY_W1, BAY_W2, BAY_SW, BAY_S, BAY_SE, BAY_E3, BAY_E2, BAY_E1, BAY_NE,
].join(" ");

const SEEDS: Seed[] = [
  // ===== Alaska — detailed silhouette, attached to Canada via the panhandle =====
  {
    id: "ak1",
    name: "Alaska",
    points: [
      "-40,-180", "20,-200", "90,-205", "150,-195", "175,-170",
      "180,-130", "175,-90", "170,-60",
      "175,-30", "185,0", "195,25", "180,40",
      "150,38", "120,42", "85,48", "50,55",
      "20,60", "0,52", "-15,65", "-35,55",
      "-55,70", "-90,82", "-130,90", "-165,88", "-180,78",
      "-170,68", "-130,72", "-95,65", "-65,52", "-45,40",
      "-40,15", "-55,-10", "-45,-40", "-60,-70",
      "-50,-95", "-30,-110",
      "-50,-130", "-60,-150", "-45,-165",
    ].join(" "),
    centroid: { x: 30, y: -50 },
    adjacent: ["ca1", "ca6"],
    owner: "neutral",
    ipc: 3,
  },

  // ===== Canada =====
  {
    id: "ca1", // British Columbia / Yukon — jagged Pacific coast
    name: "Canada West",
    points: [
      "180,222",                                  // SE corner (joins t1/ca2)
      // jagged BC coast going N (west edge)
      "168,200", "175,170", "160,140", "172,108", "165,75", "180,40",
      // north edge → ca6
      "380,40",
      // east edge → ca2
      "380,222",
    ].join(" "),
    centroid: { x: 270, y: 130 },
    adjacent: ["ak1", "ca2", "ca6", "t1"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "ca2", // Prairies
    name: "Canada Prairies",
    points: "380,222 380,40 580,40 580,224",
    centroid: { x: 480, y: 130 },
    adjacent: ["ca1", "ca3", "ca6", "t2"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "ca3", // Manitoba / Ontario — wraps W & S of Hudson Bay
    name: "Canada Central",
    points: [
      "580,224",                                  // SW (shared w/ t3)
      // north along ca2 border
      "580,40",
      // east along ca6/ca7 north border to bay opening
      `${BAY_NW}`,
      // around the bay (W shore, then S shore east to centre)
      BAY_W1, BAY_W2, BAY_SW, BAY_S,
      // down east edge (shared with ca4)
      "780,232",
      // back west along Great Lakes dip (reversed)
      "770,238", "745,248", "725,256", "705,262", "680,262",
      "650,256", "625,244", "605,228",
    ].join(" "),
    centroid: { x: 640, y: 130 },
    adjacent: ["ca2", "ca4", "ca6", "ca7", "t3"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "ca4", // Quebec — wraps E & S of Hudson Bay
    name: "Quebec",
    points: [
      "780,232",                                  // SW (shared w/ ca3)
      // up east edge of bay
      BAY_S, BAY_SE, BAY_E3, BAY_E2, BAY_E1, BAY_NE,
      // east along ca7 border
      "980,40",
      // down ca5 border
      "980,228",
      // back west along US border (t4 portion of dip)
      "940,228", "900,228", "850,228", "810,228",
    ].join(" "),
    centroid: { x: 880, y: 140 },
    adjacent: ["ca3", "ca5", "ca7", "t4"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "ca5", // Maritimes / Labrador — east bulge
    name: "Maritimes",
    points: [
      "980,228",                                  // SW (shared w/ ca4)
      "980,40",
      "1240,40",
      // Labrador east coast bulging into the Atlantic
      "1295,55", "1335,90", "1352,140", "1348,200", "1320,250",
      "1295,275",                                 // Maine NE corner (shared w/ t5)
      "1240,232",                                 // back inland along border
      "1180,231", "1100,230", "1040,229",
    ].join(" "),
    centroid: { x: 1140, y: 140 },
    adjacent: ["ca4", "ca7", "t5"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "ca6", // Northwest Territories — bumpy Arctic coast
    name: "Northwest Territories",
    points: [
      "180,40",
      // jagged Arctic north coast
      "180,-30", "210,-80", "260,-130", "320,-170", "380,-210",
      "440,-225", "500,-205", "560,-235", "620,-215", "680,-240",
      // east edge with ca7
      "680,40",
    ].join(" "),
    centroid: { x: 430, y: -90 },
    adjacent: ["ak1", "ca1", "ca2", "ca3", "ca7"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "ca7", // Nunavut / Arctic — wraps north of Hudson Bay; bumpy archipelago
    name: "Nunavut",
    points: [
      "680,-240",
      // Arctic archipelago (bumpy north coast)
      "740,-260", "810,-235", "880,-265", "950,-240", "1030,-275",
      "1110,-250", "1185,-280", "1240,-255", "1295,-225", "1320,-180",
      "1300,-140", "1320,-90", "1295,-40", "1250,0", "1240,40",
      // south edge east of bay
      "980,40",
      BAY_NE,
      // around bay (E shore down, then S shore, then W shore up — reversed
      // from ca3/ca4 so winding matches)
      BAY_E1, BAY_E2, BAY_E3, BAY_SE, BAY_S, BAY_SW, BAY_W2, BAY_W1,
      BAY_NW,
      // back west along ca7 south edge to ca6 border (x = 680)
      "680,40",
      // close back up west edge to start
    ].join(" "),
    centroid: { x: 1000, y: -130 },
    adjacent: ["ca3", "ca4", "ca5", "ca6"],
    owner: "neutral",
    ipc: 2,
  },

  // ===== Row 1 — US Northern tier (Canadian border) =====
  // Each US row-1 territory's north edge uses the BORDER coordinates above,
  // so the Great Lakes dip is shared with the matching Canadian neighbour.
  {
    id: "t1",
    name: "Territory 1",
    points: "180,222 260,221 320,221 380,222 380,360 204,360 195,310",
    centroid: { x: 280, y: 290 },
    adjacent: ["t2", "t6", "ca1"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t2",
    name: "Territory 2",
    points: "380,222 450,223 520,224 580,224 580,360 380,360",
    centroid: { x: 480, y: 290 },
    adjacent: ["t1", "t3", "t7", "ca2"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "t3",
    name: "Territory 3",
    // North edge dips south through the Great Lakes
    points: "580,224 605,228 625,244 650,256 680,262 705,262 725,256 745,248 770,238 780,232 780,360 580,360",
    centroid: { x: 680, y: 305 },
    adjacent: ["t2", "t4", "t8", "ca3"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t4",
    name: "Territory 4",
    points: "780,232 810,228 850,228 900,228 940,228 980,228 980,360 780,360",
    centroid: { x: 880, y: 295 },
    adjacent: ["t3", "t5", "t9", "ca4"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "t5",
    name: "Territory 5",
    // Maine NE bump → curve down Atlantic coast
    points: "980,228 1040,229 1100,230 1180,231 1240,232 1295,275 1280,310 1265,340 1250,360 980,360",
    centroid: { x: 1110, y: 295 },
    adjacent: ["t4", "t10", "ca5"],
    owner: "neutral",
    ipc: 6,
  },

  // ===== Row 2 — Upper-middle tier =====
  {
    id: "t6",
    name: "Territory 6",
    points: "204,360 380,360 380,480 230,480 218,440 210,400",
    centroid: { x: 300, y: 420 },
    adjacent: ["t1", "t7", "t11"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "t7",
    name: "Territory 7",
    points: "380,360 580,360 580,480 380,480",
    centroid: { x: 480, y: 420 },
    adjacent: ["t2", "t6", "t8", "t12"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t8",
    name: "Territory 8",
    points: "580,360 780,360 780,480 580,480",
    centroid: { x: 680, y: 420 },
    adjacent: ["t3", "t7", "t9", "t13"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t9",
    name: "Territory 9",
    points: "780,360 980,360 980,480 780,480",
    centroid: { x: 880, y: 420 },
    adjacent: ["t4", "t8", "t10", "t14"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "t10",
    name: "Territory 10",
    // Atlantic coast curves: Chesapeake → Outer Banks
    points: "980,360 1250,360 1235,395 1220,430 1205,460 1195,478 1198,480 980,480",
    centroid: { x: 1100, y: 420 },
    adjacent: ["t5", "t9", "t15"],
    owner: "neutral",
    ipc: 6,
  },

  // ===== Row 3 — Lower-middle tier =====
  {
    id: "t11",
    name: "Territory 11",
    // West coast: jagged Pacific (Big Sur → Baja border feel)
    points: "230,480 380,480 380,620 340,620 320,620 300,615 280,605 265,585 255,565 248,540 238,510",
    centroid: { x: 310, y: 555 },
    adjacent: ["t6", "t12", "t16", "mx1"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t12",
    name: "Territory 12",
    points: "380,480 580,480 580,620 380,620",
    centroid: { x: 480, y: 555 },
    adjacent: ["t7", "t11", "t13", "t16"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "t13",
    name: "Territory 13",
    points: "580,480 780,480 780,620 580,620",
    centroid: { x: 680, y: 555 },
    adjacent: ["t8", "t12", "t14", "t17"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t14",
    name: "Territory 14",
    points: "780,480 980,480 980,620 780,620",
    centroid: { x: 880, y: 555 },
    adjacent: ["t9", "t13", "t15", "t18"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "t15",
    name: "Territory 15",
    // Atlantic coast continues to Carolinas / GA
    points: "980,480 1198,480 1180,510 1160,545 1145,575 1130,605 1115,625 980,625",
    centroid: { x: 1075, y: 555 },
    adjacent: ["t10", "t14", "t19"],
    owner: "neutral",
    ipc: 6,
  },

  // ===== Row 4 — Southern tier (Gulf coast + Florida) =====
  {
    id: "t16",
    name: "Territory 16",
    // Texas: SW border slants SE; Brownsville tip at (600,765)
    points: "340,620 380,620 580,620 600,765 555,735 510,705 470,680 430,660 395,645 365,632",
    centroid: { x: 480, y: 680 },
    adjacent: ["t11", "t12", "t17", "mx1"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "t17",
    name: "Territory 17",
    // Gulf coast (LA/MS): Mississippi delta bump
    points: "580,620 780,620 785,690 790,740 760,748 735,755 705,745 680,755 640,760 615,762 600,765",
    centroid: { x: 685, y: 685 },
    adjacent: ["t13", "t16", "t18"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t18",
    name: "Territory 18",
    // AL/GA Gulf coast → Florida panhandle
    points: "780,620 980,625 1000,665 1015,695 970,710 920,720 870,728 825,740 790,740 785,690",
    centroid: { x: 890, y: 680 },
    adjacent: ["t14", "t17", "t19"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "t19",
    name: "Territory 19",
    // Florida peninsula — narrower, tapering south
    points: [
      "980,625", "1115,625",                       // top edge
      "1130,660", "1135,695", "1125,720",          // east coast top
      "1115,750", "1108,775", "1095,795",          // tapering tip
      "1080,800", "1068,790",                      // southern tip
      "1058,755", "1052,720", "1045,690",          // west coast lower
      "1035,665", "1015,695", "1000,665",          // panhandle indent
    ].join(" "),
    centroid: { x: 1075, y: 700 },
    adjacent: ["t15", "t18"],
    owner: "neutral",
    ipc: 5,
  },

  // ===== Mexico =====
  // Coastline waypoints projected from real lat/lon using the same projection
  // as South America: x = 900 + (lon + 75) * 13, y = 1140 - lat * 15
  {
    id: "mx1",
    name: "Mexico Norte",
    // Mainland Mexico from the US border down to the Isthmus of Tehuantepec,
    // PLUS the Baja California peninsula (attached at Mexicali in the north).
    points: [
      // Tijuana (US border NW corner)
      "354,652",
      // West Baja coast S to Cabo San Lucas
      "360,685", "372,720", "388,755", "408,790", "430,808", "446,797",
      // East Baja coast (Gulf of California west shore) N to Mexicali
      "442,775", "428,745", "412,712", "400,685", "405,672",
      // Cross the top of the Gulf of California to the Sonora coast
      "410,680",
      // Sonora/Sinaloa Pacific coast S to Mazatlán
      "420,712", "442,742", "462,772", "482,790", "492,795",
      // Pacific mainland SE: Puerto Vallarta → Manzanillo → Acapulco → Tehuantepec
      "507,831", "525,852", "545,872", "576,888", "600,895",
      // Internal border with mx2 W→E across the Isthmus to Coatzacoalcos (Gulf)
      "615,890", "632,880", "648,868",
      // Gulf of Mexico coast N: Veracruz → Tampico → Brownsville
      "638,840", "626,810", "613,775", "607,751",
      // US border W back toward Tijuana
      "581,727", "540,695", "490,664", "450,665", "405,668", "380,658",
    ].join(" "),
    centroid: { x: 500, y: 760 },
    adjacent: ["t11", "t16", "mx2"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "mx2",
    name: "Mexico Sur",
    // Southern Mexico: Chiapas + the Yucatán peninsula jutting NE into the Gulf.
    points: [
      // North edge — shared with mx1 across the Isthmus (E→W, reversed)
      "648,868", "632,880", "615,890", "600,895",
      // Chiapas Pacific coast SE to the Guatemala border near Tapachula
      "625,905", "655,915", "676,917",
      // Mexico–Guatemala border NE up through the Petén to the Belize tri-point
      "685,905", "695,890", "710,880", "718,873",
      // Mexico–Belize border E to the Caribbean coast
      "727,867",
      // Caribbean coast N: Tulum → Cancún → NE tip of Yucatán
      "735,852", "738,837", "744,820", "747,816",
      // North Yucatán coast W: Progreso → Campeche
      "730,815", "709,820", "695,825", "682,861",
      // Gulf coast W along Tabasco back to Coatzacoalcos
      "670,870", "658,870",
    ].join(" "),
    centroid: { x: 690, y: 870 },
    adjacent: ["mx1", "am1"],
    owner: "neutral",
    ipc: 3,
  },

  // ===== Central America =====
  // Guatemala through Panama, ending at the Panama–Colombia border.
  {
    id: "am1",
    name: "Central America",
    points: [
      // North edge — shared with mx2 along the Mexico–Guatemala/Belize border
      // (Caribbean → Pacific, reversed from mx2's southern edge)
      "727,867", "718,873", "710,880", "695,890", "685,905", "676,917",
      // Pacific coast SE: Guatemala → El Salvador → Nicaragua → Costa Rica → Panama
      "690,930", "710,948", "735,965", "765,982", "795,1000", "825,1015", "855,1025",
      // Panama–Colombia border (shared with sa_col)
      "870,1028",
      // Caribbean coast NW back through Panama → CR → Nicaragua → Honduras
      "865,1020", "845,1005", "815,995", "785,985", "755,975", "730,968", "720,955",
      // Belize Caribbean coast N back to the Mexico border
      "735,930", "740,910", "738,890", "732,875",
    ].join(" "),
    centroid: { x: 770, y: 950 },
    adjacent: ["mx2", "sa_col"],
    owner: "neutral",
    ipc: 2,
  },

  // ===== South America =====
  // Coastline waypoints projected from real lat/lon:
  //   x = 900 + (lon + 75) * 13     (lon in °, negative = west)
  //   y = 1140 - lat * 15            (lat in °, negative = south)
  // Interior junction points (P1..P7, P_PAT) are shared by 3+ territories
  // so all internal borders line up exactly.
  //
  // Coast vertices (CW from Panama border):
  //   C1=870,1013   Panama border        C32=1175,1640 Lagoa dos Patos
  //   C2=910,990    Gulf of Urabá        C33=1150,1670 Río de la Plata N
  //   C3=945,970    Cartagena            C34=1115,1685 Plata mouth
  //   C4=980,965    Barranquilla         C35=1130,1710 Mar del Plata
  //   C5=1010,970   Santa Marta          C36=1095,1735 Bahía Blanca
  //   C6=1040,980   Guajira              C37=1060,1760 Patagonian coast
  //   C7=1075,985   Punta Gallinas       C38=1030,1790 Puerto Madryn
  //   C8=1100,985   N Venezuela          C39=1005,1830 Comodoro
  //   C9=1130,985   Caracas              C40=985,1880  Santa Cruz
  //   C10=1160,990  Cumaná               C41=975,1925  Río Gallegos
  //   C11=1180,1005 Paria                C42=995,1965  TdF east
  //   C12=1170,1020 Orinoco delta        C43=985,1985  Cape Horn
  //   C13=1195,1035 E Venezuela          C44=955,1965  TdF west
  //   C14=1220,1055 Guyana coast         C45=940,1935  Magellan
  //   C15=1235,1075 Suriname             C46=925,1890  S Chile
  //   C16=1245,1095 Cabo Orange          C47=910,1830  Chiloé
  //   C17=1260,1115 N Brazil             C48=920,1770  Puerto Montt
  //   C18=1265,1140 Amazon mouth         C49=935,1700  Valdivia
  //   C19=1280,1175 São Luís             C50=945,1635  Valparaíso
  //   C20=1340,1190 Fortaleza approach   C51=955,1580  La Serena
  //   C21=1395,1210 Fortaleza            C52=960,1520  Antofagasta
  //   C22=1420,1230 Cape São Roque       C53=965,1450  Arica
  //   C23=1410,1265 Recife               C54=955,1380  Tacna
  //   C24=1395,1300 N Bahia              C55=920,1340  Chala
  //   C25=1380,1340 Salvador             C56=875,1320  Lima
  //   C26=1360,1390 S Bahia              C57=850,1270  Trujillo
  //   C27=1340,1440 Espírito Santo       C58=820,1215  Pariñas (westmost)
  //   C28=1320,1485 Rio de Janeiro       C59=835,1175  Guayaquil
  //   C29=1280,1525 Santos               C60=840,1130  Esmeraldas
  //   C30=1245,1555 Paraná coast         C61=855,1080  Buenaventura
  //   C31=1215,1590 RS coast             C62=865,1040  Cabo Corrientes
  {
    id: "sa_col",
    name: "Colombia",
    // NW corner. Caribbean coast + Pacific NW + Andes; only SA country with
    // coastlines on both oceans.
    points: "870,1013 910,990 945,970 980,965 1010,970 1050,1100 840,1130 855,1080 865,1040",
    centroid: { x: 945, y: 1030 },
    adjacent: ["am1", "sa_ven", "sa_per"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "sa_ven",
    name: "Venezuela",
    // Caribbean Venezuela south to the Orinoco interior (P2).
    points: "1010,970 1040,980 1075,985 1100,985 1130,985 1160,990 1180,1005 1170,1020 1180,1170 1050,1100",
    centroid: { x: 1100, y: 1045 },
    adjacent: ["sa_col", "sa_gui", "sa_amz"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "sa_gui",
    name: "Guianas",
    // Guyana / Suriname / French Guiana — Atlantic coast NE of the Amazon.
    points: "1170,1020 1195,1035 1220,1055 1235,1075 1245,1095 1260,1115 1265,1140 1180,1170",
    centroid: { x: 1215, y: 1090 },
    adjacent: ["sa_ven", "sa_amz"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "sa_amz",
    name: "Amazonia",
    // Vast Amazon basin: Atlantic mouth to Fortaleza, then deep interior
    // wrapping S/W around to the Andes.
    points: "1265,1140 1280,1175 1340,1190 1395,1210 1280,1290 1130,1450 1000,1450 1050,1100 1180,1170",
    centroid: { x: 1190, y: 1240 },
    adjacent: ["sa_ven", "sa_gui", "sa_brn", "sa_bra", "sa_arg", "sa_per"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "sa_brn",
    name: "Nordeste",
    // NE Brazil — sharp Cape São Roque bulge (the easternmost point of SA).
    points: "1395,1210 1420,1230 1410,1265 1395,1300 1380,1340 1280,1290",
    centroid: { x: 1370, y: 1265 },
    adjacent: ["sa_amz", "sa_bra"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "sa_bra",
    name: "Brasil",
    // Southeast Brazil — Salvador down to the Río de la Plata.
    points: "1380,1340 1360,1390 1340,1440 1320,1485 1280,1525 1245,1555 1215,1590 1175,1640 1150,1670 1080,1620 1130,1450 1280,1290",
    centroid: { x: 1265, y: 1465 },
    adjacent: ["sa_brn", "sa_amz", "sa_arg"],
    owner: "neutral",
    ipc: 6,
  },
  {
    id: "sa_arg",
    name: "La Plata",
    // Argentina + Uruguay + Paraguay — pampas, Plata estuary concavity.
    points: "1150,1670 1115,1685 1130,1710 1095,1735 1050,1700 1010,1640 1000,1450 1130,1450 1080,1620",
    centroid: { x: 1090, y: 1580 },
    adjacent: ["sa_bra", "sa_amz", "sa_chl", "sa_pat"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "sa_per",
    name: "Peru",
    // Peru + Ecuador — Pacific NW coast (Pariñas is the westernmost point
    // of SA at C58) up to the Colombia border.
    points: "840,1130 835,1175 820,1215 850,1270 875,1320 920,1340 955,1380 965,1450 1000,1450 1050,1100",
    centroid: { x: 925, y: 1290 },
    adjacent: ["sa_col", "sa_amz", "sa_chl"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "sa_chl",
    name: "Chile",
    // Long thin Pacific strip — Arica down to Puerto Montt.
    points: "965,1450 960,1520 955,1580 945,1635 935,1700 920,1770 1010,1640 1000,1450",
    centroid: { x: 965, y: 1580 },
    adjacent: ["sa_per", "sa_arg", "sa_pat"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "sa_pat",
    name: "Patagonia",
    // Southern cone tapering to Tierra del Fuego / Cape Horn.
    points: "1095,1735 1060,1760 1030,1790 1005,1830 985,1880 975,1925 995,1965 985,1985 955,1965 940,1935 925,1890 910,1830 920,1770 1010,1640 1050,1700",
    centroid: { x: 985, y: 1830 },
    adjacent: ["sa_arg", "sa_chl"],
    owner: "neutral",
    ipc: 2,
  },

  // ===== Europe & Asia =====
  // All polygons use the SAME equirectangular projection as South America:
  //   x = 900 + (lon + 75) * 13      (lon east positive)
  //   y = 1140 - lat * 15             (lat north positive)
  //
  // Coastline anchors traced from a real political world map (Eurasia panel).
  // Sample points (lon, lat → x, y):
  //   Cape St-Vincent  -9, 37      → 1758, 585
  //   Cape Finisterre  -9.3, 43    → 1754, 495
  //   Brest             -4.5, 48.4 → 1817, 414
  //   Calais             1.8, 51   → 1910, 375
  //   Lands End         -5.7, 50   → 1800, 390
  //   Cape Wrath        -5, 58.6   → 1810, 261
  //   Skagen            10.6, 57.7 → 2013, 274
  //   Nordkapp          26, 71     → 2213, 75
  //   Murmansk          33, 69     → 2304, 105
  //   Kanin Nos         43.5, 68.5 → 2441, 112
  //   Yugorsky          60, 70     → 2655, 90
  //   Taymyr (Chelyuskin) 102, 78  → 3251, -30
  //   Lena delta       127, 73     → 3576, 45
  //   Cape Dezhnev     169, 66     → 4122, 150
  //   Petropavlovsk    158.6, 53   → 3937, 345
  //   Vladivostok      131.9, 43   → 3590, 495
  //   Tokyo            139.8, 35.7 → 3692, 605
  //   Sapporo          141.3, 43.1 → 3712, 494
  //   Busan            129, 35     → 3602, 615
  //   Shanghai         121.5, 31.2 → 3505, 672
  //   Hong Kong        114, 22.3   → 3407, 805
  //   Singapore       103.8, 1.3   → 3275, 1120
  //   Saigon          106.7, 10.8  → 3312, 978
  //   Mumbai            72.9, 19   → 2853, 855
  //   C. Comorin        77.5, 8    → 2913, 1020
  //   Kolkata           88.4, 22.6 → 3054, 801
  //   Karachi           67, 25     → 2746, 765
  //   Muscat            58.5, 23.6 → 2636, 786
  //   Aden              45, 12.8   → 2460, 948
  //   Suez              32.5, 30   → 2298, 690
  //   Istanbul          29, 41.2   → 2262, 522
  //   Baku              49.9, 40.4 → 2523, 534
  //   Astrakhan         48, 46.4   → 2499, 444
  //   Moscow            37.6, 55.7 → 2379, 305

  // ---------- Europe ----------
  {
    id: "eu_ibe",
    name: "Iberia",
    // Portugal + Spain. Atlantic W coast, Cantabrian N, Mediterranean E.
    points:
      "1830,600 1822,597 1758,585 1757,560 1752,558 1764,524 1754,495 1768,489 " +
      "1836,490 1849,490 1914,504 1903,519 1869,547 1862,576 1842,588",
    centroid: { x: 1810, y: 545 },
    adjacent: ["eu_fra", "af_mag"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "eu_fra",
    name: "France",
    // Hexagonal France. Pyrenees → Atlantic → Channel → Rhine → Alps → Med.
    points:
      "1852,490 1867,468 1859,447 1817,414 1854,396 1910,375 1975,411 " +
      "1956,447 1969,484 1944,490 1914,499 1914,504",
    centroid: { x: 1895, y: 445 },
    adjacent: ["eu_ibe", "eu_ger"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "eu_bri",
    name: "British Isles",
    // Ireland + Great Britain abstracted as one landmass (Irish Sea closed).
    points:
      "1800,390 1820,384 1859,378 1891,373 1896,352 1879,346 1867,322 " +
      "1854,315 1833,300 1847,283 1834,261 1810,261 1803,289 1771,315 " +
      "1758,340 1764,361 1810,375",
    centroid: { x: 1830, y: 330 },
    adjacent: [],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "eu_ger",
    name: "Central Europe",
    // Benelux + Germany + Denmark + Czech + Austria + Switzerland.
    points:
      "1910,375 1957,372 1964,354 2014,338 2030,338 2007,318 2047,329 " +
      "2073,339 2059,353 2106,386 2132,398 2103,423 2073,442 2031,440 " +
      "1985,450 1956,447 1975,411",
    centroid: { x: 2010, y: 390 },
    adjacent: ["eu_fra", "eu_sca", "eu_pol", "eu_bal", "eu_ita"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "eu_sca",
    name: "Scandinavia",
    // Denmark + Norway + Sweden + Finland. Atlantic W, Bothnia E, Arctic N.
    points:
      "2007,318 2039,304 2110,250 2200,240 2246,229 2295,105 2213,75 " +
      "2122,96 2062,131 2010,189 1944,234 1949,256 2002,285",
    centroid: { x: 2080, y: 195 },
    adjacent: ["eu_ger", "eu_pol", "eu_mos", "eu_rus_n"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "eu_ita",
    name: "Italy",
    // Boot peninsula + Sicily merged onto the toe.
    points:
      "1991,450 2035,435 2054,432 2094,524 2109,531 2114,543 2098,533 " +
      "2078,568 2049,580 2038,575 2061,528 2037,511 2002,478",
    centroid: { x: 2050, y: 500 },
    adjacent: ["eu_ger"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "eu_bal",
    name: "Balkans",
    // Slovenia/Croatia/BiH/Serbia/Albania/Greece/Bulgaria/Romania.
    points:
      "2073,442 2103,423 2178,405 2230,417 2256,412 2249,459 2257,477 " +
      "2248,492 2262,522 2228,538 2193,570 2178,594 2167,567 2144,546 " +
      "2139,532 2121,501 2099,487",
    centroid: { x: 2175, y: 490 },
    adjacent: ["eu_ger", "eu_pol", "eu_ukr", "as_cau"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "eu_pol",
    name: "Poland & Baltics",
    // Poland + Lithuania + Latvia + Estonia + Belarus.
    points:
      "2073,339 2127,324 2152,320 2160,305 2204,285 2212,249 2258,249 " +
      "2300,345 2287,368 2202,378 2178,405 2132,398 2106,386 2059,353",
    centroid: { x: 2180, y: 330 },
    adjacent: ["eu_ger", "eu_sca", "eu_mos", "eu_ukr", "eu_bal"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "eu_mos",
    name: "Moscow",
    // Moscow basin + Karelia (western part of former Northern Russia).
    points:
      "2246,229 2295,105 2304,132 2441,112 2470,118 2470,350 " +
      "2400,345 2300,345 2258,249",
    centroid: { x: 2360, y: 240 },
    adjacent: ["eu_sca", "eu_pol", "eu_ukr", "eu_rus_n", "eu_rus_s"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "eu_rus_n",
    name: "Northern Russia",
    // Arctic coast: White Sea → Pechora → northern Urals.
    points:
      "2470,118 2577,120 2655,90 2655,135 2663,288 2655,360 2470,350",
    centroid: { x: 2560, y: 220 },
    adjacent: ["eu_sca", "eu_mos", "eu_rus_s", "as_ura"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "eu_ukr",
    name: "Ukraine",
    // Ukraine + Moldova + Belarus southern edge.
    points:
      "2287,368 2300,345 2400,345 2450,352 2450,438 2391,432 2349,459 " +
      "2310,471 2273,442 2249,459 2256,412 2289,390",
    centroid: { x: 2350, y: 405 },
    adjacent: ["eu_pol", "eu_bal", "eu_mos", "eu_rus_s"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "eu_rus_s",
    name: "Southern Russia",
    // Don / Volga basin + N Caucasus foothills.
    points: "2400,345 2450,352 2450,438 2499,444 2655,360",
    centroid: { x: 2510, y: 395 },
    adjacent: ["eu_ukr", "eu_mos", "eu_rus_n", "as_cau", "as_kaz", "as_ura"],
    owner: "neutral",
    ipc: 3,
  },

  // ---------- Asia ----------
  {
    id: "as_cau",
    name: "Caucasus & Anatolia",
    // Turkey + Georgia + Armenia + Azerbaijan. Aegean → Med → Iran → Caspian.
    points:
      "2262,522 2228,538 2237,564 2273,586 2324,588 2345,597 2428,582 " +
      "2453,555 2523,534 2502,508 2475,487 2406,486 2406,525 2362,520 " +
      "2345,510",
    centroid: { x: 2370, y: 540 },
    adjacent: ["eu_bal", "eu_rus_s", "as_lev", "as_per", "as_kaz"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "as_lev",
    name: "Levant & Mesopotamia",
    // Syria + Lebanon + Israel + Jordan + Iraq.
    points:
      "2345,597 2428,582 2467,615 2502,684 2330,697 2298,690 2324,667 " +
      "2327,658 2337,631 2340,607",
    centroid: { x: 2390, y: 645 },
    adjacent: ["as_cau", "as_ara", "as_per", "af_lib"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "as_ara",
    name: "Arabia",
    // Saudi Arabia + Yemen + Oman + UAE. Red Sea W, Aden S, Persian Gulf NE.
    points:
      "2330,697 2502,684 2531,706 2604,760 2636,786 2649,802 2577,885 " +
      "2460,948 2438,951 2386,817 2369,778 2351,714",
    centroid: { x: 2490, y: 810 },
    adjacent: ["as_lev", "as_per", "af_hor"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "as_per",
    name: "Persia",
    // Iran + Afghanistan + Pakistani Baluchistan.
    points:
      "2467,615 2523,534 2519,577 2577,585 2655,592 2746,592 2872,585 " +
      "2798,630 2746,765 2660,760 2606,732 2531,706 2502,684",
    centroid: { x: 2680, y: 660 },
    adjacent: ["as_cau", "as_lev", "as_ara", "as_kaz", "as_ind", "as_chi"],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "as_kaz",
    name: "Central Asia",
    // Kazakhstan + Uzbekistan + Turkmenistan + Kyrgyzstan + Tajikistan.
    points:
      "2499,444 2655,360 2854,315 3056,405 2945,510 2872,585 2746,592 " +
      "2655,592 2577,585 2553,486",
    centroid: { x: 2740, y: 470 },
    adjacent: [
      "eu_rus_s",
      "as_cau",
      "as_per",
      "as_ura",
      "as_wsib",
      "as_mon",
      "as_chi",
      "as_ind",
    ],
    owner: "neutral",
    ipc: 4,
  },
  {
    id: "as_ura",
    name: "Urals",
    // Ural mountains + upper Kama/Ob headwaters.
    points: "2655,90 2820,64 2820,323 2655,360 2663,288 2655,135",
    centroid: { x: 2740, y: 215 },
    adjacent: ["eu_rus_n", "eu_rus_s", "as_kaz", "as_wsib"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "as_wsib",
    name: "West Siberia",
    // Ob basin → Yenisei. Yamal/Gyda coast down to Altai.
    points:
      "2820,64 2945,45 3030,60 3095,240 3134,300 3160,375 3056,405 " +
      "2854,315 2820,323",
    centroid: { x: 2990, y: 235 },
    adjacent: ["as_ura", "as_kaz", "as_mon", "as_csib"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "as_csib",
    name: "Central Siberia",
    // Yenisei → Lena. Taymyr peninsula down to Baikal.
    points:
      "3030,60 3251,-30 3576,45 3600,46 3600,489 3591,495 3485,465 " +
      "3485,390 3225,390 3160,375 3134,300 3095,240",
    centroid: { x: 3320, y: 200 },
    adjacent: ["as_wsib", "as_mon", "as_chi", "as_fee"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "as_fee",
    name: "Russian Far East",
    // Lena → Bering / Sea of Okhotsk. Amur / Vladivostok coast.
    points:
      "3600,46 3955,60 4122,150 4226,195 3955,240 3920,246 3784,255 " +
      "3771,375 3600,489",
    centroid: { x: 3860, y: 200 },
    adjacent: ["as_csib", "as_chi", "as_kor", "as_kam"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "as_kam",
    name: "Kamchatka",
    // Peninsula hanging S into the Pacific; Sea of Okhotsk on its west side.
    points: "3940,240 4040,240 4080,300 4020,360 3960,380 3915,360 3895,300",
    centroid: { x: 3985, y: 305 },
    adjacent: ["as_fee"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "as_mon",
    name: "Mongolia",
    // Landlocked between Russia (Sayan/Baikal) and China (Gobi).
    points:
      "3056,405 3160,378 3290,378 3400,385 3485,390 3485,510 3380,495 " +
      "3290,510 3160,500 3056,510",
    centroid: { x: 3270, y: 445 },
    adjacent: ["as_kaz", "as_wsib", "as_csib", "as_chi"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "as_chi",
    name: "China",
    // Pamir → Altai → Manchuria → Yellow Sea → S China Sea → Yunnan → Tibet.
    points:
      "2872,585 3056,405 3056,510 3160,500 3290,510 3380,495 3485,510 3485,390 3680,420 3591,495 " +
      "3565,502 3537,510 3485,598 3505,672 3498,684 3476,748 3459,774 " +
      "3407,805 3329,817 3199,765 3095,727 3069,720 2945,660",
    centroid: { x: 3260, y: 620 },
    adjacent: [
      "as_kaz",
      "as_mon",
      "as_csib",
      "as_fee",
      "as_kor",
      "as_sea",
      "as_ind",
      "as_per",
    ],
    owner: "neutral",
    ipc: 7,
  },
  {
    id: "as_kor",
    name: "Korea",
    // Peninsula off Manchurian / Yellow Sea coast.
    points: "3537,510 3563,525 3615,502 3602,615 3589,622 3569,618 3557,570",
    centroid: { x: 3585, y: 565 },
    adjacent: ["as_chi", "as_fee", "as_jap"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "as_jap",
    name: "Japan",
    // Hokkaido + Honshu + Kyushu arc east of Korea.
    points:
      "3717,459 3768,490 3707,565 3692,604 3640,639 3574,675 3564,648 " +
      "3577,630 3681,571 3708,492",
    centroid: { x: 3690, y: 555 },
    adjacent: ["as_kor"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "as_ind",
    name: "India",
    // Indus → Himalayas → Bay of Bengal → Cape Comorin → Arabian Sea.
    points:
      "2746,765 2798,630 2872,585 2945,660 3069,720 3095,727 3199,765 3140,750 " +
      "3098,805 3054,801 2988,874 2949,943 2913,1020 2897,991 2879,946 " +
      "2865,907 2853,855 2851,822 2809,802",
    centroid: { x: 2940, y: 820 },
    adjacent: ["as_per", "as_kaz", "as_chi", "as_sea"],
    owner: "neutral",
    ipc: 5,
  },
  {
    id: "as_sea",
    name: "Southeast Asia",
    // Myanmar + Thailand + Laos + Cambodia + Vietnam + Malay peninsula.
    points:
      "3140,750 3199,765 3329,817 3332,898 3345,957 3312,978 3271,981 " +
      "3233,1032 3268,1083 3275,1120 3255,1107 3229,1059 3204,1021 " +
      "3207,954 3173,888 3174,810",
    centroid: { x: 3240, y: 935 },
    adjacent: ["as_ind", "as_chi", "au_sum"],
    owner: "neutral",
    ipc: 4,
  },

  // ===== Africa =====
  // Same projection as Europe/Asia. 14 territories total, carved by a
  // Maghreb line (y≈740), Sahara line (y≈860), Sahel line (y≈1140), and a
  // southern line (y≈1400); with additional N-S splits at x≈1900, x≈2290,
  // and x≈2270 in the south to break large regions into more territories.
  {
    id: "af_mag",
    name: "Maghreb",
    // Morocco + N Algeria + Tunisia + N Libya coastal strip.
    points:
      "1801,603 1985,588 2008,588 2046,647 2135,659 2150,660 2150,740 1711,740",
    centroid: { x: 1940, y: 680 },
    adjacent: ["eu_ibe", "af_lib", "af_sah_w", "af_sah_e"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_lib",
    name: "Libya & Sinai",
    // E Libya desert + W Egypt across to the Red Sea coast.
    points: "2150,660 2263,672 2298,690 2324,760 2150,760 2150,740",
    centroid: { x: 2230, y: 720 },
    adjacent: ["af_mag", "af_sah_e", "af_egy", "as_lev"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_sah_w",
    name: "Western Sahara",
    // W Sahara + Mauritania + Mali.
    points: "1711,740 1900,740 1900,860 1652,860 1654,826",
    centroid: { x: 1790, y: 800 },
    adjacent: ["af_mag", "af_sah_e", "af_gui"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "af_sah_e",
    name: "Central Sahara",
    // Niger + Chad + interior Libyan desert.
    points: "1900,740 2150,740 2150,860 1900,860",
    centroid: { x: 2020, y: 800 },
    adjacent: ["af_mag", "af_lib", "af_egy", "af_sah_w", "af_nga", "af_con"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "af_egy",
    name: "Egypt & Sudan",
    // S Egypt + Sudan, Red Sea on the east.
    points: "2150,760 2324,760 2356,846 2367,860 2150,860",
    centroid: { x: 2240, y: 810 },
    adjacent: ["af_lib", "af_sah_e", "af_hor", "af_eaf_w"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_gui",
    name: "Guinea Coast",
    // Senegal → Ivory Coast western Sahel.
    points:
      "1652,860 1900,860 1900,1050 1872,1058 1823,1061 1736,1046 1705,1013 1648,920",
    centroid: { x: 1790, y: 970 },
    adjacent: ["af_sah_w", "af_nga"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_nga",
    name: "Nigeria & Sahel",
    // Nigeria + Cameroon north + eastern Sahel.
    points: "1900,860 2150,860 2150,1140 2003,1140 2003,1134 1922,1043 1900,1050",
    centroid: { x: 2020, y: 1010 },
    adjacent: ["af_sah_e", "af_gui", "af_con"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_con",
    name: "Congo",
    // Gabon + DRC + Congo Brazzaville + N Angola + Cameroon south.
    points:
      "2003,1140 2150,1140 2150,1400 2035,1400 2046,1272 2030,1212 2003,1134",
    centroid: { x: 2080, y: 1270 },
    adjacent: ["af_nga", "af_sah_e", "af_eaf_w", "af_ang"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_hor",
    name: "Horn of Africa",
    // Eritrea + Ethiopia + Somalia + Djibouti.
    points:
      "2150,860 2367,860 2436,951 2562,963 2462,1110 2438,1140 2150,1140",
    centroid: { x: 2360, y: 1010 },
    adjacent: ["af_egy", "af_eaf_w", "af_eaf_e", "as_ara"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_eaf_w",
    name: "Great Lakes",
    // Uganda + Rwanda + Burundi + western Kenya.
    points: "2150,1140 2290,1140 2290,1400 2150,1400",
    centroid: { x: 2220, y: 1270 },
    adjacent: ["af_hor", "af_egy", "af_con", "af_ang", "af_saf_w", "af_saf_e", "af_eaf_e"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_eaf_e",
    name: "Kenya & Tanzania",
    // Kenya coast + Tanzania.
    points: "2290,1140 2438,1140 2390,1200 2384,1242 2337,1400 2290,1400",
    centroid: { x: 2360, y: 1270 },
    adjacent: ["af_hor", "af_eaf_w", "af_saf_e"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_ang",
    name: "Angola & Namibia",
    // S Angola + Namibia + Botswana + Zambia.
    points: "2035,1400 2200,1400 2200,1632 2144,1662 2117,1648 2064,1485",
    centroid: { x: 2130, y: 1520 },
    adjacent: ["af_con", "af_eaf_w", "af_saf_w"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_saf_w",
    name: "South Africa",
    // South Africa proper + Lesotho + Eswatini.
    points: "2200,1400 2270,1400 2270,1593 2200,1632",
    centroid: { x: 2235, y: 1510 },
    adjacent: ["af_ang", "af_eaf_w", "af_saf_e"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "af_saf_e",
    name: "Mozambique",
    // Mozambique + Zimbabwe.
    points: "2270,1400 2337,1400 2299,1529 2278,1589 2270,1593",
    centroid: { x: 2290, y: 1510 },
    adjacent: ["af_eaf_w", "af_eaf_e", "af_saf_w"],
    owner: "neutral",
    ipc: 3,
  },

  // ===== Oceania =====
  {
    id: "au_sum",
    name: "Sumatra & Java",
    // Western Indonesia: Sumatra + Java + Malay tip.
    points:
      "3210,1095 3300,1080 3450,1090 3450,1245 3400,1255 3343,1221 3275,1180 3220,1160",
    centroid: { x: 3330, y: 1160 },
    adjacent: ["as_sea", "au_bor"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "au_bor",
    name: "Borneo & Sulawesi",
    // Central Indonesia: Borneo + Sulawesi + lesser Sundas.
    points: "3450,1090 3600,1110 3650,1130 3650,1260 3500,1245 3450,1245",
    centroid: { x: 3550, y: 1180 },
    adjacent: ["au_sum", "au_png", "au_waus"],
    owner: "neutral",
    ipc: 3,
  },
  {
    id: "au_png",
    name: "New Guinea",
    // Papua + Papua New Guinea.
    points: "3650,1130 3750,1170 3838,1230 3838,1290 3700,1265 3650,1260",
    centroid: { x: 3750, y: 1210 },
    adjacent: ["au_bor", "au_qld"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "au_waus",
    name: "Western Australia",
    // WA only: NW Cape → Perth → south coast.
    points:
      "3408,1467 3500,1420 3580,1326 3580,1500 3580,1662 3550,1660 3432,1620 3415,1572 3403,1514",
    centroid: { x: 3500, y: 1500 },
    adjacent: ["au_bor", "au_nt", "au_sa"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "au_nt",
    name: "Northern Territory",
    // Top centre of Australia, west of QLD, north of SA.
    points: "3580,1326 3625,1326 3680,1350 3680,1450 3680,1500 3580,1500",
    centroid: { x: 3630, y: 1410 },
    adjacent: ["au_waus", "au_sa", "au_qld"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "au_sa",
    name: "South Australia",
    // South-central Australia, between WA and NSW/VIC.
    points: "3580,1500 3680,1500 3680,1600 3677,1664 3625,1662 3580,1662",
    centroid: { x: 3630, y: 1580 },
    adjacent: ["au_waus", "au_nt", "au_nsw", "au_vic"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "au_qld",
    name: "Queensland",
    // Northeast: Cape York → Gold Coast border.
    points: "3680,1350 3728,1300 3770,1394 3864,1553 3830,1500 3750,1480 3680,1450",
    centroid: { x: 3760, y: 1420 },
    adjacent: ["au_nt", "au_nsw", "au_png"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "au_nsw",
    name: "New South Wales",
    // East coast, between QLD and VIC.
    points: "3680,1450 3750,1480 3830,1500 3864,1553 3839,1649 3750,1650 3680,1600 3680,1500",
    centroid: { x: 3760, y: 1550 },
    adjacent: ["au_qld", "au_sa", "au_vic"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "au_vic",
    name: "Victoria",
    // Southeast corner including Tasmania (merged).
    points: "3680,1600 3750,1650 3839,1649 3759,1707 3677,1664",
    centroid: { x: 3750, y: 1660 },
    adjacent: ["au_nsw", "au_sa", "au_nz"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "au_nz",
    name: "New Zealand",
    // North Island + South Island merged.
    points:
      "4124,1656 4170,1700 4170,1740 4140,1780 4080,1830 4030,1830 " +
      "4030,1790 4080,1720 4090,1680",
    centroid: { x: 4100, y: 1750 },
    adjacent: ["au_vic"],
    owner: "neutral",
    ipc: 2,
  },

  // ===== Iceland =====
  // Same lat/lon projection as Europe, then shifted east by +320 so it sits in
  // the North Atlantic between Greenland and Norway (not overlapping Norway's
  // west coast, which begins around x=2010 at this latitude).
  {
    id: "eu_isl_nw",
    name: "Westfjords",
    // NW Iceland: the Westfjords peninsula + north coast as far as Akureyri area.
    points: "1862,156 1889,143 1925,143 1980,143 1980,165 1925,165 1875,165",
    centroid: { x: 1920, y: 154 },
    adjacent: ["eu_isl_s", "eu_isl_e"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "eu_isl_s",
    name: "Southern Iceland",
    // SW Iceland: Reykjanes peninsula + Reykjavik + south coast plains.
    points: "1862,156 1875,165 1925,165 1930,190 1882,184",
    centroid: { x: 1895, y: 175 },
    adjacent: ["eu_isl_nw", "eu_isl_e"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "eu_isl_e",
    name: "Eastern Iceland",
    // E Iceland: eastern fjords + Vatnajökull glacier region.
    points: "1980,143 1998,143 2004,158 1998,190 1930,190 1925,165 1980,165",
    centroid: { x: 1965, y: 165 },
    adjacent: ["eu_isl_nw", "eu_isl_s"],
    owner: "neutral",
    ipc: 1,
  },

  // ===== Greenland =====
  // Six territories tiling the world's largest island. Shifted east of Canada
  // (compressed horizontally to ~55% so it fits the open sea between the
  // Canadian Arctic and Iceland without overlapping either).
  {
    id: "gr_n",
    name: "Peary Land",
    // Far-north Greenland (lat 80–83): northernmost land on Earth.
    points: "1556,-70 1694,-100 1831,-75 1804,-30 1694,-30 1584,-30",
    centroid: { x: 1694, y: -55 },
    adjacent: ["gr_nw", "gr_ne"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "gr_nw",
    name: "Northwest Greenland",
    // Thule / Avanersuaq: Baffin Bay coast facing Canadian Arctic.
    points: "1490,-14 1584,-30 1694,-30 1694,90 1602,91 1556,30",
    centroid: { x: 1606, y: 20 },
    adjacent: ["gr_n", "gr_ne", "gr_sw"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "gr_ne",
    name: "Northeast Greenland",
    // The vast NE National Park coast facing the Greenland Sea.
    points: "1694,-30 1804,-30 1857,-59 1870,0 1842,91 1694,90",
    centroid: { x: 1776, y: 10 },
    adjacent: ["gr_n", "gr_nw", "gr_e"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "gr_sw",
    name: "Southwest Greenland",
    // Nuuk / Sermersooq: the populated west coast.
    points: "1602,91 1694,90 1694,180 1639,200 1617,181",
    centroid: { x: 1650, y: 140 },
    adjacent: ["gr_nw", "gr_e", "gr_s"],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "gr_e",
    name: "East Greenland",
    // Scoresby Sund / Ammassalik: rugged east coast facing Iceland.
    points: "1694,90 1842,91 1804,150 1738,180 1694,180",
    centroid: { x: 1760, y: 130 },
    adjacent: ["gr_ne", "gr_sw", "gr_s"],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "gr_s",
    name: "Cape Farewell",
    // South Greenland: Qaqortoq + the Cape Farewell tip.
    points: "1639,200 1694,180 1738,180 1705,220 1677,241 1650,220",
    centroid: { x: 1688, y: 210 },
    adjacent: ["gr_sw", "gr_e"],
    owner: "neutral",
    ipc: 1,
  },

  // ===== Islands =====
  // Reachable only by transport (no land adjacencies — matches Iceland/BI/GL).
  // Positions use the same lat/lon → canvas projection as the rest of the map.
  {
    id: "is_cuba",
    name: "Cuba",
    points: "820,812 860,802 905,806 955,818 972,828 940,836 890,832 850,828",
    centroid: { x: 890, y: 820 },
    adjacent: [],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "is_his",
    name: "Hispaniola",
    points: "960,852 992,846 1024,854 1032,866 998,868 968,864",
    centroid: { x: 995, y: 858 },
    adjacent: [],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "is_sar",
    name: "Sardinia & Corsica",
    points: "1958,502 1982,506 1988,538 1980,572 1962,576 1954,540 1956,518",
    centroid: { x: 1970, y: 540 },
    adjacent: [],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "is_cyp",
    name: "Cyprus",
    points: "2274,614 2308,610 2320,620 2302,630 2280,626",
    centroid: { x: 2295, y: 620 },
    adjacent: [],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "is_tai",
    name: "Taiwan",
    points: "3452,818 3478,822 3486,852 3470,872 3454,842",
    centroid: { x: 3470, y: 845 },
    adjacent: [],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "is_phi",
    name: "Philippines",
    points: "3600,940 3642,948 3665,982 3652,1022 3620,1034 3596,1005 3588,975",
    centroid: { x: 3625, y: 990 },
    adjacent: [],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "is_srl",
    name: "Sri Lanka",
    points: "2938,1042 2968,1046 2978,1072 2960,1088 2938,1074",
    centroid: { x: 2958, y: 1064 },
    adjacent: [],
    owner: "neutral",
    ipc: 1,
  },
  {
    id: "is_mad",
    name: "Madagascar",
    points: "2448,1358 2482,1366 2498,1408 2492,1458 2472,1482 2450,1470 2438,1420 2440,1382",
    centroid: { x: 2468, y: 1420 },
    adjacent: [],
    owner: "neutral",
    ipc: 2,
  },
  {
    id: "is_fal",
    name: "Falkland Islands",
    points: "1068,1888 1102,1886 1110,1902 1092,1912 1072,1906",
    centroid: { x: 1088, y: 1898 },
    adjacent: [],
    owner: "neutral",
    ipc: 1,
  },


  // Sea territories are generated as a hex grid at runtime — see
  // generateSeaHexes() below. The land seeds above declare no sea neighbours;
  // adjacency between land and the hex grid is computed procedurally.
];

// Replace hand-drawn outlines with real-world coastlines (see
// scripts/build-map.ts). IDs, names, owners, income, adjacency and units are
// untouched — only the drawn shape and its label/unit anchor point change.
for (const s of SEEDS) {
  const shape = MAP_SHAPES[s.id];
  if (shape) {
    s.points = shape.points;
    s.centroid = shape.centroid;
  }
  const ter = TERRAIN_BY_ID[s.id];
  if (ter) {
    s.terrain = ter.terrain;
    s.canal = ter.canal;
  }
}

function squaredDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// Expand selected parent territories after real-world geometry is applied.
// Keeping the original id makes old campaign saves compatible; each child is
// initialized neutral and empty, while the parent's total income is preserved.
for (const subdivision of MAP_SUBDIVISIONS) {
  const parent = SEEDS.find((seed) => seed.id === subdivision.parentId);
  const childShape = MAP_SHAPES[subdivision.childId];
  if (!parent || !childShape) continue;
  const originalNeighbours = [...parent.adjacent];
  parent.name = subdivision.parentName;
  const childIncome = parent.ipc > 1 ? Math.floor(parent.ipc / 2) : 0;
  parent.ipc -= childIncome;
  const child: Seed = {
    ...parent,
    id: subdivision.childId,
    name: subdivision.childName,
    points: childShape.points,
    centroid: childShape.centroid,
    adjacent: [parent.id],
    ipc: childIncome,
    units: undefined,
    canal: undefined,
  };
  if (!parent.adjacent.includes(child.id)) parent.adjacent.push(child.id);

  // Assign each existing border to the closer half. This keeps the adjacency
  // graph geographic without weakening deliberate transport-only islands.
  for (const neighbourId of originalNeighbours) {
    const neighbour = SEEDS.find((seed) => seed.id === neighbourId);
    if (!neighbour) continue;
    if (squaredDistance(child.centroid, neighbour.centroid) >= squaredDistance(parent.centroid, neighbour.centroid)) continue;
    parent.adjacent = parent.adjacent.filter((id) => id !== neighbourId);
    child.adjacent.push(neighbourId);
    neighbour.adjacent = neighbour.adjacent.filter((id) => id !== parent.id);
    if (!neighbour.adjacent.includes(child.id)) neighbour.adjacent.push(child.id);
  }
  SEEDS.push(child);
}



// =====================================================================
// Procedural sea-hex grid
// =====================================================================
// Tile the entire map viewbox with pointy-top hexagons and keep every hex
// that holds a meaningful amount of open water — including coastal hexes
// whose centre happens to fall on land, so jagged coastlines never leave
// unusable strips of sea. (Land is drawn over the sea, so a coastal hex
// appears cut off by the coastline; its units sit on its water.) Then wire
// adjacency:
//   - sea ↔ sea between any two surviving hexes that are axial neighbours
//   - sea ↔ land for any neighbour-cell position that lies inside a land
//     polygon (that land territory becomes adjacent to the hex)
// Hex size chosen so the grid stays readable but still resolves narrow
// straits (Mediterranean, Caribbean, etc.).

const HEX_SIZE = 110; // vertex distance from centre
const HEX_W = Math.sqrt(3) * HEX_SIZE;        // horizontal spacing
const HEX_H = 1.5 * HEX_SIZE;                  // vertical spacing
const AXIAL_NEIGHBOURS: Array<[number, number]> = [
  [+1,  0], [-1,  0], [ 0, +1], [ 0, -1], [+1, -1], [-1, +1],
];

function hexCenter(q: number, r: number): { x: number; y: number } {
  return {
    x: HEX_W * (q + r / 2),
    y: HEX_H * r,
  };
}

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90); // pointy-top: first vertex up
    pts.push(`${(cx + HEX_SIZE * Math.cos(a)).toFixed(1)},${(cy + HEX_SIZE * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function parsePoints(s: string): Array<[number, number]> {
  return s.trim().split(/\s+/).map((p) => {
    const [x, y] = p.split(",").map(Number);
    return [x, y] as [number, number];
  });
}

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface LandPoly { id: string; poly: Array<[number, number]>; bbox: [number, number, number, number]; }

function buildLandPolys(): LandPoly[] {
  const out: LandPoly[] = [];
  for (const s of SEEDS) {
    if (s.isSea) continue;
    const poly = parsePoints(s.points);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    out.push({ id: s.id, poly, bbox: [minX, minY, maxX, maxY] });
  }
  return out;
}

function findContainingLand(x: number, y: number, lands: LandPoly[]): string | null {
  for (const L of lands) {
    const [a, b, c, d] = L.bbox;
    if (x < a || x > c || y < b || y > d) continue;
    if (pointInPolygon(x, y, L.poly)) return L.id;
  }
  return null;
}

/** Sample points spread across a hex (rings out to just inside its edges). */
const HEX_SAMPLES: Array<[number, number]> = (() => {
  const pts: Array<[number, number]> = [[0, 0]];
  const inner = (HEX_SIZE * Math.sqrt(3)) / 2; // centre-to-edge distance
  for (let ring = 1; ring <= 4; ring++) {
    const rad = (inner * 0.88 * ring) / 4;
    const n = ring * 6;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
    }
  }
  return pts;
})();
/** A hex is ocean if at least this share of it is water. */
const MIN_WATER = 0.06;

/** The water sample closest to (x, y) — the average of split water can land on land. */
function nearestWet(points: Array<[number, number]>, x: number, y: number): { x: number; y: number } {
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { x: best[0], y: best[1] };
}

interface SeaHex {
  id: string;
  q: number;
  r: number;
  centre: { x: number; y: number };
  /** Middle of the hex's open water: where its units and label go. */
  waterCentre: { x: number; y: number };
  points: string;
  seaNeighbours: string[];
  landNeighbours: Set<string>;
}

function generateSeaHexes(): {
  hexes: SeaHex[];
  landAdj: Record<string, Set<string>>;
  /** Ids of edge hexes linked across the map seam. */
  wrapped: Set<string>;
} {
  const lands = buildLandPolys();
  const { x: vx, y: vy, width: vw, height: vh } = {
    x: -40, y: -360, width: 4400, height: 2400, // MAP_VIEWBOX — duplicated to avoid circular import
  };
  // Iterate axial coords broad enough to cover the viewbox.
  const rMin = Math.floor(vy / HEX_H) - 1;
  const rMax = Math.ceil((vy + vh) / HEX_H) + 1;
  const qMin = Math.floor(vx / HEX_W) - rMax - 1;
  const qMax = Math.ceil((vx + vw) / HEX_W) - rMin + 1;

  const grid = new Map<string, SeaHex>();
  for (let r = rMin; r <= rMax; r++) {
    for (let q = qMin; q <= qMax; q++) {
      const c = hexCenter(q, r);
      if (c.x < vx - HEX_SIZE || c.x > vx + vw + HEX_SIZE) continue;
      if (c.y < vy - HEX_SIZE || c.y > vy + vh + HEX_SIZE) continue;
      // Measure how much of this hex is open water.
      let wet = 0, sx = 0, sy = 0;
      const wetPoints: Array<[number, number]> = [];
      const shallow: Array<[number, number]> = [];
      for (const [dx, dy] of HEX_SAMPLES) {
        const px = c.x + dx, py = c.y + dy;
        if (!findContainingLand(px, py, lands)) {
          wet++;
          sx += px;
          sy += py;
          // Prefer open water for placing units: no coast within 14 units.
          const D = 14;
          const open = [[D, 0], [-D, 0], [0, D], [0, -D]].every(
            ([ox, oy]) => !findContainingLand(px + ox, py + oy, lands),
          );
          if (open) wetPoints.push([px, py]);
          else shallow.push([px, py]);
        }
      }
      if (wet / HEX_SAMPLES.length < MIN_WATER) continue;
      const centreWet = !findContainingLand(c.x, c.y, lands);
      const id = `sea_${q}_${r}`.replace(/-/g, "n");
      grid.set(`${q},${r}`, {
        id,
        q, r,
        centre: c,
        waterCentre: centreWet ? c : nearestWet(wetPoints.length ? wetPoints : shallow, sx / wet, sy / wet),
        points: hexPoints(c.x, c.y),
        seaNeighbours: [],
        landNeighbours: new Set(),
      });
    }
  }

  const landAdj: Record<string, Set<string>> = {};
  for (const hex of grid.values()) {
    for (const [dq, dr] of AXIAL_NEIGHBOURS) {
      const nq = hex.q + dq, nr = hex.r + dr;
      const nb = grid.get(`${nq},${nr}`);
      if (nb) {
        hex.seaNeighbours.push(nb.id);
        continue;
      }
      // Neighbour cell is off-map or solid land. Land links come from the
      // coastline sampling below, so inland territories never count as coastal.
    }
  }

  // Neighbouring hexes only connect if water runs across their shared edge —
  // otherwise ships could sail over an isthmus (Panama and Suez are crossed
  // through their canals instead). A link is kept anyway if cutting it would
  // strand part of the ocean.
  const shareWater = (a: SeaHex, b: SeaHex) => {
    const mx = (a.centre.x + b.centre.x) / 2, my = (a.centre.y + b.centre.y) / 2;
    const dx = b.centre.x - a.centre.x, dy = b.centre.y - a.centre.y;
    const len = Math.hypot(dx, dy);
    const px = -dy / len, py = dx / len;
    const half = HEX_SIZE / 2;
    for (let k = -10; k <= 10; k++) {
      if (!findContainingLand(mx + (px * half * k) / 10, my + (py * half * k) / 10, lands)) return true;
    }
    return false;
  };
  const byId = new Map([...grid.values()].map((h) => [h.id, h]));
  const cuts: Array<[SeaHex, SeaHex]> = [];
  for (const hex of grid.values()) {
    for (const nid of hex.seaNeighbours) {
      const nb = byId.get(nid)!;
      if (hex.id < nb.id && !shareWater(hex, nb)) cuts.push([hex, nb]);
    }
  }
  const unlink = (a: SeaHex, b: SeaHex) => {
    a.seaNeighbours = a.seaNeighbours.filter((x) => x !== b.id);
    b.seaNeighbours = b.seaNeighbours.filter((x) => x !== a.id);
  };
  for (const [a, b] of cuts) unlink(a, b);
  for (let guard = 0; guard < 50; guard++) {
    const all = [...grid.values()];
    const start = all.reduce((m, h) => (h.seaNeighbours.length > m.seaNeighbours.length ? h : m), all[0]);
    const seen = new Set([start.id]);
    const queue = [start];
    while (queue.length) {
      for (const nid of queue.pop()!.seaNeighbours) {
        if (!seen.has(nid)) {
          seen.add(nid);
          queue.push(byId.get(nid)!);
        }
      }
    }
    const restore = cuts.find(([a, b]) => seen.has(a.id) !== seen.has(b.id));
    if (!restore) break;
    restore[0].seaNeighbours.push(restore[1].id);
    restore[1].seaNeighbours.push(restore[0].id);
  }

  // Perimeter sampling: ensure every coastal land is linked to every sea hex
  // whose tile its coastline crosses. Inverse pointy-top axial rounding.
  function hexAt(x: number, y: number): SeaHex | undefined {
    const qf = (Math.sqrt(3) / 3 * x - y / 3) / HEX_SIZE;
    const rf = (2 / 3 * y) / HEX_SIZE;
    // Cube round
    const xf = qf, zf = rf, yf = -xf - zf;
    let rx = Math.round(xf), ry = Math.round(yf), rz = Math.round(zf);
    const dx = Math.abs(rx - xf), dy = Math.abs(ry - yf), dz = Math.abs(rz - zf);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return grid.get(`${rx},${rz}`);
  }
  // Probe just off each point of a coastline; every sea hex holding that
  // open water borders the land. Borders between two land territories find
  // no water and link nothing, so inland territories never count as coastal.
  const COAST_PROBE = 9;
  const PROBES: Array<[number, number]> = [
    [COAST_PROBE, 0], [-COAST_PROBE, 0], [0, COAST_PROBE], [0, -COAST_PROBE],
    [COAST_PROBE * 0.7, COAST_PROBE * 0.7], [-COAST_PROBE * 0.7, -COAST_PROBE * 0.7],
    [COAST_PROBE * 0.7, -COAST_PROBE * 0.7], [-COAST_PROBE * 0.7, COAST_PROBE * 0.7],
  ];
  const STEP = 25;
  for (const L of lands) {
    for (let i = 0; i < L.poly.length; i++) {
      const [x1, y1] = L.poly[i];
      const [x2, y2] = L.poly[(i + 1) % L.poly.length];
      const dx = x2 - x1, dy = y2 - y1;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / STEP));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x1 + dx * t, py = y1 + dy * t;
        for (const [ox, oy] of PROBES) {
          const wx = px + ox, wy = py + oy;
          if (findContainingLand(wx, wy, lands)) continue;
          const hex = hexAt(wx, wy);
          if (hex) {
            hex.landNeighbours.add(L.id);
            (landAdj[L.id] ??= new Set()).add(hex.id);
          }
        }
      }
    }
  }

  // An island can fit entirely inside a land-blocked hex and otherwise have no
  // reachable water. Link only those isolated island territories to the
  // nearest open sea tile so transport-only access remains reliable.
  for (const land of lands) {
    if (!land.id.startsWith("is_") || landAdj[land.id]?.size) continue;
    const cx = (land.bbox[0] + land.bbox[2]) / 2;
    const cy = (land.bbox[1] + land.bbox[3]) / 2;
    let nearest: SeaHex | undefined;
    let nearestDistance = Infinity;
    for (const hex of grid.values()) {
      const distance = Math.hypot(hex.centre.x - cx, hex.centre.y - cy);
      if (distance < nearestDistance) {
        nearest = hex;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance < HEX_SIZE * 3) {
      nearest.landNeighbours.add(land.id);
      (landAdj[land.id] ??= new Set()).add(nearest.id);
    }
  }

  // World wrap: the map is a globe, so the westernmost and easternmost ocean
  // tile of each row are neighbours — a fleet sailing off one edge arrives on
  // the other side.
  const rows = new Map<number, SeaHex[]>();
  for (const hex of grid.values()) {
    const list = rows.get(hex.r);
    if (list) list.push(hex);
    else rows.set(hex.r, [hex]);
  }
  const wrapped = new Set<string>();
  for (const list of rows.values()) {
    let west = list[0];
    let east = list[0];
    for (const hex of list) {
      if (hex.centre.x < west.centre.x) west = hex;
      if (hex.centre.x > east.centre.x) east = hex;
    }
    if (west === east) continue;
    // Both ends must actually sit on the map edge.
    if (west.centre.x > vx + HEX_W * 1.5) continue;
    if (east.centre.x < vx + vw - HEX_W * 1.5) continue;
    if (!west.seaNeighbours.includes(east.id)) west.seaNeighbours.push(east.id);
    if (!east.seaNeighbours.includes(west.id)) east.seaNeighbours.push(west.id);
    wrapped.add(west.id);
    wrapped.add(east.id);
  }

  return { hexes: Array.from(grid.values()), landAdj, wrapped };
}



// Each nation begins with exactly one territory + factory + starter garrison.
const STARTING_TERRITORY: Record<Nation, string> = {
  usa: "t7",       // central US
  canada: "ca2",   // Prairies
  mexico: "mx1",   // Mexico Norte
  brazil: "sa_bra",
  italy: "eu_ita",
  germany: "eu_ger",
  china: "as_chi",
  africa: "af_saf_w",
};

const STARTER_GARRISON: Array<[UnitType, number]> = [
  ["infantry", 2],
  ["artillery", 1],
];

export function createInitialState(): GameState {
  const territories: Record<string, Territory> = {};
  for (const s of SEEDS) {
    territories[s.id] = {
      id: s.id,
      name: s.name,
      points: s.points,
      centroid: s.centroid,
      adjacent: [...s.adjacent],
      // Reset every seed to neutral — nations claim only their capital below.
      owner: "neutral",
      ipc: s.ipc,
      units: [],
      hasFactory: false,
      structures: [],
      builtInfantryThisTurn: false,
      isSea: !!s.isSea,
      terrain: s.terrain,
      canal: s.canal,
    };
  }

  // Generate the procedural hex ocean and wire mutual adjacency.
  const { hexes, landAdj, wrapped } = generateSeaHexes();
  let seaCounter = 0;
  for (const h of hexes) {
    seaCounter++;
    territories[h.id] = {
      id: h.id,
      name: wrapped.has(h.id) ? `Sea ${seaCounter} (World Seam)` : `Sea ${seaCounter}`,
      points: h.points,
      centroid: h.waterCentre,
      adjacent: [...h.seaNeighbours, ...h.landNeighbours],
      owner: "neutral",
      ipc: 0,
      units: [],
      hasFactory: false,
      structures: [],
      builtInfantryThisTurn: false,
      isSea: true,
    };
  }
  for (const [landId, seaSet] of Object.entries(landAdj)) {
    const land = territories[landId];
    if (!land) continue;
    for (const sid of seaSet) {
      if (!land.adjacent.includes(sid)) land.adjacent.push(sid);
    }
  }



  for (const [nation, terrId] of Object.entries(STARTING_TERRITORY) as Array<
    [Faction, string]
  >) {
    const t = territories[terrId];
    if (!t) continue;
    t.owner = nation;
    t.hasFactory = true;
    t.structures = ["capital", "factory"];
    for (const [type, n] of STARTER_GARRISON) {
      for (let i = 0; i < n; i++) t.units.push(mkUnit(type, nation));
    }
  }

  const zero = () =>
    Object.fromEntries(PLAYER_ORDER.map((n) => [n, 0])) as Record<Nation, number>;

  // Pre-campaign setup rolls: D6 for placement order, D8 for capital choice.
  const setupRolls = Object.fromEntries(
    PLAYER_ORDER.map((n) => [
      n,
      {
        placement: 1 + Math.floor(Math.random() * 6),
        capital: 1 + Math.floor(Math.random() * 8),
      },
    ]),
  ) as Record<Nation, { placement: number; capital: number }>;

  return {
    turn: 1,
    currentPlayer: "usa",
    territories,
    treasury: { usa: 50, canada: 50, mexico: 50, brazil: 50, italy: 50, germany: 50, china: 50, africa: 50 },
    log: ["Turn 1 — United States to move."],
    vp: zero(),
    bonds: Object.fromEntries(PLAYER_ORDER.map((n) => [n, emptyBonds()])) as Record<Nation, Bonds>,
    infirmaryPool: zero(),
    capitalLosses: zero(),
    spies: zero(),
    blackout: zero(),
    blueprints: zero(),
    abombs: zero(),
    ceasefire: zero(),
    economy: freshEconomyFlags(),
    day: 1,
    gameOver: false,
    winner: null,
    setupRolls,
    contracts: [],
  };
}
