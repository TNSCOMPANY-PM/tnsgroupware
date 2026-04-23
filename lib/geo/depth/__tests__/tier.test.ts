/* PR030 tier classifier 단위 테스트.
 *   npx tsx lib/geo/depth/__tests__/tier.test.ts
 */
import Module from "module";
const ModuleAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModuleAny._load;
ModuleAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

import { classifyTier, D3T4BlockedError } from "../tier";

const cases: Array<{ name: string; args: Parameters<typeof classifyTier>[0]; expect: string }> = [
  { name: "T1 — 교촌급 (FTC 30년, 1400점)",      args: { stores: 1400, ftcYears: 30, posMonths: 0 },  expect: "T1" },
  { name: "T2 — 오공 (52점, POS 37개월)",         args: { stores: 52, ftcYears: 1, posMonths: 37 },    expect: "T2" },
  { name: "T2 — FTC 2년 + POS 24개월",            args: { stores: 20, ftcYears: 2, posMonths: 24 },    expect: "T2" },
  { name: "T3 — FTC 1년 단독",                    args: { stores: 15, ftcYears: 1, posMonths: 0 },     expect: "T3" },
  { name: "T3 — 12점포 단독",                     args: { stores: 12, ftcYears: 0, posMonths: 0 },     expect: "T3" },
  { name: "T4 — 5점포 + 신생",                    args: { stores: 5, ftcYears: 0, posMonths: 0 },      expect: "T4" },
  { name: "T4 — null stores",                     args: { stores: null, ftcYears: 0, posMonths: 0 },   expect: "T4" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = classifyTier(c.args);
  if (got === c.expect) { pass++; console.log("  ✓", c.name, "→", got); }
  else { fail++; console.error("  ✗", c.name, "expected", c.expect, "got", got); }
}

try {
  throw new D3T4BlockedError("TestBrand", { stores: 0, ftcYears: 0, posMonths: 0 });
} catch (e) {
  const err = e as D3T4BlockedError;
  if (err.code === "D3_T4_BLOCKED" && err.message.includes("성숙도")) {
    pass++; console.log("  ✓ D3T4BlockedError shape + code");
  } else {
    fail++; console.error("  ✗ D3T4BlockedError bad shape:", err);
  }
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exitCode = 1;
