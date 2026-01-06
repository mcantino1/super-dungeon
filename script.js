/*
  NOTE: Fix for ReferenceError: MAX_SIZE is not defined
  - MAX_SIZE is defined early and used for grid scaling and clamping.
*/

/* ---------------- Constants / Game State ---------------- */
const MAX_SIZE = 12; // maximum grid size used for consistent scaling
const MAX_LIFE = 100; // global maximum life cap for players

// Audio setup for footstep sounds
let footstepAudio = null;

function playWallBumpSound() {
  // Original beep sound for wall bumps
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const duration = 0.1; // 100ms
  const now = audioContext.currentTime;
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 150; // Low frequency
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.1, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);
  
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function initFootstepSound() {
  // Create a percussive footstep sound using Web Audio API
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;
  const duration = 0.08; // 80ms for quick percussive sound
  
  // Create low-mid frequency oscillator for footstep tone
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Use a lower frequency that drops quickly for percussive effect
  oscillator.frequency.setValueAtTime(120, now);
  oscillator.frequency.exponentialRampToValueAtTime(60, now + duration);
  oscillator.type = 'sine';
  
  // Quick attack, sharp decay for percussive feel
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.15, now + 0.01); // Quick attack (10ms)
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration); // Sharp decay
  
  oscillator.start(now);
  oscillator.stop(now + duration);
}

let currentLevelId = "level1";
let level = null;
let player = { row: 0, col: 0 };
let visited = new Set();
let revealedByBump = new Set();
// Revealed tiles around the player (fog-of-war neighbors)
let revealedNeighbors = new Set();
// Tracks discovered special icons even after the item is collected/removed.
// Map of pos -> type ("key" | "treasure" | "monster").
let revealedSpecial = new Map();
let completed = false;
let stats = { life: 10, strength: 2, defense: 0, gold: 0, key: false };
let discoveryLog = [];

// Monsters are tracked separately so they can have HP and be defeated.
// Keyed by position string like "D3".
let monsters = new Map(); // pos -> { hp, attack }

/* ---------------- SVG ICONS ---------------- */
function svgWrap(inner) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
}
const ICONS = {
  player: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false">' +
    '<defs><style>.cls-1{fill:currentColor}.cls-1,.cls-2{stroke:currentColor;stroke-miterlimit:10;stroke-width:4px}.cls-2{fill:none}</style></defs>' +
    '<g><g id="Layer_1"><rect class="cls-2" x="32.6" y="38.8" width="2.4" height="31.2" transform="translate(-28.5 39.8) rotate(-45)"/>' +
    '<path class="cls-1" d="M16.7,81.5c-2.8,2.8-7.2,2.8-10,0-2.8-2.8-2.8-7.2,0-10,1.7-1.7,3.9-2.3,6.1-2l14.2-14.2,5.9,5.9-14.2,14.2c.3,2.1-.3,4.4-2,6.1Z"/>' +
    '<polygon class="cls-2" points="79.2 18.2 42.3 55.1 33.1 45.8 70 9 83.6 4.6 79.2 18.2"/>' +
    '<path class="cls-2" d="M44.8-.6"/>' +
    '</g></g></svg>'
  ),
  wall: () => `<svg viewBox="0 0 88.19 88.19" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="86.19" height="86.19" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="1" y1="65.64" x2="87.19" y2="65.64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="1" y1="44.09" x2="87.19" y2="44.09" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="1" y1="22.55" x2="87.19" y2="22.55" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="33.93" y1="1" x2="33.93" y2="22.55" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="64.74" y1="1" x2="64.74" y2="22.55" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="12.59" y1="22.55" x2="12.59" y2="44.09" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="44.69" y1="22.55" x2="44.69" y2="44.09" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="79.26" y1="22.55" x2="79.26" y2="44.09" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="19.41" y1="44.09" x2="19.41" y2="65.64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="53.48" y1="44.09" x2="53.48" y2="65.64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="71.85" y1="65.64" x2="71.85" y2="87.19" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <line x1="30.07" y1="65.64" x2="30.07" y2="87.19" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <path d="M21.73,23.25c.57,2.12,3.27,3.14,3.81,5.27.37,1.46-.38,3.19.48,4.43.32.46.81.76,1.25,1.11,1.38,1.07,2.38,2.64,2.75,4.35" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <path d="M70.94,51.36c.69-2.36,2.19-4.47,4.18-5.9.55.04.73.08,1.27.13.44.04.88.07,1.31-.03s.84-.36,1.01-.76" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <path d="M47.63,87.2c-.55-2.12-1.3-4.18-2.24-6.16" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <path d="M73.03,1.7c.92,2.16,2.6,4.86,3.51,7.02" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <path d="M12.4,1.37c.52,2.3-.47,5.69-2.26,7.23" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
    <path d="M10.89,5.91l3.37,2.03c.17.69.68,1.3,1.33,1.59" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"/>
  </svg>`,
  monster: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false">' +
    '<g stroke="currentColor" stroke-miterlimit="10" stroke-width="4" fill="none">' +
      '<path d="M77.9,37.4c0,11.5-5.7,21.7-14.5,27.8v18.2H24.8v-18.2c-8.8-6.1-14.5-16.3-14.5-27.8C10.3,18.7,25.4,3.6,44.1,3.6s33.8,15.1,33.8,33.8Z"/>' +
      '<polyline points="63.4 72.9 63.4 83.4 24.8 83.4 24.8 72.9"/>' +
      '<line x1="53.8" y1="72.9" x2="53.8" y2="83.4"/>' +
      '<line x1="44.1" y1="72.9" x2="44.1" y2="83.4"/>' +
      '<line x1="34.4" y1="72.9" x2="34.4" y2="83.4"/>' +
    '</g>' +
    '<g fill="currentColor" stroke="currentColor" stroke-miterlimit="10" stroke-width="4">' +
      '<path d="M25.9,31.9c0-2.4,2.1-5.3,4.3-4.3s3.1,2.2,4.3,4.3-1.9,4.3-4.3,4.3-4.3-1.9-4.3-4.3Z"/>' +
      '<path d="M62.3,31.9c0-2.4-2.1-5.3-4.3-4.3s-3.1,2.2-4.3,4.3,1.9,4.3,4.3,4.3,4.3-1.9,4.3-4.3Z"/>' +
      '<path d="M42.7,43.5l-1.5,2.6c-.6,1.1.2,2.5,1.4,2.5h3c1.3,0,2-1.4,1.4-2.5l-1.5-2.6c-.6-1.1-2.2-1.1-2.8,0Z"/>' +
    '</g>' +
    '</svg>'
  ),
  treasure: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false">' +

      '<path d="M52,34.7c-.5.9-1.3,1.3-2.3,2.1l4.1,11.4h-19.6,0c0,0,4.1-11.4,4.1-11.4-.7-.6-1.3-1.3-1.8-2.1H3.5v46.1h81.2v-46.1h-32.7Z"' +
        ' fill="currentColor" stroke="currentColor" stroke-width="2" stroke-miterlimit="10"/>' +

      '<path d="M44,21.3c4.9,0,8.8,3.9,8.8,8.8s0,1.6-.1,2.2h31.9v-9.9c0-8.3-6.7-15-15-15H18.5c-8.3,0-15,6.7-15,15v9.9h32c-.2-.7-.3-1.4-.3-2.2,0-4.9,3.9-8.8,8.8-8.8Z"' +
        ' fill="currentColor" stroke="currentColor" stroke-width="2" stroke-miterlimit="10"/>' +

    '</svg>'
  ),
  door: () => svgWrap(`
    <rect x="7" y="4" width="10" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="14" cy="12" r="1" fill="currentColor"/>
    <path d="M10 4 v16" fill="none" stroke="currentColor" stroke-width="1.5"/>
  `),
  door: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="currentColor" stroke-width="4" stroke-miterlimit="10">' +
        '<rect x="15.8" y="3.2" width="56.7" height="81.8"/>' +
        '<circle cx="62.1" cy="46.9" r="4.6"/>' +
      '</g>' +
    '</svg>'
  ),
  key: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false">' +
      '<path d="M31,15.9c-.7,3.4-2.7,7.4-5.6,10.9-6.1,7.4-13.2,9.5-15.4,7.7-2.2-1.8-1.5-9.2,4.7-16.6,6.1-7.4,13.2-9.5,15.4-7.7,1.1.9,1.4,3,.9,5.7Z" fill="none"/>' +
      '<path d="M85,69.1L34,26.9c2-3.2,3.3-6.5,3.9-9.7,1-5.4-.1-9.8-3.3-12.4-1.9-1.5-4.1-2.3-6.7-2.3-5.8,0-12.8,3.9-18.6,10.9C1.1,23.4-.5,34.8,5.6,39.9c1.9,1.5,4.1,2.3,6.7,2.3,4.6,0,10-2.5,14.9-7l38.6,31.9-6.1,7.4c-.5.6-.4,1.4.2,1.9l1.7,1.4c.6.5,1.4.4,1.9-.2l6.1-7.4,6.6,5.5-6.1,7.4c-.4.5-.4,1.3.2,1.8l1.3,1.1c.5.4,1.3.4,1.8-.2l11.9-14.4c.6-.7.5-1.7-.2-2.2ZM14.7,17.9c6.1-7.4,13.2-9.5,15.4-7.7,1.1.9,1.4,3,.9,5.7-.7,3.4-2.7,7.4-5.6,10.9-6.1,7.4-13.2,9.5-15.4,7.7-2.2-1.8-1.5-9.2,4.7-16.6Z"' +
        ' fill="currentColor" stroke="currentColor" stroke-width="2" stroke-miterlimit="10"/>' +
    '</svg>'
  ),
  
  potion: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false">' +
      '<path d="M68.2,65c0,10.8-10.8,19.5-24.1,19.5s-24.1-8.7-24.1-19.5c0-8.7,7-16.1,16.7-18.6V5.7h14.8v40.8c9.7,2.5,16.7,9.9,16.7,18.6Z"' +
        ' fill="currentColor" stroke="currentColor" stroke-width="2" stroke-miterlimit="10"/>' +
      '<path d="M44.1,5.7c-5.1,0-9.2-.5-9.2-1s4.1-1,9.2-1,9.2.5,9.2,1-4.1,1-9.2,1Z"' +
        ' fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10"/>' +
    '</svg>'
  ),
  void: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false" style="width:100%;height:100%;display:block;">' +
      '<g fill="none" stroke="currentColor" stroke-width="4" stroke-miterlimit="10">' +
        '<circle cx="44.1" cy="44.1" r="30" />' +
        '<circle cx="44.1" cy="44.1" r="12" />' +
      '</g>' +
    '</svg>'
  ),
  weapon_shop: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false" style="width:100%;height:100%;display:block;">' +
      '<g stroke="currentColor" stroke-miterlimit="10" stroke-width="4" fill="none">' +
        '<path d="M20 68 L68 20"/>' +
        '<path d="M54 14 L70 30 L56 44"/>' +
      '</g>' +
    '</svg>'
  ),
  armor_shop: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false" style="width:100%;height:100%;display:block;">' +
      '<g fill="none" stroke="currentColor" stroke-width="4" stroke-miterlimit="10">' +
        '<path d="M44 6 L20 18 L20 42 C20 62 44 74 44 74 C44 74 68 62 68 42 L68 18 Z"/>' +
      '</g>' +
    '</svg>'
  ),
  inn: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false" style="width:100%;height:100%;display:block;">' +
      '<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="44.1" y1="20" x2="44.1" y2="68.2" />' +
        '<line x1="20" y1="44.1" x2="68.2" y2="44.1" />' +
      '</g>' +
    '</svg>'
  ),
  villager: () => (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.2 88.2" aria-hidden="true" focusable="false" style="width:100%;height:100%;display:block;">' +
      '<g stroke="currentColor" stroke-miterlimit="10" stroke-width="3" fill="currentColor">' +
        '<circle cx="44" cy="28" r="10"/>' +
        '<path d="M24 66 C24 54 64 54 64 66 C64 74 44 80 44 80 C44 80 24 74 24 66 Z"/>' +
      '</g>' +
    '</svg>'
  )
};

