const reg = /[|`\\_]/g;
export function escapeMdTable(str: TemplateStringsArray, ...values: string[]) {
  return String.raw({ raw: str }, ...values.map((v) => v.replace(reg, "\\$&")));
}
