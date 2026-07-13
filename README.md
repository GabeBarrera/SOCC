# SOC Commander

An incident-response tabletop game inspired by *Backdoors & Breaches* (Black Hills Information Security). Four hidden attack stages — one per kill-chain category — are planted somewhere on Novacore's network. The Defenders have **10 turns**, **10 procedures**, and a **d20** to uncover all four before time runs out.

## Files

| File | Role |
| --- | --- |
| `index.html` | Main menu + the globe board game (Human/Auto Captain modes) |
| `socc_office.html` | The Office mode — a 2D side-view office-tower game sharing the same rules |
| `engine.js` | Pure game engine: state + rules, no DOM. Used by both pages |
| `game-data.js` | Card set (procedures, attacks, injects), world map nodes/links, categories |
| `support.js` | Design Component runtime for `index.html` (do not edit) |

## How index.html works

`index.html` is a single Design Component page. All state lives in one component class; the markup is one template with five screen sections toggled by `state.screen`:

1. **home** — title, mode buttons, "How to play", and a Resume button if a save exists.
2. **curtain** — the hot-seat handoff screen ("Pass the device…"), used whenever the device must change hands without leaking secrets.
3. **captain** — the Incident Captain's eyes-only view: all four hidden attack cards, their planted network nodes, which procedures detect them, and (when a roll matches more than one hidden stage) the choose-one-card decision.
4. **board** — the main play screen: turn pips, fail streak, an interactive 3D globe (amCharts 5 orthographic map) showing Novacore's sites and the revealed attack chain, the 4-slot kill chain tracker, and the dock of 10 procedure cards.
5. **debrief** — win/lose screen with a step-through replay of the full kill chain on a second globe.

### The game loop

- Each turn the Defenders pick **one procedure** card and roll a d20 (animated, or type in a physical die's result). **11+ succeeds**; *established* procedures (4 random ones per game) roll at **+3**, the rest at +0.
- On success, the engine checks which hidden attack cards list that procedure in their `detection` array:
  - **1 match** → the card flips, its site lights up and pulses on the globe.
  - **2+ matches** → the Captain secretly chooses which card to reveal (Auto Captain picks at random).
  - **0 matches** → "clean result" — the tool works, the attacker just doesn't leave those tracks.
- Played procedures cool down for **3 turns**. A natural **1**, natural **20**, or **3 fails in a row** draws an **Inject** — random events that can skip a turn, modify the next roll, remove or restore a procedure, flip a card for free, or end the game outright (including the "it was a pentest" ending).
- Reveal all 4 stages within 10 turns to **win**; otherwise the breach completes.

### Architecture notes

- `engine.js` mutates a plain game-state object and returns an **event list** (`roll`, `reveal`, `inject`, `fail`, …). The UI converts events into a queue of outcome overlays — this is why both index and Office modes can share identical rules with completely different presentations.
- The globe is rebuilt only when its data signature changes (`syncGlobe`); revealed sites pulse red and are joined by a dashed attack-path line. Drag to rotate; click a node for its status.
- Saves live in `localStorage` (`cyberoutbreak_globe_save` for the globe modes, `socc_office_save_v1` for Office); the home screen's Resume button routes to whichever mode was last played.
- Tweakable props (Tweaks panel): auto-rotate globe, CRT overlay, fast dice, and the turn limit (4–15).

### Mobile

Both pages adapt below ~720–760px: the board header compacts, the procedure dock becomes a horizontally scrollable strip, and the kill chain collapses into a tap-to-expand summary. The Office game switches to a zoomed camera that follows your analyst (instead of shrinking the whole tower to fit), and everything is playable by tap: tap a desk/rack/person to walk there and act, tap the action pill to interact again, tap another agent to switch control.

## The three game types

### 1. New Game · Human Captain (hot-seat, 2+ people)
One player is the **Incident Captain** — the game's adversary/referee. The device is passed behind the curtain screen so the Captain can secretly study the four hidden attack cards and read the opening briefing aloud. The rest play as the Defenders on the board. When a successful roll matches more than one hidden card, the device goes back to the Captain, who chooses which stage flips. The Captain can re-peek any time via the CAPTAIN VIEW button (behind a handoff curtain).

### 2. New Game · Auto Captain (solo / co-op vs. the computer)
Same board, no human adversary. The computer holds the hidden cards, the briefing appears on the scenario strip, and multi-match reveals are resolved randomly. Best for solo play or a group that wants everyone defending.

### 3. New Game · Office (`socc_office.html`)
The same engine rendered as a 2D office-tower game with a warm, paper-toned look. You control 1–3 analysts who physically walk, climb ladders, and ride the five floors of Novacore HQ (SOC, IT, HR/Marketing, Finance, Executive). An employee phones in an incident; you visit their desk to hear symptoms, then run procedures **at the matching equipment** — SIEM analysis at a terminal, server sweeps at a rack, crisis memos in the executive office. Extras on top of the base rules:

- **Coffee machine** (+25% movement speed per cup, 4 max) and the **fridge sandwich** (one-time +3 on a roll).
- The **CISO** offers a clue pointing at a useful procedure (solo/pair only — a third player displaces the CISO).
- **Multiplayer tasks**: with 2–3 agents, random side-tasks spawn each turn (malware triage, inbox clearing, physical-security checks, an executive briefing…). Leaving tasks unresolved costs hearts; three lost hearts ends the run.
- **Mini-games** (Settings toggle): replaces the d20 with hands-on exercises — SIEM triage, server sweep, log scan, containment smashing, memo writing, segmentation gates, task-manager hunting, and UEBA behavior review. Clear the exercise to succeed.
