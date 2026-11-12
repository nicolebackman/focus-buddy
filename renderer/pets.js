// The buddy family. Every pet is built on ONE construction so they read as a set:
//   - same head (ellipse 54×46 at 100,92), same bean body, same paws and feet,
//   - the same face rig (eyes at x=82/118, nose at 100,101) and the same five expressions,
//   - one darker "deep" tone of the body color for depth instead of outlines.
// Only the species parts (ears, tail, crown, muzzle) and the colorway change.
// Faces switch with a class on <body>: face-idle | face-focus | face-rest | face-alert | face-proud

const INK = "#1D1916";

const COLORS = {
  red:        { label: "Tomato",     body: "#EA3A1F", deep: "#C2260E", accent: "#CFEF55", collar: "#6C4CF1", cheek: "#FF9DBA" },
  violet:     { label: "Violet",     body: "#6C4CF1", deep: "#5034CF", accent: "#EA3A1F", collar: "#CFEF55", cheek: "#F68BD3" },
  chartreuse: { label: "Lime",       body: "#CFEF55", deep: "#A8C935", accent: "#6C4CF1", collar: "#EA3A1F", cheek: "#F68BD3" },
  pink:       { label: "Bubblegum",  body: "#F68BD3", deep: "#D763B4", accent: "#6C4CF1", collar: "#EA3A1F", cheek: "#FFC4EA" },
  sky:        { label: "Sky",        body: "#74B6FF", deep: "#4F8FDE", accent: "#EA3A1F", collar: "#CFEF55", cheek: "#F68BD3" },
};

const SPECIES = {
  tomato: { label: "Tomato", name: "Pip",  defaultColor: "red" },
  dog:    { label: "Pup",    name: "Bo",   defaultColor: "violet" },
  cat:    { label: "Cat",    name: "Miso", defaultColor: "chartreuse" },
  bunny:  { label: "Bunny",  name: "Hops", defaultColor: "pink" },
  bear:   { label: "Bear",   name: "Nori", defaultColor: "sky" },
};

const mirror = (inner) => `${inner}<g transform="translate(200 0) scale(-1 1)">${inner}</g>`;

function speciesParts(sp, c) {
  switch (sp) {
    case "dog": return {
      back: `<path d="M138 186 C160 184 170 162 160 144" fill="none" stroke="${c.body}" stroke-width="12" stroke-linecap="round" class="tail"/>`,
      ears: mirror(`<path d="M70 52 C48 46 28 74 32 104 C35 124 56 126 62 110 C68 94 78 66 70 52 Z" fill="${c.accent}"/>`),
      front: "",
    };
    case "cat": return {
      back: `<path d="M138 190 C174 188 178 150 160 136" fill="none" stroke="${c.body}" stroke-width="11" stroke-linecap="round" class="tail"/>`,
      ears: mirror(`<path d="M56 74 L64 34 L94 54 Z" fill="${c.body}" stroke="${c.body}" stroke-width="8" stroke-linejoin="round"/><path d="M66 60 L69 44 L84 54 Z" fill="${c.accent}" stroke="${c.accent}" stroke-width="4" stroke-linejoin="round"/>`),
      front: mirror(`<path d="M62 100 L44 96 M62 106 L45 108" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>`),
    };
    case "bunny": return {
      back: `<circle cx="141" cy="188" r="11" fill="#FFF6FB"/>`,
      ears: mirror(`<ellipse cx="78" cy="38" rx="14" ry="38" transform="rotate(-12 78 38)" fill="${c.body}"/><ellipse cx="78" cy="42" rx="6.5" ry="26" transform="rotate(-12 78 42)" fill="${c.accent}"/>`),
      front: "",
    };
    case "bear": return {
      back: "",
      ears: mirror(`<circle cx="60" cy="56" r="17" fill="${c.body}"/><circle cx="60" cy="56" r="9" fill="${c.accent}"/>`),
      front: `<ellipse cx="100" cy="106" rx="19" ry="14" fill="${c.deep}" opacity=".45"/>`,
    };
    default: return { back: "", ears: "", front: "" };
  }
}

const FACES = `
  <g class="face f-idle">
    <ellipse cx="82" cy="90" rx="5.5" ry="7" fill="${INK}"/><ellipse cx="118" cy="90" rx="5.5" ry="7" fill="${INK}"/>
    <path d="M93 110 Q100 116 107 110" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
  </g>
  <g class="face f-focus">
    <path d="M74 80 L89 82.5 M126 80 L111 82.5" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
    <ellipse cx="82" cy="91" rx="5" ry="5.5" fill="${INK}"/><ellipse cx="118" cy="91" rx="5" ry="5.5" fill="${INK}"/>
    <path d="M95 111 L105 111" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
  </g>
  <g class="face f-rest">
    <path d="M74 93 Q82 82 90 93 M110 93 Q118 82 126 93" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M92 108 Q100 118 108 108" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
  </g>
  <g class="face f-alert">
    <circle cx="82" cy="89" r="8" fill="${INK}"/><circle cx="84.5" cy="86" r="2.8" fill="#fff"/>
    <circle cx="118" cy="89" r="8" fill="${INK}"/><circle cx="120.5" cy="86" r="2.8" fill="#fff"/>
    <ellipse cx="100" cy="113" rx="4.5" ry="5.5" fill="${INK}"/>
  </g>
  <g class="face f-proud">
    <path d="M74 92 Q82 81 90 92 M110 92 Q118 81 126 92" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M90 106 Q100 124 110 106 Z" fill="${INK}"/><ellipse cx="100" cy="115" rx="5" ry="3.4" fill="#F68BD3"/>
  </g>`;

