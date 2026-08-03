# 战棋六兵种像素形象 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用六个历史风格像素兵种小人像替换战棋棋盘上的武将姓名/兵力文字，并把这些文字信息集中到选中状态栏。

**Architecture:** 新增一个纯数据映射模块，将 `armsType` 映射到稳定的生产资源 URL 和资源键；Phaser `BattleScene` 只负责棋盘中的小人像、选择反馈与点击，不再绘制单位姓名/兵力。React `TacticalBattleScreen` 继续作为选中单位的信息层，并把底部选择卡明确成状态栏。

**Tech Stack:** TypeScript, React, Phaser 3, Vitest, PNG pixel-art assets, Vite `new URL(..., import.meta.url)` asset loading.

## Global Constraints

- 六种形象必须遵循东汉末年至三国时期服饰与兵器边界；不得复制未获授权的原版二进制素材。
- 棋盘单位不显示武将姓名或兵力数字；选中后状态栏显示这些信息。
- 不修改战斗规则、兵种克制、移动、攻击、技能、结算或战斗状态数据结构。
- 生产资源放入 `assets/production/tactical/units/`，生成源图放入 `assets/source/tactical/units/`。
- 每个素材基准画布约为 `64×72` 像素，透明背景，同一落脚线，不包含文字或现代 UI 符号。
- 最终交付前运行 `npm run check`；若环境无法使用 npm，记录阻断原因并至少运行可用的本地测试命令。

---

### Task 1: 建立兵种资源映射的可测试边界

**Files:**
- Create: `src/game/tacticalUnitArt.ts`
- Create: `src/game/tacticalUnitArt.test.ts`

**Interfaces:**
- Produces `TACTICAL_UNIT_ART`: `Record<BayeArmsType, { key: string; source: string }>` keyed by the existing numeric arms type `0–5`.
- Produces `getTacticalUnitArt(armsType: BayeArmsType)`: returns the mapped art descriptor and has no Phaser or DOM dependency.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { getTacticalUnitArt } from './tacticalUnitArt';

