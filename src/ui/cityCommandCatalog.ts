export type CityCommandSection = 'internal' | 'personnel' | 'military' | 'intrigue';

export type CityCommandId =
  | 'develop'
  | 'commerce'
  | 'govern'
  | 'inspect'
  | 'trade'
  | 'banquet'
  | 'plunder'
  | 'search'
  | 'recruit-officer'
  | 'reward'
  | 'move'
  | 'transport'
  | 'appoint'
  | 'banish'
  | 'item'
  | 'captive'
  | 'recruit-troops'
  | 'distribute'
  | 'recon'
  | 'attack'
  | 'diplomacy';

export type CityCommandDefinition = {
  id: CityCommandId;
  label: string;
  glyph: string;
  section: CityCommandSection;
  editorSize: 'quick' | 'expanded';
  dangerous?: boolean;
};

export const CITY_COMMAND_GROUPS: Record<CityCommandSection, CityCommandDefinition[]> = {
  internal: [
    { id: 'develop', label: '开垦', glyph: '垦', section: 'internal', editorSize: 'quick' },
    { id: 'commerce', label: '招商', glyph: '商', section: 'internal', editorSize: 'quick' },
    { id: 'govern', label: '治理', glyph: '治', section: 'internal', editorSize: 'quick' },
    { id: 'inspect', label: '出巡', glyph: '巡', section: 'internal', editorSize: 'quick' },
    { id: 'trade', label: '交易', glyph: '易', section: 'internal', editorSize: 'expanded' },
    { id: 'banquet', label: '宴请', glyph: '宴', section: 'internal', editorSize: 'quick' },
    { id: 'plunder', label: '掠夺', glyph: '掠', section: 'internal', editorSize: 'quick', dangerous: true },
  ],
  personnel: [
    { id: 'search', label: '搜寻', glyph: '寻', section: 'personnel', editorSize: 'quick' },
    { id: 'recruit-officer', label: '登用', glyph: '登', section: 'personnel', editorSize: 'quick' },
    { id: 'reward', label: '奖赏', glyph: '赏', section: 'personnel', editorSize: 'quick' },
    { id: 'move', label: '调动', glyph: '调', section: 'personnel', editorSize: 'quick' },
    { id: 'transport', label: '输送', glyph: '输', section: 'personnel', editorSize: 'expanded' },
    { id: 'appoint', label: '太守', glyph: '守', section: 'personnel', editorSize: 'quick' },
    { id: 'item', label: '道具', glyph: '宝', section: 'personnel', editorSize: 'expanded' },
    { id: 'captive', label: '俘虏', glyph: '俘', section: 'personnel', editorSize: 'expanded' },
    { id: 'banish', label: '流放', glyph: '逐', section: 'personnel', editorSize: 'quick', dangerous: true },
  ],
  military: [
    { id: 'recruit-troops', label: '征兵', glyph: '征', section: 'military', editorSize: 'quick' },
    { id: 'distribute', label: '调兵', glyph: '兵', section: 'military', editorSize: 'quick' },
    { id: 'recon', label: '侦察', glyph: '察', section: 'military', editorSize: 'quick' },
    { id: 'attack', label: '出征', glyph: '战', section: 'military', editorSize: 'expanded' },
  ],
  intrigue: [
    { id: 'diplomacy', label: '谋略行动', glyph: '谋', section: 'intrigue', editorSize: 'expanded' },
  ],
};

export const CITY_COMMANDS = Object.values(CITY_COMMAND_GROUPS).flat();

export function getCityCommand(commandId: CityCommandId): CityCommandDefinition {
  return CITY_COMMANDS.find((command) => command.id === commandId)!;
}