/* ---------------- DEMO LEVELS ---------------- */
const LEVELS = {
  level1: {
    id: "level1",
    rows: 6,
    cols: 6,
    items: [
      {type:"wall", pos:"B1"},
      {type:"wall", pos:"B2"},
      {type:"wall", pos:"B3"},
      {type:"monster", pos:"D3"},
      {type:"treasure", pos:"C4"},
      {type:"potion", pos:"E2"},
      {type:"key", pos:"C5"},
      {type:"void", pos:"E4"},
      {type:"door", pos:"F6"}
    ],
    scenes: {
      "A1":"A quiet entryway. The air is still.",
      "D3":"A low growl echoes in the dark."
    },
    nextLevelId: "level2"
  },
  level2: {
    id: "level2",
    rows: 12,
    cols: 12,
    items: [
      {type:"wall", pos:"C2"},
      {type:"wall", pos:"C3"},
      {type:"wall", pos:"C4"},
      {type:"wall", pos:"C5"},
      {type:"wall", pos:"C6"},
      {type:"monster", pos:"E5"},
      {type:"treasure", pos:"H8"},
      {type:"key", pos:"B5"},
      {type:"door", pos:"L12"}
    ],
    scenes: { "A1":"A much larger maze. The air feels heavier." },
    nextLevelId: null
  }
};

/* ---------------- Helpers / DOM ---------------- */
function toPos(r,c){ return String.fromCharCode(65+c) + (r+1); }
function inBounds(r,c,l){ return r>=0 && c>=0 && r<l.rows && c<l.cols; }

const mapEl = document.getElementById("map");
const posText = document.getElementById("posText");
const currentText = document.getElementById("currentText");
const logArea = document.getElementById("logArea");
const logList = document.getElementById("logList");
const toggleLogBtn = document.getElementById("toggleLogBtn");

const lifeText = document.getElementById("lifeText");
const strText = document.getElementById("strText");
const defText = document.getElementById("defText");
const goldText = document.getElementById("goldText");
const keyText = document.getElementById("keyText");

const restartBtn = document.getElementById("restartBtn");
const continueBtn = document.getElementById("continueBtn");

const guideBtn = document.getElementById("guideBtn");
const guideDialog = document.getElementById("guideDialog");
const closeGuideBtn = document.getElementById("closeGuideBtn");

const live = document.getElementById("live");
const darkModeBtn = document.getElementById("darkModeBtn");
const gameEl = document.getElementById("game");

