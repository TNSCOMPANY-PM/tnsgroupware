export function fillPrompt(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
}
