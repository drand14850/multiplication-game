/* eslint-disable no-var -- kept verbatim from the reference */
// Element palettes, recolor() and DECOR copied from reference/times-tables.html (L638–743).
// Logic is unchanged; only TypeScript types were added.

import { ANIMALS, NAMES } from "./animals";

export type ElementKey = "water" | "earth" | "fire" | "ice" | "emerald" | "ruby" | "golden" | "diamond";
export interface Element { label: string; color: string; dark: string; ramp: string[]; animals: string[] }

export const ELEMENTS: Record<ElementKey, Element> = {
  water:   { label: "Water",   color: "#5FC6E8", dark: "#0E2F4A",
             ramp: ["#1F6FB2","#2E9CD6","#6FD0EE","#C9F1FC"], animals: ["Whale","Frog","Turtle","Penguin","Axolotl","Salamander","Snake","Dog"] },
  earth:   { label: "Earth",   color: "#7CC46A", dark: "#2E1F12",
             ramp: ["#6E4B2A","#9A6B3F","#C49A63","#E8D3A8"], animals: ["Bunny","Elephant","Pig","Bear","Dog","Lizard","Fox","Panda"] },
  fire:    { label: "Fire",    color: "#FF8A3D", dark: "#4A140A",
             ramp: ["#D9381E","#F2701B","#FFA41C","#FFE08A"], animals: ["Fox","Dog","Cat","Bear","Owl","Lizard","Snake","Pig"] },
  ice:     { label: "Ice",     color: "#BDE3F7", dark: "#2A3B55",
             ramp: ["#86B4DC","#B3D6F0","#DCEEFA","#FAFDFF"], animals: ["Penguin","Bunny","Bear","Owl","Whale","Fox","Cat","Elephant"] },
  emerald: { label: "Emerald", color: "#3DD68C", dark: "#0B3B2A",
             ramp: ["#0F8A5F","#22B573","#6EE0A0","#D4FBE5"], animals: ["Frog","Turtle","Salamander","Cat","Panda","Chameleon","Snake","Owl"] },
  ruby:    { label: "Ruby",    color: "#FF4F7B", dark: "#4A0A1E",
             ramp: ["#B3123A","#E0245A","#FF6B8E","#FFD0DC"], animals: ["Axolotl","Fox","Pig","Bunny","Dog","Chameleon","Lizard","Bear"] },
  golden:  { label: "Golden",  color: "#FFCC33", dark: "#4A3300",
             ramp: ["#C98A0B","#E8B020","#FFD54A","#FFF3B8"], animals: ["Bear","Elephant","Penguin","Cat","Owl","Dog","Panda","Snake"] },
  diamond: { label: "Diamond", color: "#A8F0F5", dark: "#2A1F55",
             ramp: ["#8C7CF8","#5CC8F0","#A8F0F5","#FFFFFF"], animals: ["Panda","Owl","Elephant","Whale","Fox","Axolotl","Bunny","Chameleon"] }
};

