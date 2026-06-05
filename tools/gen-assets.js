/**
 * Professional placeholder cover-art generator.
 * Produces clean, branded SVG covers in assets/games/ so the site looks
 * finished before licensed artwork is added.
 *
 * Run:  node tools/gen-assets.js
 *
 * To use LICENSED art instead: drop <id>.png/.jpg/.webp into assets/games/
 * (same id as below). The UI's coverHTML() prefers those over the .svg.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'games');
fs.mkdirSync(OUT, { recursive: true });

// id, title (wrapped), tag line, two-stop gradient, accent
const GAMES = [
  ['free-fire',        ['FREE', 'FIRE'],            'GARENA',               '#ff8a3d', '#7a0d0d', '#ffd089'],
  ['bgmi',             ['BGMI'],                    'KRAFTON',              '#ffcf3d', '#6b4e00', '#fff0b0'],
  ['pubg-mobile',      ['PUBG', 'MOBILE'],          'KRAFTON',              '#f2a93b', '#5e3d00', '#ffe0a3'],
  ['mobile-legends',   ['MOBILE', 'LEGENDS'],       'MOONTON',              '#6c8cff', '#16205e', '#c3d0ff'],
  ['genshin-impact',   ['GENSHIN', 'IMPACT'],       'HOYOVERSE',            '#39b6f2', '#0e3a6b', '#bfe6ff'],
  ['cod-mobile',       ['CALL OF DUTY', 'MOBILE'],  'ACTIVISION',           '#2fd29a', '#0a3f30', '#bff3e2'],
  ['valorant',         ['VALORANT'],                'RIOT GAMES',           '#ff5470', '#5e0a24', '#ffc6d2'],
  ['clash-of-clans',   ['CLASH OF', 'CLANS'],       'SUPERCELL',            '#43d67a', '#0e4a26', '#c4f5d6'],
  ['clash-royale',     ['CLASH', 'ROYALE'],         'SUPERCELL',            '#4f9bff', '#10306e', '#c3dcff'],
  ['honkai-star-rail', ['HONKAI', 'STAR RAIL'],     'HOYOVERSE',            '#a16bff', '#33156e', '#dccbff'],
  ['wild-rift',        ['WILD', 'RIFT'],            'RIOT GAMES',           '#3db6f2', '#0a3a5c', '#bfe6ff'],
  ['pokemon-unite',    ['POKEMON', 'UNITE'],        'THE POKEMON COMPANY',  '#ffab2e', '#7a4a00', '#ffe2ab'],
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg([id, lines, tag, c1, c2, accent]) {
  const titleSpans = lines.map((ln, i) => {
    const y = lines.length === 1 ? 430 : 410 + i * 64;
    const size = ln.length > 9 ? 52 : 64;
    return `<text x="300" y="${y}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="800" fill="#fff" letter-spacing="1">${esc(ln)}</text>`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800" role="img" aria-label="${esc(lines.join(' '))} cover">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="gl" cx="50%" cy="32%" r="65%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".30"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#bg)"/>
  <rect width="600" height="800" fill="url(#gl)"/>
  <g opacity=".12" stroke="#fff" stroke-width="2" fill="none">
    <circle cx="300" cy="290" r="120"/><circle cx="300" cy="290" r="180"/><circle cx="300" cy="290" r="240"/>
  </g>
  <g opacity=".10" fill="#fff">
    <polygon points="300,90 330,150 300,150"/><polygon points="120,640 180,640 150,700"/><polygon points="470,150 520,150 495,200"/>
  </g>
  <polygon points="300,150 412,213 412,337 300,400 188,337 188,213" fill="#fff" fill-opacity=".10"/>
  <polygon points="300,180 386,228 386,322 300,370 214,322 214,228" fill="#fff" fill-opacity=".14"/>
  <circle cx="300" cy="275" r="44" fill="${accent}" fill-opacity=".9"/>
  <text x="300" y="292" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="46" font-weight="900" fill="${c2}">${esc(lines[0][0])}</text>
  <rect width="600" height="800" fill="url(#vig)"/>
  ${titleSpans}
  <text x="300" y="${lines.length === 1 ? 486 : 410 + lines.length * 64 + 22}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="600" fill="${accent}" letter-spacing="3">${esc(tag)}</text>
  <rect x="0" y="720" width="600" height="80" fill="#000" fill-opacity=".25"/>
  <text x="300" y="770" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#fff" letter-spacing="2">TOP UP</text>
</svg>
`;
}

let n = 0;
for (const g of GAMES) {
  fs.writeFileSync(path.join(OUT, `${g[0]}.svg`), svg(g), 'utf8');
  n++;
}
console.log(`Generated ${n} cover SVGs in assets/games/`);
