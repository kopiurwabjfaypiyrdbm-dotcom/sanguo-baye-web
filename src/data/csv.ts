export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let index = input.charCodeAt(0) === 0xfeff ? 1 : 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
      } else {
        cell += char;
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushCell();
    } else if (char === "\r") {
      if (input[index + 1] === "\n") {
        index += 1;
      }
      pushRow();
    } else if (char === "\n") {
      pushRow();
    } else {
      cell += char;
    }

    index += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}
