import assert from "node:assert/strict";
import { deliveryDecision, matterBody } from "./matter_intake.ts";

const matter = matterBody.parse({
  matterId: "matter-7",
  clientName: "Aster Studio",
  signedDocumentUrl: "https://example.com/signed/matter-7",
  deadline: "2026-10-25T09:00:00.000Z"
});

assert.equal(deliveryDecision(matter, new Date("2026-10-25T10:00:00.000Z")), "follow_up");
console.log("matter deadline decision: follow_up");
