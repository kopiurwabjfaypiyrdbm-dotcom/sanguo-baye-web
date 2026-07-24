# Web 三国霸业 v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable Web prototype: editable virtual strategic map, city panel, turn loop, automatic battle resolution, and simple AI.

**Architecture:** React renders interface panels and commands; Phaser renders the interactive map; pure TypeScript core owns `GameState`, rules, battle resolution, AI, import/export, and validation. Data starts from local CSV/JSON fixtures and remains editable.

**Tech Stack:** Vite, TypeScript, React, Phaser, Vitest, CSV/JSON.

## Global Constraints

- First playable loop only: main map, city panel, turn progression, automatic battle, simple AI.
- No manual battle board in v0.1.
- Map must be data-driven and editable.
- Game rules must live in pure TypeScript modules, not React components or Phaser scenes.
- React and Phaser share one `GameState`; neither owns a separate truth copy.
- Officer CSV must preserve leadership.
- Use Phaser for game view rendering and React for UI panels.
- Keep iBaye / baye-alpha as reference data only, not long-term runtime dependency.

---

## File Structure

- `src/core/types.ts`: shared domain types.
- `src/core/sampleState.ts`: deterministic starter scenario.
- `src/core/selectors.ts`: read-only helpers.
- `src/core/battle.ts`: automatic battle calculation.
- `src/core/turn.ts`: player/AI turn progression.
- `src/core/mapEditing.ts`: city coordinate and neighbor editing rules.
- `src/data/csv.ts`: small CSV parser for local data.
- `src/data/officers.ts`: import officer rows.
- `src/data/mapPersistence.ts`: serialize/deserialize editable map data.
- `src/game/events.ts`: typed event bridge between React and Phaser.
- `src/game/MapScene.ts`: Phaser map scene.
- `src/game/createGame.ts`: Phaser lifecycle wrapper.
- `src/ui/App.tsx`: app shell and state owner.
- `src/ui/CityPanel.tsx`: city detail and action panel.
- `src/ui/TopBar.tsx`: calendar and end-turn controls.
- `src/ui/LogPanel.tsx`: event log.
- `src/ui/MapEditorPanel.tsx`: map editing controls.
- `src/main.tsx`: React bootstrap.
- `src/styles.css`: application layout and visual styling.
- `src/**/*.test.ts`: Vitest tests next to the modules they validate.

---

### Task 1: App Bootstrap

**Files:**
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/ui/App.tsx`
- Create: `src/styles.css`
- Modify: `package.json`

**Interfaces:**
- Produces: a Vite React page with a root shell.
- Consumes: no game-specific modules.

- [ ] **Step 1: Add Vite entry files**

Create `index.html`:

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

Create `src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 2: Add minimal app shell**

Create `src/ui/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="top-bar">Web 三国霸业 v0.1</section>
      <section className="map-host">主地图加载区</section>
      <aside className="side-panel">城池面板</aside>
      <section className="log-panel">日志</section>
    </main>
  );
}
```

- [ ] **Step 3: Add layout CSS**

Create `src/styles.css` with a full-screen grid: top bar, center map, right panel, bottom log. Use restrained strategy-game colors and ensure no text overlap at desktop and mobile widths.

- [ ] **Step 4: Verify**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' install
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' run build
```

Expected: build exits 0.

- [ ] **Step 5: Commit**

```powershell
& '..\..\tools\mingit\cmd\git.exe' add index.html src/main.tsx src/ui/App.tsx src/styles.css package-lock.json package.json
& '..\..\tools\mingit\cmd\git.exe' commit -m "feat: bootstrap web app"
```

---

### Task 2: Core Types And Starter State

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/sampleState.ts`
- Create: `src/core/selectors.ts`
- Test: `src/core/selectors.test.ts`

**Interfaces:**
- Produces: `GameState`, `City`, `Officer`, `Faction`, `Item`, `ArmsType`, `getCityOfficers`, `getNeighborCities`.
- Consumes: no UI or Phaser.

- [ ] **Step 1: Write failing selector tests**

Create `src/core/selectors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { getCityOfficers, getNeighborCities } from './selectors';

describe('selectors', () => {
  it('returns officers stationed in a city', () => {
    const state = createSampleState();
    expect(getCityOfficers(state, 'luoyang').map((officer) => officer.name)).toContain('曹操');
  });

  it('returns neighboring cities from city ids', () => {
    const state = createSampleState();
    expect(getNeighborCities(state, 'luoyang').map((city) => city.id)).toContain('xuchang');
  });
});
```

- [ ] **Step 2: Run red**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/core/selectors.test.ts
```

Expected: fail because modules do not exist.

- [ ] **Step 3: Implement types, sample state, selectors**

Create types matching the design document. Create 12 starter cities, 3 factions, 12 officers, 6 arms types, and a few items. Implement:

```ts
export function getCityOfficers(state: GameState, cityId: string): Officer[];
export function getNeighborCities(state: GameState, cityId: string): City[];
export function getPlayerFaction(state: GameState): Faction;
```

- [ ] **Step 4: Run green**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/core/selectors.test.ts
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' run build
```

