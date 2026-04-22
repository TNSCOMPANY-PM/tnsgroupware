import "server-only";
import type { GeoInput, GeoOutput } from "./types";
import { runD0 } from "./depth/D0";
import { runD1 } from "./depth/D1";
import { runD2 } from "./depth/D2";
import { runD3 } from "./depth/D3";

export async function generate(input: GeoInput): Promise<GeoOutput> {
  switch (input.depth) {
    case "D0":
      return runD0(input);
    case "D1":
      return runD1(input);
    case "D2":
      return runD2(input);
    case "D3":
      return runD3(input);
  }
}
