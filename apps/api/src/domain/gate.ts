// Quality gate (handoff §3.2) — decides BEFORE touching existing data. Order matters.
import type { RunStatus } from "@pp/contracts";
import { NOTE } from "./notes.js";

export const FLOOR = 0.4;

export type GateInput = {
  platform: string;
  actorFailedStatus?: string | null; // Apify terminal status other than SUCCEEDED
  unreadableReason?: string | null;
  itemsIn: number;
  itemsOut: number;
  prevSuccessfulCount: number | null;
};

export type GateResult = { status: Exclude<RunStatus, "running">; note: string | null; processRetirements: boolean };

export function assessRun(i: GateInput): GateResult {
  if (i.actorFailedStatus) return { status: "failed", note: NOTE.apifyStatus(i.actorFailedStatus), processRetirements: false };
  if (i.unreadableReason)
    return { status: "suspect", note: NOTE.unreadable(i.platform, i.unreadableReason), processRetirements: false };
  // A product search for a real keyword always has results; 0 rows = blocked/broken actor (seen on Temu 2026-09-24).
  if (i.itemsIn === 0) return { status: "suspect", note: NOTE.noRows(i.platform), processRetirements: false };
  if (i.itemsOut === 0) return { status: "suspect", note: NOTE.noneReadable(i.platform, i.itemsIn), processRetirements: false };
  if (i.prevSuccessfulCount && i.itemsOut < FLOOR * i.prevSuccessfulCount)
    return { status: "suspect", note: NOTE.belowFloor(i.itemsOut, i.prevSuccessfulCount), processRetirements: false };
  return {
    status: "succeeded",
    note: i.itemsOut < i.itemsIn ? NOTE.partlyRead(i.itemsOut, i.itemsIn) : null,
    processRetirements: true,
  };
}