function petSVG(species = "tomato", colorKey, opts = {}) {
  const sp = SPECIES[species] ? species : "tomato";
  const c = COLORS[colorKey] || COLORS[SPECIES[sp].defaultColor];
  const p = speciesParts(sp, c);
  const nose = sp === "tomato" ? "" : `<path d="M96 99 L104 99 L100 104 Z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  const cheeks = `<ellipse cx="70" cy="104" rx="8" ry="5" fill="${c.cheek}" opacity=".85"/><ellipse cx="130" cy="104" rx="8" ry="5" fill="${c.cheek}" opacity=".85"/>`;
  const feet = mirror(`<ellipse cx="80" cy="200" rx="17" ry="9" fill="${c.body}"/><path d="M76 197 L76 203 M84 197 L84 203" stroke="${c.deep}" stroke-width="2.4" stroke-linecap="round"/>`);
  let figure;
  if (sp === "tomato") {
    // Pip keeps the same face rig, feet and proportions — the head and body are one round fruit.
    figure = `${feet}
      <ellipse cx="100" cy="130" rx="70" ry="66" fill="${c.body}"/>
      <path d="M48 170 Q100 206 152 170 Q140 196 100 196 Q60 196 48 170 Z" fill="${c.deep}" opacity=".3"/>
      <g transform="translate(0 70)" fill="#3FA35B">
        <path d="M100 -2 C86 -18 66 -14 60 -4 C74 -6 86 -2 100 2 Z"/><path d="M100 -2 C114 -18 134 -14 140 -4 C126 -6 114 -2 100 2 Z"/>
        <path d="M100 0 C92 -8 94 -18 104 -26 C104 -16 106 -8 102 2 Z"/>
      </g>
      <g transform="translate(0 30)">${cheeks}<g class="face-rig">${FACES}</g></g>`;
  } else {
    figure = `${p.back}${feet}
      <path d="M58 198 C54 162 72 128 100 128 C128 128 146 162 142 198 C142 206 58 206 58 198 Z" fill="${c.body}"/>
      ${mirror(`<path d="M72 150 Q70 172 88 180" fill="none" stroke="${c.deep}" stroke-width="11" stroke-linecap="round"/>`)}
      ${p.ears}
      <ellipse cx="100" cy="92" rx="54" ry="46" fill="${c.body}"/>
      <rect x="70" y="128" width="60" height="10" rx="5" fill="${c.collar}"/>
      ${p.front}${cheeks}${nose}<g class="face-rig">${FACES}</g>`;
  }
  return `<svg viewBox="0 0 200 214" class="pet-svg pet-${sp}" aria-hidden="true"${opts.label ? ` role="img" aria-label="${opts.label}"` : ""}>
    <g class="pet-bob">${figure}</g></svg>`;
}

// The brand mark from the references, redrawn: an 8-arm asterisk with rounded arms.
function sparkleSVG(color, size = 24) {
  const arms = [0, 45, 90, 135].map((a) => `<rect x="10.4" y="1" width="3.2" height="22" rx="1.6" transform="rotate(${a} 12 12)"/>`).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" aria-hidden="true">${arms}</svg>`;
}

window.Pets = { COLORS, SPECIES, petSVG, sparkleSVG,
  nameFor: (s) => (s.petName && s.petName.trim()) || (SPECIES[s.pet] || SPECIES.tomato).name,
  colorFor: (s) => COLORS[s.petColor] || COLORS[(SPECIES[s.pet] || SPECIES.tomato).defaultColor],
};
window.renderPet = function (el, settings) {
  const key = settings.pet + "|" + settings.petColor;
  if (el.dataset.petKey === key) return;
  el.dataset.petKey = key;
  el.innerHTML = petSVG(settings.pet, settings.petColor);
};
window.setPetFace = function (face) {
  const b = document.body;
  b.classList.remove("face-idle", "face-focus", "face-rest", "face-alert", "face-proud");
  b.classList.add("face-" + face);
};
window.faceForMode = (mode) => (mode === "focus" ? "focus" : mode === "short" || mode === "long" ? "rest" : "idle");
window.fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};