// Speech queue so messages don't overwrite each other before screen readers speak them.
let speechQueue = Promise.resolve();

function announce(msg){
  speechQueue = speechQueue.then(() => new Promise(resolve => {
    live.textContent = "";
    setTimeout(() => {
      live.textContent = msg;
      // Give AT time to start speaking before allowing next message.
      setTimeout(resolve, 250);
    }, 10);
  }));
}

function announceSequence(msgs){
  const clean = msgs.filter(Boolean).map(m => String(m).trim()).filter(m => m.length);
  for (const m of clean) announce(m);
}

/* ---------------- Level indexing ---------------- */
function itemsAt(pos){ return level.items.filter(it => it.pos === pos); }
function hasWall(pos){ return itemsAt(pos).some(it => (it.type === "wall" || it.type === "bush" || it.type === "flower" || it.type === "custom_wall")); }
function hasDoor(pos){ return itemsAt(pos).some(it => it.type === "door"); }
function hasExit(pos){ return itemsAt(pos).some(it => it.type === "exit"); }
function hasOpenExit(pos){ return itemsAt(pos).some(it => it.type === "exit_open"); }
function hasKey(pos){ return itemsAt(pos).some(it => it.type === "key"); }
function hasTreasure(pos){ return itemsAt(pos).some(it => it.type === "treasure"); }
function hasPotion(pos){ return itemsAt(pos).some(it => it.type === "potion"); }
function hasVoid(pos){ return itemsAt(pos).some(it => it.type === "void"); }
function hasMonster(pos){ return itemsAt(pos).some(it => it.type === "monster"); }
function hasWeaponShop(pos){ return itemsAt(pos).some(it => it.type === "weapon_shop"); }
function hasArmorShop(pos){ return itemsAt(pos).some(it => it.type === "armor_shop"); }
function hasInn(pos){ return itemsAt(pos).some(it => it.type === "inn"); }
function hasVillager(pos){ return itemsAt(pos).some(it => it.type === "villager"); }
function getMonster(pos){ return monsters.get(pos) || null; }
function initMonsters(){
  monsters = new Map();
  for (const it of level.items) {
    if (it.type === "monster") {
      // Use metadata from the level creator when available, otherwise fall back to defaults
      let hp = 6;
      let attack = 2;
      let def = 0;
      let name = 'monster';
      if (it.meta) {
        if (typeof it.meta.hp !== 'undefined') hp = Number(it.meta.hp) || hp;
        if (typeof it.meta.atk !== 'undefined') attack = Number(it.meta.atk) || attack;
        if (typeof it.meta.def !== 'undefined') def = Number(it.meta.def) || def;
        if (typeof it.meta.name !== 'undefined') name = String(it.meta.name) || name;
      }
      var descs = [];
      if (it.meta && Array.isArray(it.meta.descriptions)) descs = it.meta.descriptions.slice();
      monsters.set(it.pos, { hp: hp, attack: attack, defense: def, name: name, descriptions: descs, nextDescIndex: 0 });
    }
  }
}
function removeMonster(pos){
  monsters.delete(pos);
  removeItem("monster", pos);
} 
function removeItem(type,pos){
  level.items = level.items.filter(it => !(it.type === type && it.pos === pos));
}

function posToRC(pos) {
  const col = pos.charCodeAt(0) - 65;
  const row = parseInt(pos.slice(1), 10) - 1;
  return { row, col };
}

function revealNeighbors(pos) {
  const p = posToRC(pos);
  for (const d of DIRS) {
    const r = p.row + d.dr;
    const c = p.col + d.dc;
    if (!inBounds(r, c, level)) continue;
    const npos = toPos(r, c);
    // If it's a wall, reveal via bump set so wall rendering rules apply.
    if (hasWall(npos)) {
      revealedByBump.add(npos);
      continue;
    }
    // Reveal the neighbor tile so it becomes visible on the map.
    revealedNeighbors.add(npos);
    // If neighbor contains a special icon, mark it discovered so its icon shows.
    if (hasKey(npos)) revealedSpecial.set(npos, "key");
    else if (hasTreasure(npos)) revealedSpecial.set(npos, "treasure");
    else if (hasMonster(npos)) revealedSpecial.set(npos, "monster");
    else if (hasVoid(npos)) revealedSpecial.set(npos, "void");
    else if (hasPotion(npos)) revealedSpecial.set(npos, "potion");
    else if (hasVillager(npos)) revealedSpecial.set(npos, "villager");
    else if (hasWeaponShop(npos)) revealedSpecial.set(npos, "weapon_shop");
    else if (hasArmorShop(npos)) revealedSpecial.set(npos, "armor_shop");
    else if (hasInn(npos)) revealedSpecial.set(npos, "inn");
    else if (hasExit(npos)) revealedSpecial.set(npos, "exit");
  }
}

/* ---------------- Pixel-perfect grid sizing ---------------- */
function computeCellSize() {
  const styles = getComputedStyle(mapEl);
  const gap = parseFloat(styles.gap) || 4;

  const w = mapEl.parentElement.clientWidth;
  const h = mapEl.parentElement.clientHeight;

  const cellW = (w - gap * (MAX_SIZE - 1)) / MAX_SIZE;
  const cellH = (h - gap * (MAX_SIZE - 1)) / MAX_SIZE;

  return Math.max(8, Math.floor(Math.min(cellW, cellH)));
}

function applyGridPixelSizing(cell) {
  const styles = getComputedStyle(mapEl);
  const gap = parseFloat(styles.gap) || 4;

  mapEl.style.gridTemplateColumns = `repeat(${level.cols}, ${cell}px)`;
  mapEl.style.gridTemplateRows    = `repeat(${level.rows}, ${cell}px)`;

  const totalW = level.cols * cell + (level.cols - 1) * gap;
  const totalH = level.rows * cell + (level.rows - 1) * gap;

  mapEl.style.width  = `${totalW}px`;
  mapEl.style.height = `${totalH}px`;
}

