# Mobile month-end review

This note records the product decisions and acceptance evidence for
`docs/mission-briefs/mobile-month-end-review.md`.

## Interaction contract

- `结束本月` opens a review and never advances immediately.
- `返回继续部署`, the close button, and Escape dismiss the review without changing
  campaign state or consuming the random sequence.
- Confirmation is synchronously guarded before yielding to React, so repeated taps
  cannot start a second resolution.
- AI attacks and succession keep precedence over the report. The report opens only
  after every required battle or successor decision has completed.
- A completed report remains available from the compact campaign log until another
  campaign is created or loaded.

## Evidence-backed warnings

The review deliberately avoids predicting AI choices. It reports only state that is
already observable:

- every stationed, serving player officer without a recorded monthly action is an
  unspent opportunity, including officers whose remaining legal actions cost no stamina;
- a city is empty when it has no serving player officer stationed there;
- food risk compares next month's current-condition growth and upkeep, including the
  known troop loss caused by drought, flood, or rebellion before upkeep;
- a hostile-border city is described as weak when supported troops plus reserves are
  below 500; the copy explicitly says that an enemy attack is uncertain;
- persistent city conditions and player strategic or diplomatic orders are listed
  directly from current state.

The threshold of 500 is a presentation heuristic, not an original-game compatibility
claim and does not affect simulation rules.

## Resolution report

Logs created during the resolved month are grouped into annual progression, battle,
diplomacy, lifecycle, logistics, city events, AI activity, and other detail. Existing
`summarizeMonth` output supplies the headline. City links are added only when a city
name can be matched safely; one-character names use constrained phrases to avoid false
matches such as matching `吴` inside unrelated words.

The first group opens automatically only when it contains five or fewer entries.
Busier reports start with every group collapsed so the headline and category counts
remain the primary reading path on a phone.

## Verification map

- `src/core/monthReview.test.ts`: pure derivation, no mutation, quiet and busy reports,
  warning semantics, active orders, and safe city linking.
- `src/core/turn.test.ts`: player-defense interruption and continued deterministic turn
  resolution.
- `src/core/battleRecovery.test.ts` and `src/core/saveGame.test.ts`: exact battle cursor,
  checkpoint, save, reload, and random-state recovery.
- `src/core/officerLifecycle.test.ts` and `src/core/outcome.test.ts`: succession pause,
  persistence, resumption, and terminal campaign outcomes.
- Browser acceptance covers cancel, explicit confirmation, repeated-tap protection,
  report disclosure, city return, focus restoration, and phone/desktop layout.

Acceptance on 2026-07-28 used a bundled period-1 campaign. At 740 x 360, Escape
returned from the review to 190 year month 1 with focus restored to `结束本月`; a
double-click on confirmation advanced exactly once to month 2. The resulting 114-log
busy month kept its detail groups collapsed, could be reopened from the campaign log,
and linked back to 梓潼 without revealing unscouted city data. The page measured
740 x 360 with no document overflow. At 1280 x 720 the report measured 838 x 472,
with equal client and scroll dimensions and no browser console errors.
