import { describe, expect, it } from 'vitest';
import { rollBayeDiplomacy } from './diplomacy';

describe('Baye diplomacy rolls', () => {
  it('keeps the fixed comparison order for alienate and counterespionage', () => {
    const executor = { intelligence: 100 };
    const alienate = rollBayeDiplomacy(
      'alienate',
      executor,
      { intelligence: 50, loyalty: 0, character: 0 },
      1,
    );
    const counterespionage = rollBayeDiplomacy(
      'counterespionage',
      executor,
      { intelligence: 50, loyalty: 0, character: 3 },
      1,
    );

    expect(alienate).toEqual({ success: true, seed: 2165703038 });
    expect(counterespionage).toEqual({ success: true, seed: 217083232 });
  });

  it('uses the fourth draw to reset loyalty after a successful canvass', () => {
    const result = rollBayeDiplomacy(
      'canvass',
      { intelligence: 100 },
      { intelligence: 0, loyalty: 0, character: 1 },
      2,
    );

    expect(result).toEqual({ success: true, seed: 3079534013, recruitedLoyalty: 69 });
  });

  it('preserves the unsigned IQ subtraction used by the fixed implementation', () => {
    const result = rollBayeDiplomacy(
      'canvass',
      { intelligence: 10 },
      { intelligence: 100, loyalty: 0, character: 1 },
      2,
    );

    expect(result.success).toBe(true);
  });

  it('skips the devotion roll for induce', () => {
    const result = rollBayeDiplomacy(
      'induce',
      { intelligence: 100 },
      { intelligence: 50, loyalty: 100, character: 4 },
      8,
    );

    expect(result).toEqual({ success: true, seed: 18026106 });
  });

  it('preserves the player-only random report draw after induce', () => {
    const result = rollBayeDiplomacy(
      'induce',
      { intelligence: 100 },
      { intelligence: 50, loyalty: 100, character: 4 },
      8,
      { playerIssuer: true },
    );

    expect(result).toEqual({ success: true, seed: 1276464017 });
  });
});
