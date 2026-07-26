import type { GameLog } from './types';

const importantCommandKeywords = [
  '主持招商',
  '治理',
  '出巡',
  '输送',
  '抵达',
  '目标易主',
  '失效',
  '流落',
];

export function summarizeMonth(logs: GameLog[]): string[] {
  const important = logs
    .filter((log) =>
      log.kind === 'ai'
      || (log.kind === 'battle' && (log.message.includes('占领') || log.message.includes('击退')))
      || log.message.includes('粮草不足')
      || importantCommandKeywords.some((keyword) => log.message.includes(keyword)))
    .map((log) => log.message);
  if (important.length > 0) return [...new Set(important)].slice(0, 5);
  return ['各势力本月没有发生重大事件。'];
}
