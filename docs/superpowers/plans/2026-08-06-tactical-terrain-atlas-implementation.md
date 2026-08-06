# Tactical Terrain Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and integrate a borderless 8-cell pixel-art terrain atlas for the tactical battle map.

**Architecture:** Generate one source atlas at a high enough resolution for inspection, locally normalize it into an exact `544×68` production atlas with eight `68×68` cells, then let `BattleScene` load the atlas as a Phaser spritesheet and render the matching terrain frame behind existing interaction overlays. Existing terrain IDs and color fallback remain unchanged.

**Tech Stack:** Built-in ImageGen, PNG/Pillow validation, Phaser spritesheet loading, TypeScript, Vitest.

## Global Constraints

- The atlas order is exactly `grass, plain, hill, forest, village, city, camp, river`.
- The production atlas is `544×68`, with eight `68×68` cells.
- Use a borderless Q-style pixel-art look with no text, unit, faction color, range highlight, or selection state baked into the image.
- Keep existing terrain rules, IDs, interaction hit areas, and color fallback behavior intact.
- Preserve all unrelated user changes in the working tree.

---

### Task 1: Generate and normalize the terrain atlas draft

**Files:**
- Create: `assets/source/tactical/terrain/terrain-atlas-v1.png`
- Create: `assets/production/tactical/terrain/terrain-atlas-v1.png`
- Create: `assets/manifests/tactical-terrain-art.json`
- Create: `tmp/tactical-terrain-atlas-preview.png`

**Interfaces:**
- Produces a production PNG whose frame index equals the numeric `BayeTerrain` index.
- Produces a manifest with the eight stable IDs, labels, frame indices, and dimensions.

- [ ] **Step 1: Generate the visual source atlas**

Use the built-in image generation tool with a single wide pixel-art atlas prompt. Require eight clearly separated but borderless cells in the fixed order, no lettering, no black outlines, no grid lines, no units, and a continuous earthy palette. Use the result only as a source draft; do not treat generated cell boundaries as runtime borders.

- [ ] **Step 2: Inspect the generated image**

View the generated atlas and verify that all eight subjects are recognizable, that buildings are centered, and that no labels, watermarks, or hard cell borders appear. If one issue is present, make one targeted regeneration/edit pass before normalization.

- [ ] **Step 3: Normalize to production dimensions**

Use the bundled Python/Pillow runtime to crop/resize the selected source into eight exact `68×68` cells, concatenate them into `544×68`, and write both source and production artifacts. Keep the source high-resolution reference untouched.

- [ ] **Step 4: Write the manifest**

Record this exact descriptor shape:

```json
{
  "id": "tactical-terrain-atlas-v1",
  "width": 544,
  "height": 68,
  "frameWidth": 68,
  "frameHeight": 68,
  "terrains": [
    { "id": "grass", "label": "草地", "frame": 0 },
    { "id": "plain", "label": "平原", "frame": 1 },
    { "id": "hill", "label": "山地", "frame": 2 },
    { "id": "forest", "label": "森林", "frame": 3 },
    { "id": "village", "label": "村庄", "frame": 4 },
    { "id": "city", "label": "城池", "frame": 5 },
    { "id": "camp", "label": "营寨", "frame": 6 },
    { "id": "river", "label": "河流", "frame": 7 }
  ]
}
```

- [ ] **Step 5: Validate the draft**

Run a Pillow check that reports `544×68`, eight frame crops of `68×68`, non-empty alpha/coverage, and no text-like border rows dominating a cell. Generate a contact preview for visual review.

- [ ] **Step 6: Commit the art draft**

```powershell
git add assets/source/tactical/terrain/terrain-atlas-v1.png assets/production/tactical/terrain/terrain-atlas-v1.png assets/manifests/tactical-terrain-art.json
git commit -m "feat: add tactical terrain atlas draft"
```

### Task 2: Integrate terrain frames into the battle scene

**Files:**
- Create: `src/game/tacticalTerrainArt.ts`
- Modify: `src/game/BattleScene.ts`
- Test: `src/game/tacticalTerrainArt.test.ts`

**Interfaces:**
- `TACTICAL_TERRAIN_ART` exposes `key`, `source`, `frameWidth`, `frameHeight`, and `frameCount`.
- `getTacticalTerrainFrame(terrain: BayeTerrain): number` returns the stable frame index.

- [ ] **Step 1: Add the descriptor test**

Assert that all eight terrain IDs map to frame indices `0..7`, the atlas dimensions are `68×68` per frame, and invalid numeric input falls back to frame `0`.

- [ ] **Step 2: Add the descriptor module**

Define the descriptor with source `/assets/production/tactical/terrain/terrain-atlas-v1.png`, frame size `68`, and frame count `8`. Keep it isolated from Phaser scene code.

- [ ] **Step 3: Load the atlas in `BattleScene.preload`**

Call `this.load.spritesheet` with the descriptor and keep the existing unit image/spritesheet loading unchanged.

- [ ] **Step 4: Render terrain images with the existing fallback**

In the tile loop, create a terrain image/sprite at the same center and size as the current rectangle. Keep the rectangle only as a fallback when the atlas texture is unavailable. Preserve the existing interactive rectangle, reachable stroke, path preview, objective marker, unit layer, and selected-state overlays.

- [ ] **Step 5: Run focused tests**

```powershell
pnpm vitest run src/game/tacticalTerrainArt.test.ts
```

Expected: all frame mapping and descriptor tests pass.

- [ ] **Step 6: Commit the integration**

```powershell
git add src/game/tacticalTerrainArt.ts src/game/tacticalTerrainArt.test.ts src/game/BattleScene.ts
git commit -m "feat: render tactical terrain atlas in battle scene"
```

### Task 3: Verify visual and project behavior

**Files:**
- Modify: `docs/DEVELOPMENT_LOG.md`

- [ ] **Step 1: Run the project checks**

```powershell
pnpm run check
```

Expected: the repository check completes without new failures.

- [ ] **Step 2: Inspect the playable battle screen**

Open the local preview, enter a tactical battle, and verify that all eight terrain types render without black outlines, units remain readable, reachable/attackable overlays remain visible, and clicking a tile still emits the same selection behavior.

- [ ] **Step 3: Record the delivered asset**

Append a concise entry to `docs/DEVELOPMENT_LOG.md` naming the atlas path, fixed frame order, no-outline decision, and fallback behavior.

- [ ] **Step 4: Commit verification notes**

```powershell
git add docs/DEVELOPMENT_LOG.md
git commit -m "docs: record tactical terrain atlas integration"
```

