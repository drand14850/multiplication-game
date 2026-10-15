export type QuestId = "mystery" | "pick" | "water" | "earth" | "fire" | "ice" | "emerald" | "ruby" | "golden" | "diamond";

export interface QuestDef { id: QuestId; name: string; len: number; color: string; blurb: string }

// Longer quest = harder. Diamond is the longest.
export const QUESTS: readonly QuestDef[] = [
  { id: "mystery", name: "Mystery Box",      len: 1,  color: "#B48CFF", blurb: "1 problem, a surprise quest animal. Once a day!" },
  { id: "pick",    name: "Pick-a-Pet Quest", len: 8,  color: "#FFC145", blurb: "You pick the animal" },
  { id: "water",   name: "Water Quest",      len: 10, color: "#5FC6E8", blurb: "Win a water animal" },
  { id: "earth",   name: "Earth Quest",      len: 12, color: "#7CC46A", blurb: "Win an earth animal" },
  { id: "fire",    name: "Fire Quest",       len: 14, color: "#FF8A3D", blurb: "Win a fire animal" },
  { id: "ice",     name: "Ice Quest",        len: 18, color: "#BDE3F7", blurb: "Win an ice animal" },
  { id: "emerald", name: "Emerald Quest",    len: 19, color: "#3DD68C", blurb: "Win an emerald animal" },
  { id: "ruby",    name: "Ruby Quest",       len: 21, color: "#FF4F7B", blurb: "Win a ruby animal" },
  { id: "golden",  name: "Golden Quest",     len: 23, color: "#FFCC33", blurb: "Win a golden animal" },
  { id: "diamond", name: "Diamond Quest",    len: 25, color: "#A8F0F5", blurb: "Win a diamond animal" },
];

export function questById(id: QuestId): QuestDef {
  return QUESTS.find((q) => q.id === id)!;
}