/* ---------------- Rendering ---------------- */
function renderMap() {
  mapEl.innerHTML = "";
  const cell = computeCellSize();
  applyGridPixelSizing(cell);

  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const pos = toPos(r, c);
      const el = document.createElement("div");
      el.className = "cell";

      const isVisited = visited.has(pos);
      const isRevealedWall = revealedByBump.has(pos) && hasWall(pos);
      const isRevealedSpecial = revealedSpecial.has(pos);
      const show = isVisited || isRevealedWall || isRevealedSpecial || revealedNeighbors.has(pos);

      el.classList.add(show ? "visited" : "unknown");

      if (show) {
        const items = itemsAt(pos);
        if (items.some(i => i.type === "wall" || i.type === "bush" || i.type === "flower" || i.type === "custom_wall")) {
          el.classList.add("wall");
          el.innerHTML = ICONS.wall();
        } else if (items.some(i => i.type === "door")) {
          el.innerHTML = ICONS.door();
        } else if (items.some(i => i.type === "key")) {
          el.innerHTML = ICONS.key();
        } else if (items.some(i => i.type === "monster")) {
          el.innerHTML = ICONS.monster();
        } else if (items.some(i => i.type === "treasure")) {
          el.innerHTML = ICONS.treasure();
        } else if (items.some(i => i.type === "potion")) {
          el.innerHTML = ICONS.potion();
        } else if (items.some(i => i.type === "exit")) {
          el.innerHTML = ICONS.exit ? ICONS.exit() : ICONS.door();
        } else if (items.some(i => i.type === "exit_open")) {
          el.innerHTML = ICONS.door();
        } else if (items.some(i => i.type === "void")) {
          el.innerHTML = ICONS.void();
        } else if (items.some(i => i.type === "weapon_shop")) {
          el.innerHTML = ICONS.weapon_shop();
        } else if (items.some(i => i.type === "armor_shop")) {
          el.innerHTML = ICONS.armor_shop();
        } else if (items.some(i => i.type === "inn")) {
          el.innerHTML = ICONS.inn();
        } else if (items.some(i => i.type === "villager")) {
          el.innerHTML = ICONS.villager();
        } else if (revealedSpecial.has(pos)) {
          const t = revealedSpecial.get(pos);
          if (t === "key") el.innerHTML = ICONS.key();
          else if (t === "treasure") el.innerHTML = ICONS.treasure();
          else if (t === "monster") el.innerHTML = ICONS.monster();
          else if (t === "void") el.innerHTML = ICONS.void();
          else if (t === "weapon_shop") el.innerHTML = ICONS.weapon_shop();
          else if (t === "armor_shop") el.innerHTML = ICONS.armor_shop();
          else if (t === "inn") el.innerHTML = ICONS.inn();
          else if (t === "exit") el.innerHTML = ICONS.exit ? ICONS.exit() : ICONS.door();
          else if (t === "villager") el.innerHTML = ICONS.villager();
        } else if (level.scenes[pos]) {
          el.innerHTML = `<span aria-hidden="true">•</span>`;
        }
      }

      if (player.row === r && player.col === c) {
        el.classList.add("player");
        el.innerHTML = ICONS.player();
      }

      mapEl.appendChild(el);
    }
  }
}

/* ---------------- UI ---------------- */
function updateStatsUI(){
  lifeText.textContent = stats.life;
  strText.textContent = stats.strength;
  defText.textContent = stats.defense;
  goldText.textContent = stats.gold;
  keyText.textContent = stats.key ? "Yes" : "No";
}

function updateLogUI(){
  logList.innerHTML = "";
  // Most recent to least recent
  for (const entry of [...discoveryLog].reverse()){
    const p = document.createElement("p");
    p.innerHTML = `<strong>${entry.pos}:</strong> ${entry.text}`;
    logList.appendChild(p);
  }
}

function updateUI(){
  posText.textContent = toPos(player.row, player.col);
  updateStatsUI();
  renderMap();
}

/* ---------------- Rewards / auto-actions ---------------- */
function rollTreasureReward(meta) {
  // If a chest was marked empty (e.g., after a void restart), report it.
  if (meta && meta.kind === 'empty') return "The chest is empty.";
  // If metadata provided, honor it explicitly.
  if (meta && meta.kind) {
    const k = meta.kind;
    const v = Number(meta.value) || 0;
    if (k === 'gold') {
      stats.gold += v;
      return `You collect ${v} gold.`;
    }
    if (k === 'power') {
      stats.strength += v;
      return `You gain a power upgrade. Strength increased by ${v}.`;
    }
    if (k === 'defense') {
      stats.defense += v;
      return `You gain a defense upgrade. Defense increased by ${v}.`;
    }
  }
  // Fallback to old random behavior
  const roll = Math.random();
  if (roll < 0.65) {
    const amount = Math.floor(10 + Math.random() * 41); // 10–50
    stats.gold += amount;
    return `You collect ${amount} gold.`;
  }
  if (roll < 0.85) {
    stats.strength += 1;
    return `You gain a power upgrade. Strength increased by 1.`;
  }
  stats.defense += 1;
  return `You gain a defense upgrade. Defense increased by 1.`;
}

function consumePotion() {
  // Determine heal amount from a potion on the player's current square, if any.
  const pos = toPos(player.row, player.col);
  const potionItem = itemsAt(pos).find(it => it.type === 'potion');
  const healAmount = potionItem && potionItem.meta && typeof potionItem.meta.heal === 'number' ? potionItem.meta.heal : 3;
  const before = stats.life;
  stats.life = Math.min(MAX_LIFE, stats.life + healAmount);
  const gained = stats.life - before;
  return gained > 0 ? `You recover ${gained} life.` : `You already feel fine.`;
}

/* ---------------- Adjacent N/S/E/W report ---------------- */
const DIRS = [
  {name:"north", dr:-1, dc: 0},
  {name:"south", dr: 1, dc: 0},
  {name:"west",  dr: 0, dc:-1},
  {name:"east",  dr: 0, dc: 1},
];

function isBlocked(r, c) {
  // Treat edge like wall
  if (!inBounds(r, c, level)) return true;
  const pos = toPos(r, c);
  // Walls and living monsters block movement and are treated as blocked paths.
  // Doors block movement unless the player has a key; with a key the player may step
  // into the door square to unlock/enter it.
  if (hasDoor(pos) && !stats.key) return true;
  return hasWall(pos) || hasMonster(pos);
}

function contentsAt(r, c) {
  // Returns a single "sensory cue" label for the square (N/S/E/W) based on contents.
  // Cues in priority order:
  // - door => "you see the exit"
  // - void => "mysterious fog"
  // - key => "faint glow"
  // - monster => "growling sound"
  // - treasure => "hidden passage"
  // Everything else returns null (no cue).
  if (!inBounds(r, c, level)) return null;
  const pos = toPos(r, c);
  // If a custom wall is present, prefer its configured name as the sensory cue.
  const items = itemsAt(pos);
  const customWall = items.find(i => i.type === 'custom_wall');
  if (customWall) {
    if (customWall.meta && customWall.meta.name) return String(customWall.meta.name);
    return 'wall';
  }

  if (hasWall(pos)) return null;

  if (items.some(i=>i.type==="door")) return "you see the exit";
  if (items.some(i=>i.type==="exit")) return "you see the exit";
  if (items.some(i=>i.type==="void")) return "mysterious fog";
  if (items.some(i=>i.type==="weapon_shop")) return "weapon shop";
  if (items.some(i=>i.type==="armor_shop")) return "armor shop";
  if (items.some(i=>i.type==="inn")) return "Inn";
  if (items.some(i=>i.type==="villager")) return "Villager";
  if (items.some(i=>i.type==="key")) return "faint glow";
  if (items.some(i=>i.type==="monster")) return "growling sound";
  if (items.some(i=>i.type==="potion")) return "small pouch";
  if (items.some(i=>i.type==="treasure")) return "hidden passage";

  return null;
}


