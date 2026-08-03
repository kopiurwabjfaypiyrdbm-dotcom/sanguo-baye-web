import { describe, expect, it } from 'vitest';
import { CITY_COMMAND_GROUPS, CITY_COMMANDS, getCityCommand } from './cityCommandCatalog';

describe('city command catalog', () => {
  it('keeps every command uniquely addressable from exactly one category', () => {
    const ids = CITY_COMMANDS.map((command) => command.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(CITY_COMMANDS).toHaveLength(21);
    expect(Object.entries(CITY_COMMAND_GROUPS).every(([section, commands]) =>
      commands.every((command) => command.section === section))).toBe(true);
  });

  it('classifies editor density and always marks irreversible root commands', () => {
    expect(CITY_COMMANDS.every((command) => command.editorSize === 'quick' || command.editorSize === 'expanded')).toBe(true);
    expect(getCityCommand('transport').editorSize).toBe('expanded');
    expect(getCityCommand('attack').editorSize).toBe('expanded');
    expect(getCityCommand('plunder').dangerous).toBe(true);
    expect(getCityCommand('banish').dangerous).toBe(true);
  });
});
