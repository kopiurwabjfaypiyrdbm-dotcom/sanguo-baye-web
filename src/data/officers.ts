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

export function parseOfficerRows(csv: string): ImportedOfficer[] {
  const [headers, ...rows] = parseCsv(csv);
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]));

  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const rawName = getCell(row, headerIndex, "名字");
      const variantMatch = rawName.match(variantPattern);

      return {
        sourceId: getNumber(row, headerIndex, "武将ID"),
        name: variantMatch ? variantMatch[1].trim() : rawName,
        scenarioVariant: variantMatch?.[2].trim(),
        force: getNumber(row, headerIndex, "武力"),
        intelligence: getNumber(row, headerIndex, "智力"),
        leadership: getNumber(row, headerIndex, "统率"),
        armsType: getCell(row, headerIndex, "兵种"),
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

function getNumber(row: string[], headerIndex: Map<string, number>, header: string): number {
  const value = Number(getCell(row, headerIndex, header));
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number in column: ${header}`);
  }
  return value;
}