function groupedSurroundingsText() {
  // Convention requested:
  // "open path: north, south. blocked path: east. growling sound: west"
  // IMPORTANT: Each direction (north/south/east/west) can only appear ONCE.
  // So if a cue exists in a direction, that direction is NOT listed under open/blocked.

  const openDirs = [];
  const blockedDirs = [];

  // cue -> [dirs]
  const cueDirs = new Map();

  for (const d of DIRS) {
    const r = player.row + d.dr;
    const c = player.col + d.dc;

    // Determine cue FIRST so the direction is only used once.
    // Monsters are blocked for movement, but should be reported via cue (growling sound),
    // not under blocked path.
    const cue = contentsAt(r, c);
    if (cue) {
      if (!cueDirs.has(cue)) cueDirs.set(cue, []);
      cueDirs.get(cue).push(d.name);
      continue;
    }

    if (isBlocked(r, c)) {
      blockedDirs.push(d.name);
    } else {
      openDirs.push(d.name);
    }
  }

  const parts = [];

  // Add cue lines FIRST in priority order: door, void, key, monster, potion, treasure
  // Include Inn so it's described when adjacent. We'll insert 'Inn' after armor shop.
  const cueOrderWithInn = ["you see the exit", "mysterious fog", "faint glow", "weapon shop", "armor shop", "Inn", "Villager", "growling sound", "small pouch", "hidden passage"];
  for (const cue of cueOrderWithInn) {
    const dirs = cueDirs.get(cue);
    if (dirs && dirs.length) parts.push(`${cue}: ${dirs.join(", ")}.`);
  }
  // Then add open paths
  if (openDirs.length) parts.push(`open path: ${openDirs.join(", ")}.`);

  // Any remaining cues (e.g. custom wall names) that weren't in `cueOrder`:
  for (const [cue, dirs] of cueDirs.entries()) {
    if (cueOrderWithInn.indexOf(cue) === -1) {
      parts.push(`${cue}: ${dirs.join(", ")}.`);
    }
  }

  // Then add blocked paths
  if (blockedDirs.length) parts.push(`blocked path: ${blockedDirs.join(", ")}.`);

  return parts.join(" ");
}

// Like groupedSurroundingsText but for an arbitrary cell `pos` instead of player.
function groupedSurroundingsTextAt(pos) {
  const p = posToRC(pos);
  const openDirs = [];
  const blockedDirs = [];
  const cueDirs = new Map();

  for (const d of DIRS) {
    const r = p.row + d.dr;
    const c = p.col + d.dc;
    const cue = contentsAt(r, c);
    if (cue) {
      if (!cueDirs.has(cue)) cueDirs.set(cue, []);
      cueDirs.get(cue).push(d.name);
      continue;
    }
    if (isBlocked(r, c)) blockedDirs.push(d.name);
    else openDirs.push(d.name);
  }

  const parts = [];
  // Include Inn so it's described when adjacent
  const cueOrderWithInn = ["you see the exit", "mysterious fog", "faint glow", "weapon shop", "armor shop", "Inn", "Villager", "growling sound", "small pouch", "hidden passage"];
  for (const cue of cueOrderWithInn) {
    const dirs = cueDirs.get(cue);
    if (dirs && dirs.length) parts.push(`${cue}: ${dirs.join(", ")}.`);
  }
  // Then add open paths
  if (openDirs.length) parts.push(`open path: ${openDirs.join(", ")}.`);

  // Any remaining cues (e.g. custom wall names) that weren't in `cueOrder`:
  for (const [cue, dirs] of cueDirs.entries()) {
    if (cueOrderWithInn.indexOf(cue) === -1) {
      parts.push(`${cue}: ${dirs.join(", ")}.`);
    }
  }

  if (blockedDirs.length) parts.push(`blocked path: ${blockedDirs.join(", ")}.`);
  return parts.join(" ");
}

function describePos(pos) {
  const parts = [];
  const rd = roomDescription(pos);
  if (rd) parts.push(rd);
  const here = hereSummary(pos);
  if (here) parts.push(here);
  const surroundings = groupedSurroundingsTextAt(pos);
  if (surroundings) parts.push(surroundings);
  return parts.join(" ");
}



/* ---------------- Room narration ---------------- */
function roomDescription(pos) {
  return level.scenes[pos] || "";
}

function hereSummary(pos) {
  const items = itemsAt(pos);
  
  // Priority order: door, void, key, monster, treasure, potion
  if (items.some(i=>i.type==="exit")) return "An exit is here.";
  if (items.some(i=>i.type==="door")) return "A door is here.";
  if (items.some(i=>i.type==="void")) return "A swirling void is here.";
  if (items.some(i=>i.type==="key")) return "A key is here.";
  if (items.some(i=>i.type==="monster")) return "A monster is here.";
  if (items.some(i=>i.type==="treasure")) return "A treasure chest is here.";
  if (items.some(i=>i.type==="potion")) return "A potion is here.";
  if (items.some(i=>i.type==="weapon_shop")) return "A weapon shop is here.";
  if (items.some(i=>i.type==="armor_shop")) return "An armor shop is here.";
  if (items.some(i=>i.type==="villager")) return "A villager is here.";
  
  // If no items, just return empty string - let groupedSurroundingsText handle 
  // describing open paths and blocked paths
  return "";
}


function describeCurrentLocation() {
  const pos = toPos(player.row, player.col);
  const parts = [];
  parts.push(roomDescription(pos));

  const here = hereSummary(pos);
  if (here) parts.push(here);

  parts.push(groupedSurroundingsText());
  return parts.join(" ");
}

/* ---------------- Discovery + entering a cell ---------------- */
function logDiscovery(pos, text){
  if (discoveryLog.some(e => e.pos === pos)) return;
  discoveryLog.push({pos, text});
  updateLogUI();
}

function appendLog(pos, text) {
  // Always append an entry to the exploration log (allow duplicates).
  discoveryLog.push({ pos, text });
  updateLogUI();
}