describe('getTacticalUnitArt', () => {
  it('maps every tactical arms type to a stable production asset', () => {
    expect(getTacticalUnitArt(0)).toEqual({ key: 'tactical-unit-cavalry', source: expect.stringContaining('cavalry-v1.png') });
    expect(getTacticalUnitArt(1)).toEqual({ key: 'tactical-unit-infantry', source: expect.stringContaining('infantry-v1.png') });
    expect(getTacticalUnitArt(2)).toEqual({ key: 'tactical-unit-archer', source: expect.stringContaining('archer-v1.png') });
    expect(getTacticalUnitArt(3)).toEqual({ key: 'tactical-unit-navy', source: expect.stringContaining('navy-v1.png') });
    expect(getTacticalUnitArt(4)).toEqual({ key: 'tactical-unit-elite-cavalry', source: expect.stringContaining('elite-cavalry-v1.png') });
    expect(getTacticalUnitArt(5)).toEqual({ key: 'tactical-unit-mystic-strategist', source: expect.stringContaining('mystic-strategist-v1.png') });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/game/tacticalUnitArt.test.ts`

Expected: FAIL because `src/game/tacticalUnitArt.ts` does not exist.

- [ ] **Step 3: Implement the smallest mapping module**

Import `BAYE_ARMS_TYPES` and `type BayeArmsType`; define six `new URL('../../assets/production/tactical/units/<file>', import.meta.url).href` values in the existing order `cavalry, infantry, archer, navy, elite, mystic`, export the descriptor record, and implement `getTacticalUnitArt` as a direct numeric lookup.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/game/tacticalUnitArt.test.ts`

Expected: PASS with one test and six mapping assertions.

- [ ] **Step 5: Commit**

```bash
git add src/game/tacticalUnitArt.ts src/game/tacticalUnitArt.test.ts
git commit -m "feat: map tactical unit art by arms type"
```

### Task 2: Generate and validate the six pixel-art unit assets

**Files:**
- Create: `assets/source/tactical/units/infantry-v1.png`
- Create: `assets/source/tactical/units/cavalry-v1.png`
- Create: `assets/source/tactical/units/archer-v1.png`
- Create: `assets/source/tactical/units/navy-v1.png`
- Create: `assets/source/tactical/units/elite-cavalry-v1.png`
- Create: `assets/source/tactical/units/mystic-strategist-v1.png`
- Create: corresponding production PNGs under `assets/production/tactical/units/`
- Create: `assets/manifests/tactical-unit-art.json`

**Interfaces:**
- Produces six transparent PNGs consumed by `tacticalUnitArt.ts`.
- Produces a manifest with role, prompt, dimensions, source path, production path, and manual acceptance notes.

- [ ] **Step 1: Generate one transparent/chroma-key source per unit with the built-in image generator**

Use one prompt per asset. Each prompt must specify: 64×72-ish sprite framing, transparent-background workflow, shared baseline, Han/Three Kingdoms clothing, crisp pixel-art silhouette, no text, no watermark, no extra characters. Subject-specific requirements are: infantry shield + ring-pommel longsword; cavalry mounted horse + long spear; archer composite bow + quiver; navy light armor/short robe + practical river-combat gear; elite heavy cavalry with heavy lamellar armor and heavy polearm; mystic strategist in guanfu/rujin, feather fan and scholar silhouette.

- [ ] **Step 2: Remove chroma-key background and validate alpha**

Copy each selected source into `tmp/imagegen/`, run the installed `remove_chroma_key.py` helper, and verify transparent corners, no green/magenta fringe, common foot baseline, and no text. Do not use CLI fallback or true native transparency without explicit user approval.

- [ ] **Step 3: Normalize and save production assets**

Use the repository’s available image tooling to keep the six final files at a common canvas and naming scheme. Preserve source files separately; never overwrite an existing asset version.

- [ ] **Step 4: Create the manifest**

Record the six asset IDs, source/production paths, prompts, dimensions, style constraints, and a note that these are historically informed original interpretations rather than exact original-game recreations.

- [ ] **Step 5: Inspect the six outputs together**

Use a contact sheet or image viewer to confirm consistent scale, baseline, palette, silhouette clarity at battle-map size, and distinction between cavalry and elite cavalry.

- [ ] **Step 6: Commit**

```bash
git add assets/source/tactical/units assets/production/tactical/units assets/manifests/tactical-unit-art.json
git commit -m "art: add tactical unit pixel sprites"
```

### Task 3: Render unit sprites in the Phaser battle grid

**Files:**
- Modify: `src/game/BattleScene.ts`

**Interfaces:**
- Consumes `getTacticalUnitArt` from Task 1 and the six production PNGs from Task 2.
- Keeps existing `tactical:unit-selected` event payload unchanged.

- [ ] **Step 1: Add a failing rendering-oriented unit test for the mapping boundary**

Extend `src/game/tacticalUnitArt.test.ts` with an assertion that all descriptors have distinct Phaser keys and production paths under `assets/production/tactical/units/`. This test catches accidental missing or duplicate registrations before Phaser integration.

- [ ] **Step 2: Register the six image textures before `redraw()`**

Load each descriptor once during scene creation using the existing Phaser scene texture API or the project’s established image-loading pattern. Keep a boolean readiness guard so a failed optional image does not prevent the battle scene from opening.

- [ ] **Step 3: Replace text-and-circle units with image sprites**

In the unit loop, resolve the descriptor by `unit.armsType`, create an image centered in the tile, use a common display size that stays inside `CELL_SIZE`, and remove the `name` and `troops` text objects. Keep the interactive target and existing event emission.

- [ ] **Step 4: Preserve interaction feedback without adding text**

Keep selected gold feedback, attackable red feedback, acted opacity, and side readability through a small code-rendered underlay/outline around the sprite. Do not reintroduce names, troop counts, or weapon labels onto the grid.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- src/game/tacticalUnitArt.test.ts` and `npm run build`.

Expected: mapping tests pass and the production build completes without TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/BattleScene.ts src/game/tacticalUnitArt.test.ts
git commit -m "feat: render tactical unit sprites on battle grid"
```

### Task 4: Make the selected unit status bar the sole unit text surface

**Files:**
- Modify: `src/ui/TacticalBattleScreen.tsx`
- Modify: `src/styles.css`
- Create: `src/ui/tacticalBattleUnitStatus.ts`
- Create: `src/ui/tacticalBattleUnitStatus.test.ts`

**Interfaces:**
- Consumes the existing `selectedUnit`, `selectedTerrain`, `selectedEquipment`, and status helpers.
- Produces a selected-state bar that remains readable on desktop and mobile landscape sizes.

- [ ] **Step 1: Write a failing status formatter test**

Add `formatTacticalUnitStatus(unit, armsLabel, statusLabel)` to the wished-for API and assert that it returns the selected unit name, `BAYE_ARMS_LABELS[armsType]`, formatted troop count, and action state; also assert that an unselected value returns the existing instruction string.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- src/ui/tacticalBattleUnitStatus.test.ts`.

Expected: FAIL until the status surface contract is extracted or updated.

- [ ] **Step 3: Update the existing selection card**

Keep the existing selection flow and callbacks, but style/label the card as the unit status bar. Ensure the unselected state remains an instruction and the details panel remains reachable by clicking the selected bar.

- [ ] **Step 4: Add responsive styling**

Adjust `.battle-selection-card` and related mobile breakpoint rules so the selected name, troop count, arms label, and status stay visible without overlapping the action buttons. Do not add duplicate unit data to the map canvas.

- [ ] **Step 5: Run focused test and build**

Run: `npm test -- src/ui/tacticalBattleUnitStatus.test.ts` and `npm run build`.

Expected: PASS and a successful production build.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TacticalBattleScreen.tsx src/styles.css src/ui/tacticalBattleUnitStatus.test.ts src/ui/tacticalBattleUnitStatus.ts
git commit -m "feat: move tactical unit details into selected status bar"
```

### Task 5: Visual and repository verification

**Files:**
- No documentation files are required for this visual-only implementation; the design document already records the historical-art direction as a non-parity claim.

- [ ] **Step 1: Run the complete check**

Run: `npm run check`.

Expected: reference checks, tests, TypeScript, Vite, and PWA build all pass.

- [ ] **Step 2: Perform browser acceptance at two target sizes**

Verify at `1280×720` and a mobile-landscape size around `844×390`: six unit silhouettes render in their grid cells; names and troop counts are absent from cells; selecting a unit updates the status bar; selected/attackable/acted feedback remains visible; opening details does not duplicate map text.

- [ ] **Step 3: Inspect the final diff and asset list**

Run `git status --short`, `git diff --check`, and confirm only intended source, production assets, manifest, tests, and documentation changed.

- [ ] **Step 4: Leave parity records unchanged**

Do not add an entry to `references/parity-matrix.md`: these generated sprites are historically informed original interpretations and provide no original-source behavior evidence.
