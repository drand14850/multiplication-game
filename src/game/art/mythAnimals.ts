// Greek myth creatures for the Greek Myths quest (added 2026-10-23), drawn to match the
// reference's style: flat fills, round friendly shapes, dark eyes, 200×200. Not in the
// reference file. They're new creatures, not recolors, so each one is drawn here.

const EYE = "#3A2A1E";

export const MYTH_CREATURES: readonly { name: string; svg: string }[] = [
  {
    name: "Hydra",
    svg:
      // three necks rising from one body
      '<g stroke="#4FA36B" stroke-width="17" stroke-linecap="round" fill="none">' +
      '<path d="M80 142 Q54 104 46 66"/><path d="M100 134 Q100 94 100 50"/><path d="M120 142 Q146 104 154 66"/></g>' +
      '<ellipse cx="100" cy="152" rx="60" ry="32" fill="#4FA36B"/>' +
      '<ellipse cx="100" cy="162" rx="38" ry="18" fill="#B8E3A0"/>' +
      '<g fill="#3E8556"><ellipse cx="62" cy="182" rx="14" ry="7"/><ellipse cx="138" cy="182" rx="14" ry="7"/></g>' +
      // spikes and heads
      '<g fill="#2E7D4A"><path d="M36 48 L42 34 L48 46 Z"/><path d="M92 32 L98 18 L104 30 Z"/><path d="M152 48 L158 34 L164 46 Z"/></g>' +
      '<g fill="#4FA36B"><ellipse cx="46" cy="60" rx="21" ry="16"/><ellipse cx="100" cy="44" rx="21" ry="16"/><ellipse cx="154" cy="60" rx="21" ry="16"/></g>' +
      `<g fill="${EYE}"><circle cx="40" cy="56" r="4"/><circle cx="54" cy="56" r="4"/><circle cx="94" cy="40" r="4"/>` +
      `<circle cx="108" cy="40" r="4"/><circle cx="148" cy="56" r="4"/><circle cx="162" cy="56" r="4"/></g>` +
      `<g fill="none" stroke="${EYE}" stroke-width="2.5" stroke-linecap="round">` +
      '<path d="M40 66 q7 5 14 0"/><path d="M94 50 q7 5 14 0"/><path d="M148 66 q7 5 14 0"/></g>',
  },
  {
    name: "Pegasus",
    svg:
      // wing behind
      '<path d="M88 104 Q66 40 104 22 Q100 50 122 48 Q112 70 132 74 Q112 90 104 104 Z" fill="#FFFFFF"/>' +
      '<g fill="none" stroke="#D8CCF5" stroke-width="3" stroke-linecap="round"><path d="M98 96 Q96 62 104 30"/><path d="M106 96 Q112 70 120 56"/></g>' +
      // tail, legs, body
      '<path d="M54 116 Q26 120 30 152 Q40 140 56 132 Z" fill="#B9A4FF"/>' +
      '<g fill="#EDE7FF"><rect x="62" y="132" width="11" height="44" rx="5"/><rect x="80" y="134" width="11" height="44" rx="5"/>' +
      '<rect x="114" y="134" width="11" height="44" rx="5"/><rect x="132" y="132" width="11" height="44" rx="5"/></g>' +
      '<g fill="#C9B98E"><rect x="62" y="170" width="11" height="8" rx="3"/><rect x="80" y="172" width="11" height="8" rx="3"/>' +
      '<rect x="114" y="172" width="11" height="8" rx="3"/><rect x="132" y="170" width="11" height="8" rx="3"/></g>' +
      '<ellipse cx="100" cy="124" rx="52" ry="26" fill="#F5F1FF"/>' +
      // neck, head, mane
      '<path d="M134 116 Q140 84 154 66 L172 82 Q158 100 150 126 Z" fill="#F5F1FF"/>' +
      '<ellipse cx="166" cy="70" rx="20" ry="15" fill="#F5F1FF" transform="rotate(25 166 70)"/>' +
      '<path d="M150 58 Q138 74 136 100 Q130 80 140 62 Z" fill="#B9A4FF"/>' +
      '<path d="M156 52 L160 40 L166 54 Z" fill="#F5F1FF"/>' +
      `<circle cx="166" cy="66" r="4" fill="${EYE}"/><circle cx="180" cy="80" r="2.5" fill="#9C8BC9"/>`,
  },
  {
    name: "Cerberus",
    svg:
      // body
      '<ellipse cx="100" cy="150" rx="62" ry="34" fill="#6B4A36"/>' +
      '<g fill="#5A3D2C"><ellipse cx="60" cy="182" rx="14" ry="8"/><ellipse cx="140" cy="182" rx="14" ry="8"/></g>' +
      // three heads: ears, faces, muzzles
      '<g fill="#4A3222"><ellipse cx="30" cy="96" rx="9" ry="20"/><ellipse cx="70" cy="96" rx="9" ry="20"/>' +
      '<ellipse cx="80" cy="66" rx="9" ry="20"/><ellipse cx="120" cy="66" rx="9" ry="20"/>' +
      '<ellipse cx="130" cy="96" rx="9" ry="20"/><ellipse cx="170" cy="96" rx="9" ry="20"/></g>' +
      '<g fill="#8A6247"><circle cx="50" cy="104" r="26"/><circle cx="100" cy="74" r="26"/><circle cx="150" cy="104" r="26"/></g>' +
      '<g fill="#D9B48F"><ellipse cx="50" cy="116" rx="15" ry="11"/><ellipse cx="100" cy="86" rx="15" ry="11"/><ellipse cx="150" cy="116" rx="15" ry="11"/></g>' +
      `<g fill="${EYE}"><circle cx="41" cy="98" r="4"/><circle cx="59" cy="98" r="4"/><circle cx="91" cy="68" r="4"/>` +
      `<circle cx="109" cy="68" r="4"/><circle cx="141" cy="98" r="4"/><circle cx="159" cy="98" r="4"/>` +
      '<ellipse cx="50" cy="111" rx="5" ry="4"/><ellipse cx="100" cy="81" rx="5" ry="4"/><ellipse cx="150" cy="111" rx="5" ry="4"/></g>' +
      '<g fill="#FF8FA3"><ellipse cx="50" cy="124" rx="4" ry="5"/><ellipse cx="100" cy="94" rx="4" ry="5"/><ellipse cx="150" cy="124" rx="4" ry="5"/></g>',
  },
  {
    name: "Minotaur",
    svg:
      // horns
      '<g fill="#F2E6C9"><path d="M58 70 Q24 62 22 30 Q42 50 66 56 Z"/><path d="M142 70 Q176 62 178 30 Q158 50 134 56 Z"/></g>' +
      // ears, head
      '<g fill="#7A4E2A"><ellipse cx="44" cy="92" rx="18" ry="10" transform="rotate(-20 44 92)"/><ellipse cx="156" cy="92" rx="18" ry="10" transform="rotate(20 156 92)"/></g>' +
      '<path d="M54 74 Q100 40 146 74 Q156 120 136 150 Q100 176 64 150 Q44 120 54 74 Z" fill="#9C6B3C"/>' +
      '<path d="M86 58 Q100 46 114 58 Q108 70 100 64 Q92 70 86 58 Z" fill="#6B4423"/>' +
      // muzzle with ring
      '<ellipse cx="100" cy="138" rx="34" ry="24" fill="#E8C9A0"/>' +
      `<g fill="${EYE}"><ellipse cx="88" cy="136" rx="5" ry="7"/><ellipse cx="112" cy="136" rx="5" ry="7"/>` +
      '<circle cx="78" cy="104" r="6"/><circle cx="122" cy="104" r="6"/></g>' +
      '<path d="M90 150 Q100 168 110 150" fill="none" stroke="#F2C14E" stroke-width="5" stroke-linecap="round"/>',
  },
  {
    name: "Griffin",
    svg:
      // wing behind
      '<path d="M84 110 Q60 46 100 26 Q100 52 120 50 Q112 72 134 76 Q114 92 104 110 Z" fill="#A4683B"/>' +
      '<g fill="none" stroke="#7A4A26" stroke-width="3" stroke-linecap="round"><path d="M94 100 Q92 64 100 34"/><path d="M104 100 Q110 74 118 58"/></g>' +
      // lion tail and body
      '<path d="M50 132 Q22 128 20 104" fill="none" stroke="#E3B04B" stroke-width="8" stroke-linecap="round"/>' +
      '<circle cx="20" cy="100" r="8" fill="#B07A2A"/>' +
      '<g fill="#D9A03C"><rect x="58" y="138" width="12" height="40" rx="6"/><rect x="78" y="140" width="12" height="40" rx="6"/>' +
      '<rect x="114" y="140" width="12" height="40" rx="6"/><rect x="132" y="138" width="12" height="40" rx="6"/></g>' +
      '<ellipse cx="100" cy="130" rx="52" ry="26" fill="#E3B04B"/>' +
      // eagle head
      '<circle cx="152" cy="92" r="26" fill="#FFF4E2"/>' +
      '<path d="M172 86 L196 98 L172 108 Q178 96 172 86 Z" fill="#F2C14E"/>' +
      `<circle cx="158" cy="86" r="5" fill="${EYE}"/>` +
      '<path d="M138 72 L146 60 L150 72 Z" fill="#FFF4E2"/>',
  },
  {
    name: "Phoenix",
    svg:
      // flame tail
      '<g fill="#FF7A2A"><path d="M100 132 Q70 164 78 196 Q92 172 100 150 Z"/><path d="M100 132 Q130 164 122 196 Q108 172 100 150 Z"/>' +
      '<path d="M100 136 Q100 170 100 198 Q92 176 96 150 Z"/></g>' +
      '<g fill="#FFD166"><path d="M100 140 Q86 164 90 184 Q98 166 100 152 Z"/><path d="M100 140 Q114 164 110 184 Q102 166 100 152 Z"/></g>' +
      // wings up
      '<path d="M84 104 Q40 96 22 52 Q52 66 66 60 Q60 76 86 88 Z" fill="#E8432F"/>' +
      '<path d="M116 104 Q160 96 178 52 Q148 66 134 60 Q140 76 114 88 Z" fill="#E8432F"/>' +
      '<g fill="#FF9A3D"><path d="M84 98 Q54 90 42 64 Q62 74 84 86 Z"/><path d="M116 98 Q146 90 158 64 Q138 74 116 86 Z"/></g>' +
      // body and head with crest
      '<ellipse cx="100" cy="110" rx="24" ry="32" fill="#FF6A3D"/>' +
      '<circle cx="100" cy="66" r="18" fill="#FF6A3D"/>' +
      '<g fill="#FFD166"><path d="M92 50 L88 30 L98 46 Z"/><path d="M100 48 L100 24 L106 46 Z"/><path d="M108 50 L114 32 L112 50 Z"/></g>' +
      `<circle cx="94" cy="64" r="4" fill="${EYE}"/><circle cx="106" cy="64" r="4" fill="${EYE}"/>` +
      '<path d="M96 72 L104 72 L100 80 Z" fill="#F2C14E"/>',
  },
  {
    name: "Centaur",
    svg:
      // horse body, tail and legs
      '<path d="M58 120 Q30 126 34 160 Q44 146 62 136 Z" fill="#5A3D2C"/>' +
      '<g fill="#8A5A35"><rect x="66" y="136" width="11" height="44" rx="5"/><rect x="84" y="138" width="11" height="44" rx="5"/>' +
      '<rect x="124" y="138" width="11" height="44" rx="5"/><rect x="142" y="136" width="11" height="44" rx="5"/></g>' +
      '<g fill="#3A2A1E"><rect x="66" y="174" width="11" height="7" rx="3"/><rect x="84" y="176" width="11" height="7" rx="3"/>' +
      '<rect x="124" y="176" width="11" height="7" rx="3"/><rect x="142" y="174" width="11" height="7" rx="3"/></g>' +
      '<ellipse cx="110" cy="128" rx="54" ry="26" fill="#A0703F"/>' +
      // tunic torso and arms (one waving)
      '<path d="M118 120 Q114 84 128 70 L156 70 Q170 84 166 120 Z" fill="#3D7DD8"/>' +
      '<g stroke="#E0B48A" stroke-width="10" stroke-linecap="round" fill="none"><path d="M130 80 Q116 96 120 110"/><path d="M156 80 Q176 66 176 46"/></g>' +
      // head with hair
      '<circle cx="142" cy="50" r="20" fill="#E0B48A"/>' +
      '<path d="M122 48 Q124 24 142 24 Q162 24 162 46 Q152 34 142 36 Q130 36 122 48 Z" fill="#5A3D2C"/>' +
      `<circle cx="135" cy="52" r="3.5" fill="${EYE}"/><circle cx="149" cy="52" r="3.5" fill="${EYE}"/>` +
      `<path d="M135 60 Q142 66 149 60" fill="none" stroke="${EYE}" stroke-width="2.5" stroke-linecap="round"/>`,
  },
  {
    name: "Medusa",
    svg:
      // friendly little snakes for hair
      '<g fill="none" stroke="#5FB86A" stroke-width="10" stroke-linecap="round">' +
      '<path d="M66 70 Q40 60 36 34"/><path d="M84 56 Q74 30 82 12"/><path d="M116 56 Q126 30 118 12"/>' +
      '<path d="M134 70 Q160 60 164 34"/><path d="M60 94 Q32 98 22 80"/><path d="M140 94 Q168 98 178 80"/></g>' +
      '<g fill="#5FB86A"><circle cx="36" cy="30" r="9"/><circle cx="82" cy="10" r="9"/><circle cx="118" cy="10" r="9"/>' +
      '<circle cx="164" cy="30" r="9"/><circle cx="20" cy="78" r="9"/><circle cx="180" cy="78" r="9"/></g>' +
      `<g fill="${EYE}"><circle cx="34" cy="28" r="2"/><circle cx="38" cy="28" r="2"/><circle cx="80" cy="8" r="2"/>` +
      `<circle cx="84" cy="8" r="2"/><circle cx="116" cy="8" r="2"/><circle cx="120" cy="8" r="2"/>` +
      `<circle cx="162" cy="28" r="2"/><circle cx="166" cy="28" r="2"/><circle cx="18" cy="76" r="2"/>` +
      `<circle cx="22" cy="76" r="2"/><circle cx="178" cy="76" r="2"/><circle cx="182" cy="76" r="2"/></g>` +
      // face with happy closed eyes and a smile
      '<circle cx="100" cy="112" r="50" fill="#A8DC90"/>' +
      '<path d="M54 92 Q100 52 146 92 Q120 76 100 78 Q80 76 54 92 Z" fill="#5FB86A"/>' +
      `<g fill="none" stroke="${EYE}" stroke-width="4" stroke-linecap="round"><path d="M74 112 q8 -8 16 0"/><path d="M110 112 q8 -8 16 0"/>` +
      '<path d="M84 134 Q100 148 116 134"/></g>' +
      '<g fill="#F5A3B8"><circle cx="70" cy="128" r="8"/><circle cx="130" cy="128" r="8"/></g>' +
      // a little gold headband
      '<path d="M62 84 Q100 66 138 84" fill="none" stroke="#F2C14E" stroke-width="5" stroke-linecap="round"/>',
  },
];

/** A little Greek temple. */
export const MYTH_EMBLEM =
  '<path d="M100 22 L178 64 H22 Z" fill="#7B9CFF"/>' +
  '<rect x="22" y="64" width="156" height="12" rx="3" fill="#5A7BE0"/>' +
  '<g fill="#E8ECFF"><rect x="34" y="80" width="18" height="76" rx="3"/><rect x="66" y="80" width="18" height="76" rx="3"/>' +
  '<rect x="116" y="80" width="18" height="76" rx="3"/><rect x="148" y="80" width="18" height="76" rx="3"/></g>' +
  '<rect x="18" y="158" width="164" height="14" rx="3" fill="#5A7BE0"/>' +
  '<rect x="10" y="172" width="180" height="12" rx="3" fill="#7B9CFF"/>' +
  '<circle cx="100" cy="48" r="8" fill="#F2C14E"/>';