function enterCell(prefix) {
  const pos = toPos(player.row, player.col);
  const firstVisit = !visited.has(pos);
  visited.add(pos);

  // Reveal adjacent N/S/E/W tiles when entering a cell (fog of war).
  revealNeighbors(pos);

  // If the page set a campaign startup flag, do a minimal announcement sequence:
  // 1) "Welcome to Super Dungeon"
  // 2) the level's A1 scene text (if any)
  // This avoids the full surroundings/reporting on first load.
  try {
    if (window.__campaignStartup) {
      // Build the same description used elsewhere (room + here summary + surroundings)
      const fullText = describeCurrentLocation();
      updateUI();
      // Announce title then full location description (includes surroundings)
      announceSequence(["Welcome to Super Dungeon", fullText]);
      // Show the full description in the UI and log it
      if (fullText) {
        document.getElementById('currentText').textContent = fullText;
        appendLog(toPos(player.row, player.col), fullText);
      }
      // Mark startup handled and record discovery if first visit
      window.__campaignStartup = false;
      if (firstVisit) logDiscovery(toPos(player.row, player.col), fullText);
      return;
    }
  } catch (e) {
    // If anything goes wrong, fall back to normal behavior.
    console.error('Startup announcement failed', e);
  }

  // Build room text up front (used for log + announcements)
  const text = describeCurrentLocation();
  // Auto actions (announce discoveries)
  const discoveryMsgs = [];

  if (hasKey(pos) && !stats.key) {
    // Mark icon as discovered so it remains visible after pickup.
    revealedSpecial.set(pos, "key");
    stats.key = true;
    removeItem("key", pos);
    discoveryMsgs.push("You found a key.");
  }

  if (hasTreasure(pos)) {
    // Mark icon as discovered so it remains visible after opening.
    revealedSpecial.set(pos, "treasure");
    // Capture treasure metadata if present before removing the item
    const treasureItem = itemsAt(pos).find(it => it.type === "treasure");
    const meta = treasureItem && treasureItem.meta ? treasureItem.meta : null;
    removeItem("treasure", pos);
    const reward = rollTreasureReward(meta);
    discoveryMsgs.push("You found a treasure chest.");
    if (reward) discoveryMsgs.push(reward);
  }

  if (hasVillager(pos)) {
    // Treat villager like a (guaranteed) reward source: reveal, speak custom text,
    // then immediately apply the reward and announce it.
    revealedSpecial.set(pos, "villager");
    const villagerItem = itemsAt(pos).find(it => it.type === "villager");
    const meta = villagerItem && villagerItem.meta ? villagerItem.meta : null;
    // Remove the villager so it cannot be re-triggered.
    removeItem("villager", pos);

    // First, speak the villager's custom text (if any).
    if (meta && meta.text) discoveryMsgs.push(String(meta.text));

    // Then apply the reward. If metadata specifies kind/value, honor it
    // with a clean "The villager gives you ..." phrasing. Otherwise fall
    // back to the existing treasure-roll behavior and try to reformat its
    // message into a villager phrasing.
    if (meta && meta.kind) {
      const kind = String(meta.kind);
      const val = Number(meta.value) || 0;
      if (kind === 'gold') {
        stats.gold = (stats.gold || 0) + val;
        discoveryMsgs.push(`The villager gives you ${val} gold.`);
      } else if (kind === 'power') {
        stats.strength = (stats.strength || 0) + val;
        discoveryMsgs.push(`The villager gives you a power upgrade. Strength increased by ${val}.`);
      } else if (kind === 'defense') {
        stats.defense = (stats.defense || 0) + val;
        discoveryMsgs.push(`The villager gives you a defense upgrade. Defense increased by ${val}.`);
      } else {
        // Unknown kind: fall back to treasure helper and try to format.
        const raw = rollTreasureReward(meta) || '';
        const mGold = raw.match(/You collect (\d+) gold\./);
        if (mGold) discoveryMsgs.push(`The villager gives you ${mGold[1]} gold.`);
        else if (/You gain a power upgrade/.test(raw)) {
          const m = raw.match(/Strength increased by (\d+)/);
          discoveryMsgs.push(m ? `The villager gives you a power upgrade. Strength increased by ${m[1]}.` : `The villager gives you a power upgrade.`);
        } else if (/You gain a defense upgrade/.test(raw)) {
          const m = raw.match(/Defense increased by (\d+)/);
          discoveryMsgs.push(m ? `The villager gives you a defense upgrade. Defense increased by ${m[1]}.` : `The villager gives you a defense upgrade.`);
        } else {
          discoveryMsgs.push(raw);
        }
      }
    } else {
      // If metadata exists but lacks a kind (likely older levels or click-placed villagers),
      // treat a numeric `value` as gold for compatibility.
      if (meta && typeof meta.value !== 'undefined') {
        const val = Number(meta.value) || 0;
        stats.gold = (stats.gold || 0) + val;
        discoveryMsgs.push(`The villager gives you ${val} gold.`);
      } else {
        // No explicit metadata: roll a treasure reward and rephrase it.
        const raw = rollTreasureReward(null) || '';
        const mGold = raw.match(/You collect (\d+) gold\./);
        if (mGold) discoveryMsgs.push(`The villager gives you ${mGold[1]} gold.`);
        else if (/You gain a power upgrade/.test(raw)) {
          const m = raw.match(/Strength increased by (\d+)/);
          discoveryMsgs.push(m ? `The villager gives you a power upgrade. Strength increased by ${m[1]}.` : `The villager gives you a power upgrade.`);
        } else if (/You gain a defense upgrade/.test(raw)) {
          const m = raw.match(/Defense increased by (\d+)/);
          discoveryMsgs.push(m ? `The villager gives you a defense upgrade. Defense increased by ${m[1]}.` : `The villager gives you a defense upgrade.`);
        } else {
          discoveryMsgs.push(raw);
        }
      }
    }
  }

  if (hasPotion(pos)) {
    // Do NOT auto-consume potions. Prompt the player and leave the potion until they press Space.
    revealedSpecial.set(pos, "potion");
    discoveryMsgs.push("A potion is here. Press Space to drink.");
  }

  if (hasWeaponShop(pos)) {
    // Do NOT auto-purchase. Prompt the player and leave the shop available until they press Space.
    revealedSpecial.set(pos, "weapon_shop");
    discoveryMsgs.push("Welcome to the weapon shop! Press Space to upgrade your strength 2 points for 18 gold.");
  }

  if (hasArmorShop(pos)) {
    // Do NOT auto-purchase. Prompt the player and leave the shop available until they press Space.
    revealedSpecial.set(pos, "armor_shop");
    discoveryMsgs.push("Welcome to the armor shop! Press Space to upgrade your defense 1 points for 14 gold.");
  }

  if (hasInn(pos)) {
    // Do NOT auto-purchase. Prompt the player and leave the inn available until they press Space.
    revealedSpecial.set(pos, "inn");
    discoveryMsgs.push("Welcome to the inn! Press Space to rest and heal 8 points for 10 gold.");
  }

  if (hasExit(pos)) {
    // Prompt the player to open the exit with Space (does not require a key).
    revealedSpecial.set(pos, "exit");
    discoveryMsgs.push("An exit is here. Press Space to open.");
  }

  if (hasOpenExit(pos)) {
    // Open exit acts like an immediate finish when stepped onto.
    completed = true;
    continueBtn.hidden = true;
    discoveryMsgs.push("You found the exit. Press Enter to continue.");
  }

  if (hasDoor(pos)) {
    // If the player steps onto a door tile and has a key, unlock and mark completed.
    if (stats.key) {
      // consume the key and complete the level (player stands on the door square)
      stats.key = false;
      completed = true;
      continueBtn.hidden = true;
      discoveryMsgs.push("You unlock and open the door. Press Enter to continue.");
    } else {
      // No key: inform the player and treat as a blocked/bumped tile in messages.
      discoveryMsgs.push("A locked door is here. You need a key to open it.");
    }
  }

  // The Void: stepping into it immediately restarts the level and returns you to A1.
  if (hasVoid(pos)) {
    var voidMsg = "You've fallen into the void. Game restarts.";
    currentText.textContent = voidMsg;
    appendLog(pos, voidMsg);
    announce(voidMsg);
    // Preserve most stats across the restart, but reset the key flag.
    const preserved = { life: stats.life, strength: stats.strength, defense: stats.defense, gold: stats.gold };
    loadLevel(currentLevelId);
    stats.life = preserved.life;
    stats.strength = preserved.strength;
    stats.defense = preserved.defense;
    stats.gold = preserved.gold;
    stats.key = false;
    // Mark all treasures in the reloaded level as empty so players can't farm them by falling into the void.
    for (const it of level.items) {
      if (it.type === 'treasure') {
        it.meta = it.meta || {};
        it.meta.kind = 'empty';
        delete it.meta.value;
      }
    }
    updateUI();
    return;
  }

  // Update visuals/stats before speaking
  updateUI();

  // Build spoken sequence. If a prefix (combat text) was provided, include it first.
  var spoken = [];
  // Prepare final text by removing redundant "A ... is here." sentences when
  // discovery messages already describe the item (prevents duplicates).
  var finalText = String(text || '');
  const discAll = discoveryMsgs.join(' ').toLowerCase();
  const redundantPatterns = [
    { key: 'potion', re: /A potion is here\.\s*/i },
    { key: 'treasure', re: /A treasure chest is here\.\s*/i },
    { key: 'villager', re: /A villager is here\.\s*/i },
    { key: 'weapon shop', re: /A weapon shop is here\.\s*/i },
    { key: 'armor shop', re: /An armor shop is here\.\s*/i },
    { key: 'key', re: /A key is here\.\s*/i },
    { key: 'door', re: /A door is here\.\s*/i },
    { key: 'exit', re: /An exit is here\.\s*/i }
  ];

  for (const p of redundantPatterns) {
    if (discAll.indexOf(p.key) !== -1) {
      finalText = finalText.replace(p.re, '');
    }
  }

  // Also strip the 'Inn: ...' surroundings cue if we already pushed an inn discovery message.
  if (discoveryMsgs.some(m => /inn/i.test(m))) {
    finalText = finalText.replace(/Inn:\s*[^.]*\.\s*/i, '');
  }

  if (prefix) spoken.push(prefix);
  if (discoveryMsgs.length) spoken.push(discoveryMsgs.join(" "));
  spoken.push(finalText);

  // Show the full spoken text in the Current location area and log it.
  const fullSpoken = spoken.join(' ');
  currentText.textContent = fullSpoken;
  appendLog(pos, fullSpoken);

  // Announce everything in order.
  announceSequence(spoken);

  if (firstVisit) logDiscovery(pos, text);

  updateUI();
}

