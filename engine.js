// Cyber Outbreak \u2014 game engine v2. No DOM. Mutates a state object, returns events.
// Adds: removed procedures, revealCategory / loseProcedure / gainProcedure inject effects, pentest ending.
import { PROCEDURES, ATTACKS, INJECTS, WORLD, CATEGORIES } from './game-data.js';

const CAT_ORDER = ['initial', 'pivot', 'c2', 'persistence'];
export const RULES = {
  turns: 10, successAt: 11, establishedMod: 3, otherMod: 0,
  cooldown: 3, failStreakInject: 3,
};

export function d20() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 20) + 1;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardById(id) {
  return PROCEDURES.find(c => c.id === id) || ATTACKS.find(c => c.id === id) || INJECTS.find(c => c.id === id);
}
export function nodeById(id) { return WORLD.nodes.find(n => n.id === id); }

function neighborIds(nodeId) {
  const out = new Set();
  for (const [a, b] of WORLD.links) {
    if (a === nodeId) out.add(b);
    if (b === nodeId) out.add(a);
  }
  return out;
}

// Assign each attack to a compatible node, preferring nodes linked to already-assigned ones.
function assignNodes(attackCards) {
  const used = new Set();
  const assigned = [];
  for (const card of attackCards) {
    const compatible = WORLD.nodes.filter(n => card.siteTypes.includes(n.siteType) && !used.has(n.id));
    let poolset = compatible;
    if (assigned.length) {
      const near = new Set();
      for (const a of assigned) for (const nb of neighborIds(a.nodeId)) near.add(nb);
      const linked = compatible.filter(n => near.has(n.id));
      if (linked.length) poolset = linked;
    }
    const node = pick(poolset.length ? poolset : WORLD.nodes.filter(n => !used.has(n.id)));
    used.add(node.id);
    assigned.push({ cardId: card.id, nodeId: node.id, revealed: false });
  }
  return assigned;
}

export function createGame() {
  const attacks = CAT_ORDER.map(cat => pick(ATTACKS.filter(a => a.type === cat)));
  const hidden = assignNodes(attacks);
  const procIds = shuffle(PROCEDURES.map(p => p.id));
  const established = procIds.slice(0, 4);
  const icCard = attacks[0];
  const icNode = nodeById(hidden[0].nodeId);
  const brief = (icCard.brief || 'Something is wrong at {node}.').replace('{node}', icNode.name);
  return {
    turn: 1,
    hidden,                    // [{cardId, nodeId, revealed}] in CAT_ORDER
    established,               // procedure card ids with +3
    cooldowns: {},             // procId -> turns remaining
    removed: [],               // procIds lost to injects
    failStreak: 0,
    injectDeck: shuffle(INJECTS.map(i => i.id)),
    injectDiscard: [],
    nextRollMod: 0,
    skipNextTurn: false,
    playedThisTurn: false,
    highlightNode: null,
    brief,
    log: [{ t: 0, text: `Scenario: ${brief}` }],
    result: null,              // 'win' | 'lose' | 'pentest' | null
    loseReason: null,
  };
}

export function procedureMod(state, procId) {
  return state.established.includes(procId) ? RULES.establishedMod : RULES.otherMod;
}
export function canPlay(state, procId) {
  return !state.playedThisTurn && !state.result && !(state.cooldowns[procId] > 0)
    && !(state.removed || []).includes(procId);
}

// Play a procedure. Returns { events, matches } \u2014 if matches.length > 1 the UI must
// call revealCard() with the Captain's choice; if 1 it is auto-revealed.
export function playProcedure(state, procId, manualNatural) {
  const events = [];
  const natural = (manualNatural != null && manualNatural >= 1 && manualNatural <= 20) ? manualNatural : d20();
  const mod = procedureMod(state, procId) + state.nextRollMod;
  const usedTempMod = state.nextRollMod;
  state.nextRollMod = 0;
  const total = natural + mod;
  const success = total >= RULES.successAt;
  state.playedThisTurn = true;
  state.cooldowns[procId] = RULES.cooldown;
  const proc = cardById(procId);
  events.push({ kind: 'roll', procId, natural, mod, usedTempMod, total, success });
  state.log.push({ t: state.turn, text: `${proc.title}: rolled ${natural}${mod ? (mod > 0 ? '+' + mod : mod) : ''} = ${total} \u2014 ${success ? 'SUCCESS' : 'FAIL'}` });

  let matches = [];
  if (success) {
    state.failStreak = 0;
    matches = state.hidden.filter(h => !h.revealed && cardById(h.cardId).detection.includes(procId));
    if (matches.length === 1) {
      events.push(...revealCard(state, matches[0].cardId, procId));
    } else if (matches.length === 0) {
      events.push({ kind: 'noMatch', procId });
      state.log.push({ t: state.turn, text: `${proc.title} came back clean. Nothing found.` });
    }
  } else {
    state.failStreak += 1;
    events.push({ kind: 'fail', procId, streak: state.failStreak });
  }

  // Inject triggers: nat 1, nat 20, or 3 consecutive failures
  let injectTrigger = null;
  if (natural === 1) injectTrigger = 'Natural 1!';
  else if (natural === 20) injectTrigger = 'Natural 20!';
  else if (state.failStreak >= RULES.failStreakInject) injectTrigger = '3 failures in a row';
  if (injectTrigger && !state.result) {
    state.failStreak = 0;
    events.push(...drawInject(state, injectTrigger));
  }
  return { events, matches };
}

