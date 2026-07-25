import { parseCsv } from "./csv";

export type ImportedOfficer = {
  sourceId: number;
  name: string;
  scenarioVariant?: string;
  force: number;
  intelligence: number;
  leadership: number;
  armsType: string;
  weapon?: string;
  intelligenceItem?: string;
  mount?: string;
};

const variantPattern = /^(.*)（([^）]+)）$/;
const requiredHeaders = ['武将ID', '名字', '武力', '智力', '统率', '兵种', '武器', '智力道具', '坐骑'];

export function parseOfficerRows(csv: string): ImportedOfficer[] {
  const [headers, ...rows] = parseCsv(csv);
  if (!headers) {
    throw new Error('Officer CSV is empty');
  }
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]));
  if (headerIndex.size !== headers.length) {
    throw new Error('Officer CSV contains duplicate columns');
  }
  for (const header of requiredHeaders) {
    if (!headerIndex.has(header)) throw new Error(`Missing required column: ${header}`);
  }

  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const rawName = getRequiredCell(row, headerIndex, "名字");
      const variantMatch = rawName.match(variantPattern);

      return {
        sourceId: getNumber(row, headerIndex, "武将ID"),
        name: variantMatch ? variantMatch[1].trim() : rawName,
        scenarioVariant: variantMatch?.[2].trim(),
        force: getNumber(row, headerIndex, "武力"),
        intelligence: getNumber(row, headerIndex, "智力"),
        leadership: getNumber(row, headerIndex, "统率"),
        armsType: getRequiredCell(row, headerIndex, "兵种"),
        weapon: getOptionalCell(row, headerIndex, "武器"),
        intelligenceItem: getOptionalCell(row, headerIndex, "智力道具"),
        mount: getOptionalCell(row, headerIndex, "坐骑"),
      };
    });
}

function getCell(row: string[], headerIndex: Map<string, number>, header: string): string {
  const index = headerIndex.get(header);
  if (index === undefined) {
    throw new Error(`Missing required column: ${header}`);
  }
  return (row[index] ?? "").trim();
}

function getOptionalCell(row: string[], headerIndex: Map<string, number>, header: string) {
  const value = getCell(row, headerIndex, header);
  return value === "" ? undefined : value;
}

function getRequiredCell(row: string[], headerIndex: Map<string, number>, header: string): string {
  const value = getCell(row, headerIndex, header);
  if (value === '') {
    throw new Error(`Missing required value in column: ${header}`);
  }
  return value;
}

function getNumber(row: string[], headerIndex: Map<string, number>, header: string): number {
  const rawValue = getRequiredCell(row, headerIndex, header);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number in column: ${header}`);
  }
  return value;
}
