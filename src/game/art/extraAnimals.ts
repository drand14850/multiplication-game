// Rare animals added after the port (2026-10-19), drawn to match the reference's style:
// flat fills, round friendly shapes, dark eyes, 200×200. Not in the reference file.
// They come after the reference's 18 animals, so nothing about the original ones changes.

export const EXTRA_RARES: readonly { name: string; svg: string }[] = [
  {
    name: "Narwhal",
    svg:
      // tusk
      '<path d="M162 86 L198 40" stroke="#F4EBD0" stroke-width="8" stroke-linecap="round"/>' +
      '<g stroke="#C9B98E" stroke-width="2"><path d="M170 82 l6 4"/><path d="M178 72 l6 4"/><path d="M186 62 l6 4"/></g>' +
      // body, tail on the left
      '<path d="M176 114 Q176 66 110 66 Q50 66 40 104 L14 80 L18 146 L44 128 Q64 158 110 158 Q176 158 176 114 Z" fill="#8FA8C8"/>' +
      '<path d="M164 130 Q112 154 52 130 Q66 156 110 156 Q150 156 164 130 Z" fill="#DCE7F2"/>' +
      '<g fill="#6F86A8"><circle cx="92" cy="86" r="5"/><circle cx="112" cy="80" r="4"/><circle cx="76" cy="100" r="4"/><circle cx="100" cy="102" r="3"/></g>' +
      '<circle cx="140" cy="100" r="7" fill="#1E2A3A"/>' +
      '<path d="M156 122 q-14 10 -30 4" fill="none" stroke="#1E2A3A" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="150" cy="114" r="7" fill="#F5B7C8"/>',
  },
  {
    name: "Flamingo",
    svg:
      // legs (one tucked up)
      '<g stroke="#E85C8A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
      '<path d="M92 146 L92 194"/><path d="M104 146 L112 170 L94 172"/></g>' +
      // body and wing
      '<ellipse cx="96" cy="124" rx="48" ry="30" fill="#FF8FB3"/>' +
      '<path d="M66 116 Q96 98 130 116 Q110 136 74 132 Z" fill="#F7699B"/>' +
      // neck and head
      '<path d="M132 112 Q156 88 138 64 Q122 44 134 26" fill="none" stroke="#FF8FB3" stroke-width="15" stroke-linecap="round"/>' +
      '<circle cx="136" cy="28" r="17" fill="#FF8FB3"/>' +
      '<path d="M150 22 Q172 26 172 46 Q164 38 150 36 Z" fill="#FFF4E2"/>' +
      '<path d="M164 36 Q172 40 172 46 Q166 44 160 39 Z" fill="#2B2B2B"/>' +
      '<circle cx="138" cy="24" r="4" fill="#3A2A1E"/>',
  },
  {
    name: "Red Panda",
    svg:
      '<g fill="#C1440E"><path d="M44 80 L50 34 L90 58 Z"/><path d="M156 80 L150 34 L110 58 Z"/></g>' +
      '<g fill="#FFF4E2"><path d="M55 71 L59 46 L80 60 Z"/><path d="M145 71 L141 46 L120 60 Z"/></g>' +
      '<ellipse cx="100" cy="114" rx="64" ry="54" fill="#D9541A"/>' +
      '<g fill="#FFF4E2"><ellipse cx="64" cy="128" rx="19" ry="15"/><ellipse cx="136" cy="128" rx="19" ry="15"/>' +
      '<ellipse cx="100" cy="138" rx="21" ry="17"/><ellipse cx="74" cy="92" rx="11" ry="6"/><ellipse cx="126" cy="92" rx="11" ry="6"/></g>' +
      '<g fill="#7A2A08"><path d="M78 106 Q68 130 82 146 Q76 122 86 108 Z"/><path d="M122 106 Q132 130 118 146 Q124 122 114 108 Z"/></g>' +
      '<circle cx="80" cy="108" r="7" fill="#2B1A12"/><circle cx="120" cy="108" r="7" fill="#2B1A12"/>' +
      '<ellipse cx="100" cy="130" rx="9" ry="6" fill="#2B1A12"/>' +
      '<path d="M100 136 v6 M100 142 q-8 7 -14 1 M100 142 q8 7 14 1" fill="none" stroke="#2B1A12" stroke-width="3" stroke-linecap="round"/>',
  },
  {
    name: "Sloth",
    svg:
      // hanging from a branch
      '<rect x="10" y="24" width="180" height="12" rx="6" fill="#8A5A35"/>' +
      '<g stroke="#A08262" stroke-width="16" stroke-linecap="round" fill="none"><path d="M64 122 Q50 72 64 36"/><path d="M136 122 Q150 72 136 36"/></g>' +
      '<g stroke="#F2E6DA" stroke-width="4" stroke-linecap="round"><path d="M58 28 l-4 12 M64 28 l0 13 M70 28 l4 12"/>' +
      '<path d="M130 28 l-4 12 M136 28 l0 13 M142 28 l4 12"/></g>' +
      '<circle cx="100" cy="132" r="54" fill="#A08262"/>' +
      '<ellipse cx="100" cy="136" rx="42" ry="33" fill="#E8D5B5"/>' +
      '<g fill="#5A4030"><ellipse cx="80" cy="130" rx="15" ry="8" transform="rotate(-20 80 130)"/><ellipse cx="120" cy="130" rx="15" ry="8" transform="rotate(20 120 130)"/></g>' +
      '<circle cx="80" cy="130" r="5" fill="#1E140E"/><circle cx="120" cy="130" r="5" fill="#1E140E"/>' +
      '<ellipse cx="100" cy="144" rx="7" ry="5" fill="#3A2A1E"/>' +
      '<path d="M90 154 Q100 162 110 154" fill="none" stroke="#3A2A1E" stroke-width="3" stroke-linecap="round"/>',
  },
  {
    name: "Peacock",
    svg:
      // tail fan of eye feathers
      '<g fill="#1F9E8A">' +
      '<ellipse cx="30" cy="109" rx="18" ry="22"/><ellipse cx="45" cy="82" rx="18" ry="22"/><ellipse cx="70" cy="63" rx="18" ry="22"/>' +
      '<ellipse cx="100" cy="56" rx="18" ry="22"/><ellipse cx="130" cy="63" rx="18" ry="22"/><ellipse cx="155" cy="82" rx="18" ry="22"/>' +
      '<ellipse cx="170" cy="109" rx="18" ry="22"/></g>' +
      '<g fill="#F2C14E"><circle cx="30" cy="109" r="10"/><circle cx="45" cy="82" r="10"/><circle cx="70" cy="63" r="10"/>' +
      '<circle cx="100" cy="56" r="10"/><circle cx="130" cy="63" r="10"/><circle cx="155" cy="82" r="10"/><circle cx="170" cy="109" r="10"/></g>' +
      '<g fill="#2457C5"><circle cx="30" cy="109" r="5"/><circle cx="45" cy="82" r="5"/><circle cx="70" cy="63" r="5"/>' +
      '<circle cx="100" cy="56" r="5"/><circle cx="130" cy="63" r="5"/><circle cx="155" cy="82" r="5"/><circle cx="170" cy="109" r="5"/></g>' +
      // body, head, crest
      '<ellipse cx="100" cy="140" rx="27" ry="38" fill="#2A6FD6"/>' +
      '<circle cx="100" cy="98" r="19" fill="#2A6FD6"/>' +
      '<g stroke="#2A6FD6" stroke-width="3" stroke-linecap="round"><path d="M100 80 V64 M94 81 L88 66 M106 81 L112 66"/></g>' +
      '<g fill="#F2C14E"><circle cx="100" cy="62" r="4"/><circle cx="87" cy="64" r="4"/><circle cx="113" cy="64" r="4"/></g>' +
      '<circle cx="93" cy="96" r="4" fill="#1A1A2E"/><circle cx="107" cy="96" r="4" fill="#1A1A2E"/>' +
      '<path d="M96 104 L104 104 L100 112 Z" fill="#F2C14E"/>' +
      '<g stroke="#C9A04A" stroke-width="5" stroke-linecap="round"><path d="M92 176 v14 M108 176 v14"/></g>',
  },
];