Expected: tests and build exit 0.

- [ ] **Step 5: Commit**

```powershell
& '..\..\tools\mingit\cmd\git.exe' add src/core
& '..\..\tools\mingit\cmd\git.exe' commit -m "feat: add core game state"
```

---

### Task 3: Data Import And Map Persistence

**Files:**
- Create: `src/data/csv.ts`
- Create: `src/data/officers.ts`
- Create: `src/data/mapPersistence.ts`
- Test: `src/data/csv.test.ts`
- Test: `src/data/officers.test.ts`
- Test: `src/data/mapPersistence.test.ts`

**Interfaces:**
- Produces: `parseCsv`, `parseOfficerRows`, `exportMapData`, `importMapData`.
- Consumes: `Officer`, `City`, `GameState` types.

- [ ] **Step 1: Write failing CSV tests**

Create tests for quoted CSV cells, Chinese headers, and blank equipment cells. Include this sample:

```text
武将ID,名字,武力,智力,统率,兵种,武器,智力道具,坐骑
1,曹操（时期2）,84,90,82,骑兵,倚天剑（武力+10）,,
```

Expected parsed officer:

```ts
{
  sourceId: 1,
  name: '曹操',
  scenarioVariant: '时期2',
  force: 84,
  intelligence: 90,
  leadership: 82,
  armsType: '骑兵',
  weapon: '倚天剑（武力+10）'
}
```

- [ ] **Step 2: Run red**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/data
```

Expected: fail because modules do not exist.

- [ ] **Step 3: Implement importers**

Implement `parseCsv(text: string): string[][]`, then `parseOfficerRows(text: string): ImportedOfficer[]`. Strip UTF-8 BOM. Convert empty cells to `undefined`. Parse `（时期...）` suffix into `scenarioVariant`.

- [ ] **Step 4: Implement map persistence**

`exportMapData(state)` returns city coordinate and neighbor JSON. `importMapData(state, mapData)` returns a new state with updated city coordinates and neighbor arrays. Validate missing city ids by throwing `Unknown city id: <id>`.

- [ ] **Step 5: Run green**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/data
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' run build
```

Expected: tests and build exit 0.

- [ ] **Step 6: Commit**

```powershell
& '..\..\tools\mingit\cmd\git.exe' add src/data
& '..\..\tools\mingit\cmd\git.exe' commit -m "feat: add data importers"
```

---

### Task 4: Phaser Map Scene

**Files:**
- Create: `src/game/events.ts`
- Create: `src/game/MapScene.ts`
- Create: `src/game/createGame.ts`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Produces: `createStrategyGame(container, bridge, state)`, `GameBridge`.
- Consumes: `GameState`.

- [ ] **Step 1: Write event bridge test**

Create `src/game/events.test.ts` verifying `createGameBridge()` can subscribe, emit, and unsubscribe `city:selected` and `city:moved`.

- [ ] **Step 2: Run red**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/game/events.test.ts
```

Expected: fail because bridge does not exist.

- [ ] **Step 3: Implement bridge**

Implement:

```ts
type GameEventMap = {
  'city:selected': { cityId: string };
  'city:moved': { cityId: string; x: number; y: number };
};

export function createGameBridge(): GameBridge;
```

- [ ] **Step 4: Implement Phaser scene**

Render cities as colored circles with labels. Render neighbor roads with `Graphics`. Enable camera pan/zoom. In edit mode, dragging a city emits `city:moved`.

- [ ] **Step 5: Mount Phaser in React**

`App.tsx` owns `GameState`, creates the bridge, mounts Phaser into a central `div`, and updates selected city from `city:selected`.

- [ ] **Step 6: Verify**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/game/events.test.ts
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' run build
```

Expected: tests and build exit 0.

- [ ] **Step 7: Commit**

```powershell
& '..\..\tools\mingit\cmd\git.exe' add src/game src/ui/App.tsx
& '..\..\tools\mingit\cmd\git.exe' commit -m "feat: render strategic map"
```

---

### Task 5: React UI Panels

**Files:**
- Create: `src/ui/TopBar.tsx`
- Create: `src/ui/CityPanel.tsx`
- Create: `src/ui/LogPanel.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: visible city details, officer list, end turn button, attack command controls.
- Consumes: selectors and `GameState`.

- [ ] **Step 1: Write component tests**

Create tests verifying the selected city panel shows city name, owner, resources, and stationed officers.

- [ ] **Step 2: Run red**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/ui
```

Expected: fail because components do not exist.

- [ ] **Step 3: Implement panels**

Add compact panels with stable dimensions. Avoid nested cards. Show available neighbor targets only when the selected city belongs to the player.

- [ ] **Step 4: Wire commands**

Expose callbacks:

```ts
onEndTurn(): void;
onAttack(sourceCityId: string, targetCityId: string): void;
onToggleEditMode(): void;
```

- [ ] **Step 5: Verify**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/ui
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' run build
```

Expected: tests and build exit 0.

- [ ] **Step 6: Commit**

```powershell
& '..\..\tools\mingit\cmd\git.exe' add src/ui src/styles.css
& '..\..\tools\mingit\cmd\git.exe' commit -m "feat: add strategy ui panels"
```

---

### Task 6: Turn Loop, Automatic Battle, And AI

**Files:**
- Create: `src/core/battle.ts`
- Create: `src/core/turn.ts`
- Create: `src/core/ai.ts`
- Test: `src/core/battle.test.ts`
- Test: `src/core/turn.test.ts`
- Test: `src/core/ai.test.ts`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Produces: `resolveBattle`, `applyBattleResult`, `advancePlayerAttack`, `advanceTurn`, `runAiTurn`.
- Consumes: `GameState`, `AttackOrder`.

- [ ] **Step 1: Write battle tests**

Test that attacking non-neighbor cities throws `Cities are not adjacent`, leadership increases combat score, and defender city defense improves defender score.

- [ ] **Step 2: Run red**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/core/battle.test.ts
```

Expected: fail because battle module does not exist.

- [ ] **Step 3: Implement deterministic battle**

Use deterministic pseudo-random seed from source/target/month for repeatable tests. Return:

```ts
type BattleResult = {
  winner: 'attacker' | 'defender';
  sourceCityId: string;
  targetCityId: string;
  attackerLosses: number;
  defenderLosses: number;
  logs: string[];
};
```

- [ ] **Step 4: Write and implement turn tests**

Verify month advances, resources grow, and occupied city owner changes after attacker victory.

- [ ] **Step 5: Write and implement AI tests**

Verify AI skips cities with no officers, skips no-neighbor targets, and attacks only when score ratio passes threshold.

- [ ] **Step 6: Wire UI commands**

`onAttack` calls `advancePlayerAttack`. `onEndTurn` calls `advanceTurn`, then `runAiTurn`. Append logs to visible log panel.

- [ ] **Step 7: Verify**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/core
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' run build
```

Expected: tests and build exit 0.

- [ ] **Step 8: Commit**

```powershell
& '..\..\tools\mingit\cmd\git.exe' add src/core src/ui/App.tsx
& '..\..\tools\mingit\cmd\git.exe' commit -m "feat: add turn and battle loop"
```

---

### Task 7: Map Editing And End-To-End Verification

**Files:**
- Create: `src/ui/MapEditorPanel.tsx`
- Test: `src/core/mapEditing.test.ts`
- Modify: `src/core/mapEditing.ts`
- Modify: `src/game/MapScene.ts`
- Modify: `src/ui/App.tsx`
- Modify: `README.md`

**Interfaces:**
- Produces: edit mode, city drag updates, neighbor toggle, JSON export/import.
- Consumes: event bridge and map persistence.

- [ ] **Step 1: Write map editing tests**

Test moving a city updates coordinates immutably. Test toggling a road adds it to both cities and toggling again removes it from both.

- [ ] **Step 2: Run red**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test -- src/core/mapEditing.test.ts
```

Expected: fail because map editing functions do not exist.

- [ ] **Step 3: Implement editing rules**

Implement:

```ts
export function moveCity(state: GameState, cityId: string, x: number, y: number): GameState;
export function toggleCityRoad(state: GameState, a: string, b: string): GameState;
```

- [ ] **Step 4: Add editor panel**

Add edit-mode toggle, selected city coordinate inputs, neighbor list, export button, and import textarea. Export should download/copy JSON text from `exportMapData`.

- [ ] **Step 5: Connect Phaser dragging**

When edit mode is enabled, dragged city nodes emit `city:moved`; React applies `moveCity`; Phaser rerenders from updated state.

- [ ] **Step 6: Update README**

Document local dev commands, proxy note for GitHub, and v0.1 feature checklist.

- [ ] **Step 7: Full verification**

Run:

```powershell
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' test
& '..\..\tools\node-v22.18.0-win-x64\npm.cmd' run build
```

Expected: all tests and build exit 0.

- [ ] **Step 8: Commit and push**

```powershell
& '..\..\tools\mingit\cmd\git.exe' add .
& '..\..\tools\mingit\cmd\git.exe' commit -m "feat: complete v0.1 prototype loop"
& '..\..\tools\mingit\cmd\git.exe' push
```

---

## Self-Review

- Spec coverage: all v0.1 scope items map to Tasks 1-7.
- Out of scope: manual battle board, full diplomacy, full strategy commands, complex scripts, and original binary save compatibility remain excluded.
- Type consistency: `GameState`, `City`, `Officer`, `Faction`, `Item`, `ArmsType`, `AttackOrder`, and `BattleResult` are introduced before use.
- Testing: each core behavior has a red/green test step and final build verification.
