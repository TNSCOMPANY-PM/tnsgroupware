import "server-only";
import { NotImplementedError, type GeoInput, type GeoOutput } from "./types";

export async function generate(input: GeoInput): Promise<GeoOutput> {
  switch (input.depth) {
    case "D0":
      throw new NotImplementedError("D0 runner pending (T7)");
    case "D1":
      throw new NotImplementedError("D1 runner pending (T7)");
    case "D2":
      throw new NotImplementedError("D2 runner pending (T7)");
    case "D3":
      throw new NotImplementedError("D3 runner pending (T7)");
  }
}
