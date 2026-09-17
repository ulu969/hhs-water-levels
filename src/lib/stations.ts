// Station codes ingested from Environment and Climate Change Canada's
// real-time hydrometric network. Full metadata (name, waterbody, coordinates)
// lives in the `stations` table; this list only drives which codes the
// ingestion job polls.
export const STATION_CODES = [
  "08MG027", // Lillooet River at Tenas Narrows
  "08MG012", // Harrison Lake near Harrison Hot Springs
  "08MG013", // Harrison River near Harrison Hot Springs
  "08MG022", // Harrison River below Morris Creek
  "08MG014", // Harrison River at Harrison Mills
  "08MF073", // Fraser River at Harrison Mills
  "08MF075", // Fraser River at Lower Kent
  "08MF035", // Fraser River near Agassiz
  "08MF038", // Fraser River at Cannor
  "08MF005", // Fraser River at Hope
] as const;
