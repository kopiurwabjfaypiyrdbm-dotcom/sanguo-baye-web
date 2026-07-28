import { describe, expect, it } from 'vitest';
import { updateCitySatraps } from './administration';
import { governCity } from './cityCommands';
import { createSampleState } from './sampleState';
import { getCampaignCommandCost, getCampaignRuleset } from './rulesets';

describe('campaign rulesets', () => {
  it('pins evidence-backed classic initialization and command costs', () => {
    expect(getCampaignRuleset('baye-classic-v1')).toMatchObject({
      startingTroops: 100,
      satrapPolicy: 'baye-auto',
    });
    expect(getCampaignCommandCost('baye-classic-v1', 'govern')).toEqual({ stamina: 8, money: 50 });
    expect(getCampaignCommandCost('baye-classic-v1', 'surrender')).toEqual({ stamina: 15, money: 100 });
    expect(getCampaignCommandCost('baye-classic-v1', 'move')).toEqual({ stamina: 0, money: 0 });
    expect(getCampaignCommandCost('baye-classic-v1', 'reconnoitre')).toEqual({ stamina: 10, money: 20 });
  });

  it('applies the selected ruleset cost in the domain command', () => {
    const state = createSampleState();
    state.rulesetId = 'baye-classic-v1';
    state.cities.luoyang.disasterPrevention = 0;
    const next = governCity(state, { cityId: 'luoyang', officerId: 'cao-cao' });
    expect(next.cities.luoyang.money).toBe(state.cities.luoyang.money - 50);
    expect(next.officers['cao-cao'].stamina).toBe(state.officers['cao-cao'].stamina - 8);
  });

  it('recomputes classic satraps but preserves valid modern appointments', () => {
    const modern = createSampleState();
    modern.cities.luoyang.satrapOfficerId = 'xiahou-dun';
    expect(updateCitySatraps(modern).cities.luoyang.satrapOfficerId).toBe('xiahou-dun');

    const classic = structuredClone(modern);
    classic.rulesetId = 'baye-classic-v1';
    expect(updateCitySatraps(classic).cities.luoyang.satrapOfficerId).toBe('cao-cao');
    classic.officers['cao-cao'].cityId = 'chang-an';
    classic.officers['xun-yu'].cityId = 'luoyang';
    expect(updateCitySatraps(classic).cities.luoyang.satrapOfficerId).toBe('xun-yu');
  });
});
