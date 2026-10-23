export type QuestId = "mystery" | "pick" | "water" | "earth" | "fire" | "ice" | "emerald" | "ruby" | "golden" | "diamond" | "tropical" | "myth";

/** len: problems in a row to win. refLen: the reference game's length (parity check only). */
export interface QuestDef { id: QuestId; name: string; len: number; refLen: number; color: string; blurb: string }

// Longer quest = harder; Diamond is the longest. Shortened to 5-10 on 2026-10-23 (the
// reference's 8-25 felt too hard); refLen keeps the original for the parity check.
export const QUESTS: readonly QuestDef[] = [
  { id: "mystery",  name: "Mystery Box",      len: 1,  refLen: 1,  color: "#B48CFF", blurb: "1 problem, a surprise quest animal. Once a day!" },
  { id: "pick",     name: "Pick-a-Pet Quest", len: 5,  refLen: 8,  color: "#FFC145", blurb: "You pick the animal" },
  { id: "water",    name: "Water Quest",      len: 5,  refLen: 10, color: "#5FC6E8", blurb: "Win a water animal" },
  { id: "earth",    name: "Earth Quest",      len: 6,  refLen: 12, color: "#7CC46A", blurb: "Win an earth animal" },
  { id: "fire",     name: "Fire Quest",       len: 6,  refLen: 14, color: "#FF8A3D", blurb: "Win a fire animal" },
  { id: "tropical", name: "Tropical Quest",   len: 7,  refLen: 16, color: "#2EC4B6", blurb: "Win a tropical animal" },   // added after the port
  { id: "ice",      name: "Ice Quest",        len: 7,  refLen: 18, color: "#BDE3F7", blurb: "Win an ice animal" },
  { id: "emerald",  name: "Emerald Quest",    len: 8,  refLen: 19, color: "#3DD68C", blurb: "Win an emerald animal" },
  { id: "ruby",     name: "Ruby Quest",       len: 8,  refLen: 21, color: "#FF4F7B", blurb: "Win a ruby animal" },
  { id: "golden",   name: "Golden Quest",     len: 9,  refLen: 23, color: "#FFCC33", blurb: "Win a golden animal" },
  { id: "myth",     name: "Greek Myths Quest", len: 9, refLen: 9,  color: "#7B9CFF", blurb: "Win a Greek myth creature" },   // added after the port
  { id: "diamond",  name: "Diamond Quest",    len: 10, refLen: 25, color: "#A8F0F5", blurb: "Win a diamond animal" },
];

/** How many in a row this quest takes (the reference's length in classic mode). */
export function questLen(def: QuestDef, classic = false): number {
  return classic ? def.refLen : def.len;
}

export function questById(id: QuestId): QuestDef {
  return QUESTS.find((q) => q.id === id)!;
}
