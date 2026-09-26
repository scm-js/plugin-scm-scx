/**
 * The translator the pure modules write their labels through. In the editor it is
 * `api.i18n.t` over the catalogue in `ko.ts`; `english` is the stand-in the tests get:
 * the English key with its `{name}` placeholders filled and a plural resolved.
 */
export type Params = Record<string, string | number>;
export type Translate = (text: string, params?: Params) => string;

/** Marks a string kept in a table for `tests/ko.test.ts`; it is shown through `t(value)`. */
export const msg = (text: string) => text;

export const english: Translate = (text, params) => {
  if (!params) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) { out += text.slice(i); break; }
    out += text.slice(i, open);
    const close = matching(text, open);
    const inner = text.slice(open + 1, close);
    const plural = /^(\w+), plural, (.*)$/s.exec(inner);
    if (plural) {
      const n = Number(params[plural[1]]);
      const branches = new Map<string, string>();
      const body = plural[2];
      let j = 0;
      while (j < body.length) {
        const m = /\s*(=?\w+)\s*\{/y;
        m.lastIndex = j;
        const hit = m.exec(body);
        if (!hit) break;
        const start = m.lastIndex - 1;
        const end = matching(body, start);
        branches.set(hit[1], body.slice(start + 1, end));
        j = end + 1;
      }
      const branch = branches.get(`=${n}`) ?? (n === 1 ? branches.get("one") : undefined) ?? branches.get("other") ?? "";
      out += english(branch.replaceAll("#", n.toLocaleString("en-US")), params);
    } else {
      const name = inner.split("|")[0];
      out += name in params ? String(params[name]) : `{${inner}}`;
    }
    i = close + 1;
  }
  return out;
};

function matching(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return text.length;
}
