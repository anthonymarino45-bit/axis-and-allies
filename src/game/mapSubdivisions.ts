export type SubdivisionAxis = "x" | "y";

export interface MapSubdivision {
  parentId: string;
  childId: string;
  parentName: string;
  childName: string;
  axis?: SubdivisionAxis;
  /** Which half receives childId in projected map coordinates. */
  childSide?: "low" | "high";
}

/**
 * Each entry cuts an existing projected polygon into two complementary pieces.
 * The original id is retained for save compatibility; the new id is the second
 * piece. Because both pieces come from one parent polygon, their union preserves
 * the exact pre-expansion coastline.
 */
export const MAP_SUBDIVISIONS: MapSubdivision[] = [
  // North America (+12)
  { parentId: "ca1", childId: "ca1_n", parentName: "British Columbia", childName: "Yukon", axis: "y", childSide: "low" },
  { parentId: "ca3", childId: "ca3_e", parentName: "Manitoba", childName: "Ontario", axis: "x" },
  { parentId: "ca4", childId: "ca4_n", parentName: "Southern Quebec", childName: "Ungava", axis: "y", childSide: "low" },
  { parentId: "ca5", childId: "ca5_n", parentName: "Maritimes", childName: "Labrador", axis: "y", childSide: "low" },
  { parentId: "ca6", childId: "ca6_e", parentName: "Western Arctic", childName: "Central Arctic", axis: "x" },
  { parentId: "ca7", childId: "ca7_e", parentName: "Western Nunavut", childName: "Eastern Nunavut", axis: "x" },
  { parentId: "t1", childId: "t1_e", parentName: "Pacific Northwest", childName: "Northern Rockies", axis: "x" },
  { parentId: "t2", childId: "t2_e", parentName: "Northern Plains West", childName: "Northern Plains East", axis: "x" },
  { parentId: "t3", childId: "t3_e", parentName: "Upper Midwest", childName: "Great Lakes", axis: "x" },
  { parentId: "t5", childId: "t5_e", parentName: "Appalachia North", childName: "New England", axis: "x" },
  { parentId: "t16", childId: "t16_e", parentName: "Southwest", childName: "West Texas", axis: "x" },
  { parentId: "mx1", childId: "mx1_s", parentName: "Mexico Norte", childName: "Mexico Central", axis: "y" },

  // South America (+7)
  { parentId: "sa_col", childId: "sa_col_e", parentName: "Colombia West", childName: "Colombia East", axis: "x" },
  { parentId: "sa_ven", childId: "sa_ven_e", parentName: "Venezuela West", childName: "Venezuela East", axis: "x" },
  { parentId: "sa_amz", childId: "sa_amz_s", parentName: "Amazonia North", childName: "Mato Grosso", axis: "y" },
  { parentId: "sa_brn", childId: "sa_brn_s", parentName: "Pará", childName: "Bahia", axis: "y" },
  { parentId: "sa_bra", childId: "sa_bra_s", parentName: "Southeast Brazil", childName: "Southern Brazil", axis: "y" },
  { parentId: "sa_arg", childId: "sa_arg_s", parentName: "Pampas", childName: "Northern Patagonia", axis: "y" },
  { parentId: "sa_per", childId: "sa_per_s", parentName: "Peru & Ecuador", childName: "Bolivia", axis: "y" },

  // Europe and western Russia (+7)
  { parentId: "eu_fra", childId: "eu_fra_n", parentName: "France", childName: "Low Countries", axis: "y", childSide: "low" },
  { parentId: "eu_ger", childId: "eu_ger_s", parentName: "Germany & Czechia", childName: "Alpine States", axis: "y" },
  { parentId: "eu_sca", childId: "eu_sca_e", parentName: "Norway & Sweden", childName: "Finland", axis: "x" },
  { parentId: "eu_bal", childId: "eu_bal_s", parentName: "Danube Basin", childName: "Southern Balkans", axis: "y" },
  { parentId: "eu_pol", childId: "eu_pol_e", parentName: "Poland & Baltics", childName: "Belarus", axis: "x" },
  { parentId: "eu_ukr", childId: "eu_ukr_e", parentName: "Western Ukraine", childName: "Eastern Ukraine", axis: "x" },
  { parentId: "eu_mos", childId: "eu_mos_e", parentName: "Moscow West", childName: "Moscow East", axis: "x" },

  // Asia and Russia (+12)
  { parentId: "eu_rus_s", childId: "eu_rus_s_e", parentName: "Southern Russia West", childName: "Southern Russia East", axis: "x" },
  { parentId: "eu_rus_n", childId: "eu_rus_n_e", parentName: "Northern Russia West", childName: "Northern Russia East", axis: "x" },
  { parentId: "as_ura", childId: "as_ura_e", parentName: "Urals West", childName: "Urals East", axis: "x" },
  { parentId: "as_wsib", childId: "as_wsib_e", parentName: "West Siberia", childName: "Ob Basin", axis: "x" },
  { parentId: "as_csib", childId: "as_csib_e", parentName: "Central Siberia", childName: "Yakutia West", axis: "x" },
  { parentId: "as_fee", childId: "as_fee_e", parentName: "Yakutia East", childName: "Far East", axis: "x" },
  { parentId: "as_kam", childId: "as_kam_n", parentName: "Kamchatka South", childName: "Kamchatka North", axis: "y", childSide: "low" },
  // Split both halves of the tallest Siberian strips north-to-south. These run
  // after the east-west cuts above, so every original strip becomes four
  // compact regions while its coastline remains unchanged.
  { parentId: "as_ura", childId: "as_ura_n", parentName: "Southern Volga-Urals", childName: "Northern Volga-Urals", axis: "y", childSide: "low" },
  { parentId: "as_ura_e", childId: "as_ura_e_n", parentName: "Southern Urals", childName: "Northern Urals", axis: "y", childSide: "low" },
  { parentId: "as_wsib", childId: "as_wsib_n", parentName: "Southern West Siberia", childName: "Northern West Siberia", axis: "y", childSide: "low" },
  { parentId: "as_wsib_e", childId: "as_wsib_e_n", parentName: "Southern Ob Basin", childName: "Northern Ob Basin", axis: "y", childSide: "low" },
  { parentId: "as_csib", childId: "as_csib_n", parentName: "Southern Central Siberia", childName: "Northern Central Siberia", axis: "y", childSide: "low" },
  { parentId: "as_csib_e", childId: "as_csib_e_n", parentName: "Southern Yakutia West", childName: "Northern Yakutia West", axis: "y", childSide: "low" },
  { parentId: "as_fee", childId: "as_fee_n", parentName: "Southern Yakutia East", childName: "Northern Yakutia East", axis: "y", childSide: "low" },
  { parentId: "as_fee_e", childId: "as_fee_e_n", parentName: "Amur Region", childName: "Northeast Siberia", axis: "y", childSide: "low" },
  { parentId: "as_kaz", childId: "as_kaz_s", parentName: "Kazakhstan", childName: "Turkestan", axis: "y" },
  { parentId: "as_per", childId: "as_per_e", parentName: "Iran", childName: "Afghanistan & Pakistan", axis: "x" },
  { parentId: "as_chi", childId: "as_chi_s", parentName: "North China", childName: "South China", axis: "y" },
  { parentId: "as_ind", childId: "as_ind_s", parentName: "North India", childName: "South India", axis: "y" },
  { parentId: "as_sea", childId: "as_sea_s", parentName: "Indochina", childName: "Malaya & Burma", axis: "y" },

  // Africa (+10)
  { parentId: "af_mag", childId: "af_mag_e", parentName: "Morocco", childName: "Algeria & Tunisia", axis: "x" },
  { parentId: "af_lib", childId: "af_lib_e", parentName: "Libya West", childName: "Libya East", axis: "x" },
  { parentId: "af_sah_w", childId: "af_sah_w_s", parentName: "Western Sahara", childName: "Sahel West", axis: "y" },
  { parentId: "af_sah_e", childId: "af_sah_e_s", parentName: "Central Sahara", childName: "Sahel Central", axis: "y" },
  { parentId: "af_egy", childId: "af_egy_s", parentName: "Egypt", childName: "Sudan", axis: "y" },
  { parentId: "af_gui", childId: "af_gui_e", parentName: "Guinea Coast", childName: "Gold Coast", axis: "x" },
  { parentId: "af_nga", childId: "af_nga_s", parentName: "Nigeria", childName: "Cameroon", axis: "y" },
  { parentId: "af_con", childId: "af_con_e", parentName: "Congo Basin West", childName: "Congo Basin East", axis: "x" },
  { parentId: "af_hor", childId: "af_hor_e", parentName: "Ethiopian Highlands", childName: "Somalia", axis: "x" },
  { parentId: "af_eaf_w", childId: "af_eaf_w_s", parentName: "Great Lakes Africa", childName: "Zambezi Basin", axis: "y" },

  // Oceania (+5)
  { parentId: "au_sum", childId: "au_sum_e", parentName: "Sumatra", childName: "Java", axis: "x" },
  { parentId: "au_bor", childId: "au_bor_e", parentName: "Borneo", childName: "Sulawesi", axis: "x" },
  { parentId: "au_waus", childId: "au_waus_s", parentName: "Western Australia North", childName: "Western Australia South", axis: "y" },
  { parentId: "au_qld", childId: "au_qld_s", parentName: "Queensland", childName: "Darling Downs", axis: "y" },
  { parentId: "au_sa", childId: "au_sa_e", parentName: "South Australia West", childName: "South Australia East", axis: "x" },
];
