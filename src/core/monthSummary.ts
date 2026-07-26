import type { GameLog } from './types';

const importantCommandKeywords = [
  '主持招商',
  '治理',
  '出巡',
  '买入',
  '卖出',
  '宴请',
  '掠夺',
  '饥荒',
  '旱灾',
  '水灾',
  '暴动',
  '恢复',
  '输送',
  '抵达',
  '目标易主',
  '失效',
  '流落',
];

export function summarizeMonth(logs: GameLog[]): string[] {
  const critical = logs.filter((log) =>
    log.message.includes('掠夺')
    || (log.kind === 'battle' && (log.message.includes('占领') || log.message.includes('击退'))));
  const logistics = logs.filter((log) =>
    log.message.includes('粮草不足')
    || ['输送', '抵达', '目标易主', '失效', '流落'].some((keyword) => log.message.includes(keyword)));
  const routine = logs.filter((log) =>
    log.kind === 'ai' || importantCommandKeywords.some((keyword) => log.message.includes(keyword)));
  const important = [...critical, ...logistics, ...routine].map((log) => log.message);
  if (important.length > 0) return [...new Set(important)].slice(0, 5);
  return ['各势力本月没有发生重大事件。'];
}