export function revealCard(state, cardId, procId) {
  const h = state.hidden.find(x => x.cardId === cardId);
  h.revealed = true;
  const card = cardById(cardId);
  const node = nodeById(h.nodeId);
  state.log.push({ t: state.turn, text: `REVEALED: ${card.title} at ${node.name}` });
  const events = [{ kind: 'reveal', cardId, nodeId: h.nodeId, procId }];
  if (state.hidden.every(x => x.revealed)) {
    state.result = 'win';
    events.push({ kind: 'win' });
    state.log.push({ t: state.turn, text: 'All four attack stages uncovered. Incident contained!' });
  }
  return events;
}

function drawInject(state, trigger) {
  if (!state.injectDeck.length) state.injectDeck = shuffle(state.injectDiscard.splice(0));
  if (!state.injectDeck.length) return [];
  const id = state.injectDeck.shift();
  state.injectDiscard.push(id);
  const card = cardById(id);
  state.log.push({ t: state.turn, text: `INJECT (${trigger}): ${card.title}` });
  const fx = card.effect || {};
  let detail = '';
  const followUp = [];

  if (fx.kind === 'skipTurn') { state.skipNextTurn = true; detail = 'The next turn is lost.'; }
  if (fx.kind === 'modifier') { state.nextRollMod += fx.value; detail = fx.label; }
  if (fx.kind === 'endsGame') {
    state.result = fx.result || 'lose';
    state.loseReason = card.title;
    detail = fx.result === 'pentest' ? 'The exercise ends here.' : 'THE GAME ENDS NOW.';
  }
  if (fx.kind === 'revealCategory') {
    const idx = CAT_ORDER.indexOf(fx.category);
    const h = state.hidden[idx];
    if (h && !h.revealed) {
      detail = 'The ' + (CATEGORIES[fx.category] ? CATEGORIES[fx.category].label : fx.category) + ' card flips face-up!';
      followUp.push(...revealCard(state, h.cardId, null));
    } else {
      detail = 'Already revealed \u2014 the decoys confirm what you knew.';
    }
  }
  if (fx.kind === 'loseProcedure') {
    if (!state.removed) state.removed = [];
    const avail = PROCEDURES.map(p => p.id).filter(pid => !state.removed.includes(pid));
    if (avail.length) {
      const lost = pick(avail);
      state.removed.push(lost);
      detail = 'Lost for the rest of the game: ' + cardById(lost).title;
      state.log.push({ t: state.turn, text: `Procedure lost: ${cardById(lost).title}` });
    } else detail = 'No procedures left to lose. Grim.';
  }
  if (fx.kind === 'gainProcedure') {
    if (!state.removed) state.removed = [];
    if (state.removed.length) {
      const back = state.removed.splice(Math.floor(Math.random() * state.removed.length), 1)[0];
      detail = 'Back on the table: ' + cardById(back).title;
      state.log.push({ t: state.turn, text: `Procedure recovered: ${cardById(back).title}` });
    } else {
      const cooling = Object.keys(state.cooldowns).filter(k => state.cooldowns[k] > 0);
      if (cooling.length) {
        const c = pick(cooling);
        state.cooldowns[c] = 0;
        detail = 'Cooldown cleared: ' + cardById(c).title;
      } else {
        state.nextRollMod += 1;
        detail = '+1 on your next roll.';
      }
    }
  }
  if (fx.mapEvent === 'highlightRandom') {
    state.highlightNode = pick(WORLD.nodes.filter(n => !state.hidden.some(h => h.revealed && h.nodeId === n.id))).id;
  }
  return [{ kind: 'inject', cardId: id, trigger, detail }, ...followUp];
}

export function endTurn(state) {
  const events = [];
  if (state.result) return events;
  const advance = () => {
    state.turn += 1;
    state.playedThisTurn = false;
    for (const k of Object.keys(state.cooldowns)) {
      if (state.cooldowns[k] > 0) state.cooldowns[k] -= 1;
    }
  };
  advance();
  if (state.skipNextTurn && state.turn <= RULES.turns) {
    state.skipNextTurn = false;
    state.log.push({ t: state.turn, text: `Turn ${state.turn} lost.` });
    events.push({ kind: 'turnSkipped', turn: state.turn });
    advance();
  }
  if (state.turn > RULES.turns) {
    state.result = 'lose';
    state.loseReason = 'The attackers finished their operation. Time ran out.';
    state.log.push({ t: RULES.turns, text: 'Final turn ended. The attackers got away with it.' });
    events.push({ kind: 'lose' });
  }
  return events;
}

export { CAT_ORDER };