export function lum(h: string): number {
  var r = parseInt(h.slice(1, 3), 16) / 255,
      g = parseInt(h.slice(3, 5), 16) / 255,
      b = parseInt(h.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Swap an animal's colors for an element palette. Colors keep their light-to-dark
// order, so muzzles stay lighter than faces and eyes stay dark.
export function recolor(svg: string, E: Element): string {
  var seen: Record<string, number> = {}, light: string[] = [];
  (svg.match(/#[0-9A-Fa-f]{6}/g) || []).forEach(function (h) {
    h = h.toUpperCase();
    if (!seen[h]) { seen[h] = 1; if (lum(h) >= 0.26) light.push(h); }
  });
  light.sort(function (a, b) { return lum(a) - lum(b); });
  var map: Record<string, string> = {}, n = light.length, R = E.ramp.length;
  light.forEach(function (h, k) {
    map[h] = E.ramp[n === 1 ? R - 2 : Math.round(k * (R - 1) / (n - 1))];
  });
  return svg.replace(/#[0-9A-Fa-f]{6}/g, function (h) { return map[h.toUpperCase()] || E.dark; });
}

function snowflake(x: number, y: number, s: number): string {
  var a = (0.87 * s).toFixed(1), b = (0.5 * s).toFixed(1);
  return '<path transform="translate(' + x + ' ' + y + ')" d="M0 -' + s + ' V' + s +
         ' M-' + a + ' -' + b + ' L' + a + ' ' + b + ' M-' + a + ' ' + b + ' L' + a + ' -' + b + '"/>';
}
function sparkle(x: number, y: number, s: number): string {
  return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z"/>';
}

export const DECOR: Record<ElementKey, { back: string; front: string }> = {
  fire: {
    back: '<g fill="#FF7A2A"><path d="M100 2 Q126 34 117 58 Q100 74 83 58 Q74 34 100 2 Z"/>' +
          '<path d="M62 16 Q82 42 75 62 Q62 72 52 60 Q46 40 62 16 Z"/>' +
          '<path d="M138 16 Q154 40 148 60 Q138 72 125 62 Q118 42 138 16 Z"/></g>' +
          '<path d="M100 24 Q113 44 108 58 Q100 64 92 58 Q87 44 100 24 Z" fill="#FFD166"/>',
    front: ""
  },
  water: {
    back: "",
    front: '<g fill="none" stroke="#C9F1FC" stroke-width="4"><circle cx="26" cy="46" r="10"/><circle cx="40" cy="22" r="6"/>' +
           '<circle cx="174" cy="40" r="8"/><circle cx="184" cy="18" r="4"/><circle cx="180" cy="172" r="7"/></g>'
  },
  earth: {
    back: '<path d="M100 60 V30" stroke="#4E9A3C" stroke-width="5" stroke-linecap="round"/>' +
          '<path d="M100 38 Q84 20 68 30 Q84 46 100 38 Z" fill="#7CC46A"/>' +
          '<path d="M100 32 Q116 12 134 22 Q118 40 100 32 Z" fill="#9BD67F"/>',
    front: '<g fill="#9A6B3F"><ellipse cx="26" cy="176" rx="12" ry="8"/><ellipse cx="44" cy="182" rx="8" ry="5"/>' +
           '<ellipse cx="174" cy="178" rx="11" ry="7"/></g>' +
           '<g fill="#7CC46A"><path d="M24 40 Q24 22 40 18 Q42 36 24 40 Z"/><path d="M176 46 Q172 28 156 28 Q158 44 176 46 Z"/></g>'
  },
  ice: {
    back: "",
    front: '<g stroke="#FAFDFF" stroke-width="4" stroke-linecap="round" fill="none">' +
           snowflake(28, 36, 13) + snowflake(172, 30, 10) + snowflake(178, 168, 9) + snowflake(22, 166, 7) + "</g>"
  },
  emerald: {
    back: "",
    front: '<g fill="#B8F7D4">' + sparkle(26, 40, 1.3) + sparkle(174, 34, 1.1) + sparkle(178, 162, 1.2) +
           sparkle(22, 158, 0.8) + "</g>"
  },
  ruby: {
    back: "",
    front: '<g fill="#FFC2D1">' + sparkle(26, 40, 1.3) + sparkle(174, 34, 1.1) + sparkle(178, 162, 1.2) +
           sparkle(22, 158, 0.8) + "</g>"
  },
  golden: {
    back: "",
    front: '<g transform="translate(68 0) scale(.32)">' +
           '<path d="M30 150 L40 60 L75 100 L100 40 L125 100 L160 60 L170 150 Z" fill="#FFCC33"/>' +
           '<rect x="30" y="140" width="140" height="26" rx="6" fill="#E8B020"/>' +
           '<g fill="#FF4F7B"><circle cx="40" cy="58" r="11"/><circle cx="100" cy="38" r="11"/><circle cx="160" cy="58" r="11"/></g></g>' +
           '<g fill="#FFF3B8">' + sparkle(26, 44, 1.2) + sparkle(178, 160, 1.2) + sparkle(22, 158, 0.8) + "</g>"
  },
  diamond: {
    back: "",
    front: '<g fill="#FFFFFF">' + sparkle(26, 40, 1.4) + sparkle(172, 30, 1.1) + sparkle(180, 160, 1.2) +
           sparkle(22, 160, 0.8) + sparkle(150, 12, 0.7) + "</g>"
  }
};

export function elementArt(baseName: string, key: ElementKey): string {
  var i = NAMES.indexOf(baseName);
  return DECOR[key].back + recolor(ANIMALS[i], ELEMENTS[key]) + DECOR[key].front;
}