/* ---------------- Movement ---------------- */
function tryMove(dr, dc) {
  if (completed) {
    // Stage complete: only Enter should advance.
    announce("You found the exit. Press Enter to continue.");
    return;
  }

  const nr = player.row + dr;
  const nc = player.col + dc;

  // Edge treated like wall
  if (!inBounds(nr, nc, level)) {
    announce("A wall blocks your way.");
    return;
  }

  const nextPos = toPos(nr, nc);

  // Prevent stepping onto a locked door tile even if other checks miss it.
  if (hasDoor(nextPos) && !stats.key) {
    // Reveal the door so the player knows where it is and block movement.
    revealedByBump.add(nextPos);
    // Tell the player a key is required, then repeat the player's current location info.
    const currentDesc = describeCurrentLocation();
    announceSequence(["Key required.", currentDesc]);
    renderMap();
    return;
  }

  // Wall bump
  if (hasWall(nextPos)) {
    revealedByBump.add(nextPos);
    announce("A wall blocks your way.");
    initFootstepSound();
    renderMap();
    return;
  }

  // Monster encounter: acts like a blocked path until defeated.
  if (hasMonster(nextPos)) {
    // Reveal monster icon as soon as the player first engages it.
    // Also mark the monster square as "known" (visited) so it renders as discovered.
    revealedSpecial.set(nextPos, "monster");
    visited.add(nextPos);
    // Re-render immediately so the icon appears even though the player hasn't moved.
    renderMap();
    const m = getMonster(nextPos);
    if (!m) {
      // Safety fallback: if item exists but monster state is missing, re-init.
      initMonsters();
    }
    const monster = getMonster(nextPos);

    // Player attacks first. Account for monster defense and include the monster's name.
    const monsterDef = monster.defense || 0;
    const monsterName = monster.name || 'the monster';

    // Cycle and read a description for this attack if available
    var attackDesc = null;
    if (monster.descriptions && monster.descriptions.length) {
      var idx = typeof monster.nextDescIndex === 'number' ? monster.nextDescIndex : 0;
      attackDesc = monster.descriptions[idx];
      monster.nextDescIndex = (idx + 1) % monster.descriptions.length;
    }

    let playerDamage = Math.max(0, stats.strength - monsterDef);
    let msg = '';
    // Track whether this attack was a critical (player-only)
    let isCrit = false;
    // Miss chance: 5% for both player and monster.
    const playerMiss = Math.random() < 0.05;
    if (playerMiss) {
      msg = `Your attack misses. `;
    } else {
      if (playerDamage <= 0) {
        msg = `Your attack couldn't penetrate ${monsterName}'s defense. `;
        if (attackDesc) msg += attackDesc + ' ';
      } else {
        // Player-only critical hit: 8% chance to deal 50% more damage
        isCrit = Math.random() < 0.08;
        let appliedDamage = playerDamage;
        if (isCrit) appliedDamage = Math.round(playerDamage * 1.5);
        monster.hp -= appliedDamage;
        msg = `You attack ${monsterName} for ${appliedDamage}. `;
        if (attackDesc) msg += attackDesc + ' ';
      }
    }

    if (monster.hp > 0) {
      // Monster attacks back.
      const raw = monster.attack || 0;
      // Miss chance: 5% for both player and monster.
      const monsterMiss = Math.random() < 0.05;
      if (monsterMiss) {
        msg += `${monsterName} misses. `;
      } else {
        const monsterDamage = Math.max(0, raw - stats.defense);
        stats.life -= monsterDamage;
        msg += `${monsterName} attacks you for ${monsterDamage}. `;
      }
      msg += `Your life: ${Math.max(0, stats.life)}. ${monsterName} life: ${monster.hp}. `;

      // If player dies, reset level.
      if (stats.life <= 0) {
        msg += "You have been defeated. Restarting level.";
        const curPos = toPos(player.row, player.col);
        currentText.textContent = msg;
        appendLog(curPos, msg);
        announce(msg);
        loadLevel(currentLevelId);
        return;
      }

      // After combat, ALSO tell the player what square they are currently in.
      const posNow = toPos(player.row, player.col);
      const roomText = describeCurrentLocation();
      const full = msg + ` You are in ${posNow}. ` + roomText;
      if (isCrit) {
        const curPos = toPos(player.row, player.col);
        currentText.textContent = `Critical hit! ${full}`;
        appendLog(curPos, `Critical hit! ${full}`);
        updateUI();
        announceSequence(["Critical hit!", full]);
      } else {
        const curPos = toPos(player.row, player.col);
        currentText.textContent = full;
        appendLog(curPos, full);
        updateUI();
        announce(full);
      }
      return;
    }

    // Monster defeated
    removeMonster(nextPos);
    // Once defeated, the monster icon should disappear from the map.
    revealedSpecial.delete(nextPos);
    msg += `You defeat ${monsterName}. Your life: ${Math.max(0, stats.life)}. ${monsterName} life: 0. `;

    // Move into the monster's square upon defeating it.
    player.row = nr;
    player.col = nc;

    // Announce combat results combined with the room description.
    if (isCrit) {
      // Ensure "Critical hit!" is spoken first, and also shown in the UI.
      announceSequence(["Critical hit!"]);
      enterCell("Critical hit! " + msg);
    } else {
      enterCell(msg);
    }
    return;
  }

  // Normal movement
  player.row = nr;
  player.col = nc;
  playWallBumpSound();
  enterCell();
}

function speakStatus() {
  const pos = toPos(player.row, player.col);
  const lines = [
    `You are in ${pos}.`,
    `Life: ${stats.life}.`,
    `Strength: ${stats.strength}.`,
    `Defense: ${stats.defense}.`,
    `Gold: ${stats.gold}.`,
    `Key: ${stats.key ? "Yes" : "No"}.`
  ];
  announceSequence(lines);
}

