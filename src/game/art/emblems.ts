// Quest emblems copied verbatim from reference/times-tables.html (L771–803).

const snowArm = '<path d="M82 36 L100 54 L118 36 M82 164 L100 146 L118 164"/>';
export const EMBLEMS: Record<string, string> = {
  mystery: '<path d="M100 64 Q68 18 50 38 Q42 60 100 64 Q132 18 150 38 Q158 60 100 64 Z" fill="#FFC145"/>' +
           '<rect x="36" y="88" width="128" height="92" rx="10" fill="#9B6BFF"/>' +
           '<rect x="26" y="62" width="148" height="34" rx="8" fill="#B48CFF"/>' +
           '<rect x="90" y="62" width="20" height="118" fill="#FFC145"/>' +
           '<g fill="#FFF4E2" font-family="Fredoka, sans-serif" font-weight="700" font-size="48" text-anchor="middle">' +
           '<text x="63" y="156">?</text><text x="137" y="156">?</text></g>',
  pick: '<path d="M100 18 L123 72 L182 76 L137 114 L151 172 L100 141 L49 172 L63 114 L18 76 L77 72 Z" fill="#FFC145"/>',
  water: '<path d="M100 22 Q152 92 152 126 A52 52 0 0 1 48 126 Q48 92 100 22 Z" fill="#5FC6E8"/>' +
         '<path d="M76 120 Q76 142 96 152" fill="none" stroke="#C9F1FC" stroke-width="9" stroke-linecap="round"/>',
  earth: '<circle cx="100" cy="100" r="76" fill="#4BA3E3"/>' +
         '<g fill="#7CC46A"><path d="M60 50 Q86 38 98 60 Q92 82 70 84 Q50 90 46 70 Q44 56 60 50 Z"/>' +
         '<path d="M112 90 Q142 82 154 104 Q152 134 126 142 Q106 152 102 128 Q98 106 112 90 Z"/>' +
         '<path d="M62 118 Q80 116 82 136 Q76 154 60 148 Q50 134 62 118 Z"/></g>' +
         '<path d="M58 44 Q40 60 36 84" fill="none" stroke="#BDE6FA" stroke-width="7" stroke-linecap="round"/>',
  fire: '<path d="M100 18 Q156 76 146 128 Q138 176 100 180 Q62 176 54 128 Q50 92 80 64 Q82 96 98 104 Q88 64 100 18 Z" fill="#FF7A2A"/>' +
        '<path d="M100 96 Q128 126 120 150 Q112 166 100 166 Q88 166 80 150 Q74 128 100 96 Z" fill="#FFD166"/>',
  ice: '<g stroke="#BDE3F7" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
       '<path d="M100 20 V180 M30.7 60 L169.3 140 M30.7 140 L169.3 60"/>' +
       snowArm + '<g transform="rotate(60 100 100)">' + snowArm + '</g><g transform="rotate(120 100 100)">' + snowArm + "</g></g>",
  emerald: '<path d="M70 30 H130 L165 65 V135 L130 170 H70 L35 135 V65 Z" fill="#3DD68C"/>' +
           '<path d="M84 60 H116 L136 80 V120 L116 140 H84 L64 120 V80 Z" fill="#8CEBBC"/>' +
           '<path d="M70 30 L84 60 M130 30 L116 60 M165 65 L136 80 M165 135 L136 120 M130 170 L116 140 M70 170 L84 140 M35 135 L64 120 M35 65 L64 80" stroke="#1FA36B" stroke-width="5"/>',
  ruby: '<path d="M100 22 L164 60 L164 140 L100 178 L36 140 L36 60 Z" fill="#E0245A"/>' +
        '<path d="M100 62 L134 82 L134 118 L100 138 L66 118 L66 82 Z" fill="#FF7C9C"/>' +
        '<path d="M100 22 V62 M164 60 L134 82 M164 140 L134 118 M100 178 V138 M36 140 L66 118 M36 60 L66 82" stroke="#B3123A" stroke-width="5"/>',
  golden: '<path d="M30 150 L40 60 L75 100 L100 40 L125 100 L160 60 L170 150 Z" fill="#FFCC33"/>' +
          '<rect x="30" y="140" width="140" height="26" rx="6" fill="#E8B020"/>' +
          '<g fill="#FF4F7B"><circle cx="40" cy="58" r="11"/><circle cx="100" cy="38" r="11"/><circle cx="160" cy="58" r="11"/></g>',
  diamond: '<path d="M58 56 H142 L176 94 L100 178 L24 94 Z" fill="#A8F0F5"/>' +
           '<path d="M24 94 H176 M58 56 L78 94 L100 178 L122 94 L142 56 M78 94 L100 56 L122 94" fill="none" stroke="#5CC8F0" stroke-width="5" stroke-linejoin="round"/>'
};