/* ---------------- Controls ---------------- */
gameEl.addEventListener("keydown", (e) => {
  // Press S to hear current location + full stats.
  if (e.key === "s" || e.key === "S") {
    e.preventDefault();
    speakStatus();
    return;
  }
  // Spacebar: drink potion if present on current square
  if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
    e.preventDefault();
    const pos = toPos(player.row, player.col);
    if (hasPotion(pos)) {
      // consume potion and remove its icon
      const potionMsg = consumePotion();
      removeItem('potion', pos);
      revealedSpecial.delete(pos);
      updateUI();
      // Announce result and repeating location description
      announceSequence(["You drink the potion.", potionMsg, describeCurrentLocation()]);
    }
    else if (hasWeaponShop(pos)) {
      // Attempt to purchase strength upgrade: cost 18 gold, +2 strength
      const cost = 18;
      if (stats.gold >= cost) {
        stats.gold -= cost;
        stats.strength += 2;
        updateUI();
        announceSequence([`You upgrade your strength by 2. You spent ${cost} gold.`, describeCurrentLocation()]);
      } else {
        announceSequence([`You need ${cost} gold to buy an upgrade.`, describeCurrentLocation()]);
      }
    }
    else if (hasArmorShop(pos)) {
      // Attempt to purchase defense upgrade: cost 14 gold, +1 defense
      const cost = 14;
      if (stats.gold >= cost) {
        stats.gold -= cost;
        stats.defense += 1;
        updateUI();
        announceSequence([`You upgrade your defense by 1. You spent ${cost} gold.`, describeCurrentLocation()]);
      } else {
        announceSequence([`You need ${cost} gold to buy an upgrade.`, describeCurrentLocation()]);
      }
    }
    else if (hasInn(pos)) {
        const cost = 10;
        const heal = 8;
        if (stats.gold >= cost) {
          stats.gold -= cost;
          const before = stats.life;
          stats.life = Math.min(MAX_LIFE, stats.life + heal);
          const gained = stats.life - before;
          updateUI();
          if (gained > 0) announceSequence([`You rest at the inn and recover ${gained} life. You spent ${cost} gold.`, describeCurrentLocation()]);
          else announceSequence([`You rest at the inn but you were already at full health. You spent ${cost} gold.`, describeCurrentLocation()]);
        } else {
          announceSequence([`You need ${cost} gold to rest at the inn.`, describeCurrentLocation()]);
        }
    }
    else if (hasExit(pos)) {
      // Pressing Space on an Exit marks the stage complete (like a door).
      completed = true;
      continueBtn.hidden = true;
      // Announce completion but do not immediately load next level; Enter will advance.
      announceSequence(["You exit and return to the dungeon.", "Press Enter to continue."]);
      return;
    }
    else {
      // If no in-place action matched, check for adjacent exits to open with Space
      for (const d of DIRS) {
        const nr = player.row + d.dr;
        const nc = player.col + d.dc;
        if (!inBounds(nr, nc, level)) continue;
        const npos = toPos(nr, nc);
        // First handle existing exit tiles (unchanged behavior)
        if (hasExit(npos)) {
          // Open the exit (convert to an opened exit so player can move in)
          for (let i = 0; i < level.items.length; i++) {
            if (level.items[i].pos === npos && level.items[i].type === 'exit') {
              level.items[i].type = 'exit_open';
              break;
            }
          }
          revealedSpecial.set(npos, 'exit');
          updateUI();
          announceSequence([`You open the exit.`, describeCurrentLocation()]);
          return;
        }
        // Doors are not opened with Space here; Space only opens `exit` tiles.
      }
    }
    return;
  }
  // If the level is complete, Enter advances to the next stage.
  if (completed && e.key === "Enter") {
    e.preventDefault();
    if (level.nextLevelId) {
      preserveStatsOnNextLoad = true;
      loadLevel(level.nextLevelId);
      announce("Next level loaded with your stats carried over.");
    } else {
      announce("You have completed the final level. Congratulations!");
    }
    return;
  }

  if (e.key.startsWith("Arrow")) e.preventDefault();

  if (e.key === "ArrowUp") tryMove(-1, 0);
  if (e.key === "ArrowDown") tryMove(1, 0);
  if (e.key === "ArrowLeft") tryMove(0, -1);
  if (e.key === "ArrowRight") tryMove(0, 1);
});

toggleLogBtn.addEventListener("click", () => {
  const open = !logArea.hidden;
  logArea.hidden = open;
  toggleLogBtn.setAttribute("aria-expanded", String(!open));
  toggleLogBtn.textContent = open ? "View exploration log" : "Hide exploration log";
});

/* Guide dialog */
guideBtn.addEventListener("click", () => {
  guideDialog.showModal();
  closeGuideBtn.focus();
});
closeGuideBtn.addEventListener("click", () => {
  guideDialog.close();
  guideBtn.focus();
});
guideDialog.addEventListener("close", () => guideBtn.focus());

/* Restart / Continue */
restartBtn.addEventListener("click", () => {
  loadLevel(currentLevelId);
  announce("Level restarted.");
  gameEl.focus();
});
// Continue button is no longer used; Enter advances after finding the exit.
continueBtn.addEventListener("click", () => {
  // Kept for compatibility if the button is ever shown again.
  if (!level.nextLevelId) {
    announce("No next level.");
    return;
  }
  preserveStatsOnNextLoad = true;
  loadLevel(level.nextLevelId);
  announce("Next level loaded with your stats carried over.");
  gameEl.focus();
});

/* Dark mode */
function setDarkMode(on) {
  document.body.classList.toggle("dark", on);
  darkModeBtn.setAttribute("aria-pressed", String(on));
  darkModeBtn.textContent = on ? "Dark mode: On" : "Dark mode: Off";
  localStorage.setItem("darkMode", on ? "1" : "0");
}
darkModeBtn.addEventListener("click", () => {
  setDarkMode(!document.body.classList.contains("dark"));
});

/* ---------------- Load level ---------------- */
let preserveStatsOnNextLoad = false;
function loadLevel(id) {
  level = JSON.parse(JSON.stringify(LEVELS[id]));
  currentLevelId = id;
  // If the level creator saved an opening description in localStorage, prefer a per-level value.
  try {
    var perKey = 'creatorOpeningDesc_' + id;
    var creatorOpening = null;
    try { creatorOpening = localStorage.getItem(perKey); } catch (e2) { creatorOpening = null; }
    if (creatorOpening && creatorOpening.length) {
      level.scenes = level.scenes || {};
      level.scenes['A1'] = creatorOpening;
    }
  } catch (e) { /* ignore storage errors */ }
  player = { row: 0, col: 0 };
  visited = new Set();
  revealedByBump = new Set();
  revealedSpecial = new Map();
  revealedNeighbors = new Set();
  completed = false;
  // Only reset stats if not preserving from previous level
  if (!preserveStatsOnNextLoad) {
    stats = { life: 10, strength: 2, defense: 0, gold: 0, key: false };
  }
  preserveStatsOnNextLoad = false;
  discoveryLog = [];
  initMonsters();
  updateUI();
  updateLogUI();
  continueBtn.hidden = true;
  enterCell();
  gameEl.focus();
}

// Initialize dark mode from localStorage
setDarkMode(localStorage.getItem("darkMode") === "1");

// Note: pages should call `loadLevel(...)` themselves. The automatic
// `loadLevel("level1")` call was removed so host pages (like the
// single-file campaign) can control startup and avoid using the demo
// LEVELS bundled inside this runtime.