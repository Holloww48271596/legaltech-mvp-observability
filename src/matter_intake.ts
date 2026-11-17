import { z } from "zod";
import { cron, errors, metrics } from "./observability.ts";

export const matterBody = z.object({
  matterId: z.string().min(1),
  clientName: z.string().min(1),
  signedDocumentUrl: z.string().url(),
  deadline: z.string().datetime()
});

export type Matter = z.infer<typeof matterBody>;

export function deliveryDecision(matter: Matter, now: Date): "follow_up" | "delivered" {
  return new Date(matter.deadline).getTime() <= now.getTime() ? "follow_up" : "delivered";
}

export async function recordMatter(input: unknown): Promise<{ matterId: string; decision: string }> {
  const matter = matterBody.parse(input);
  const decision = deliveryDecision(matter, new Date());
  try {
    await errors.capture({ exception: { type: "matter_intake", matter_id: matter.matterId, decision } });
    await metrics.report("legaltech.matter_intake", 1);
  } catch (error) {
    if (error instanceof Error) console.error(error.message);
  }
  return { matterId: matter.matterId, decision };
}

export async function scheduleHealthCheck(taskUrl: string): Promise<string> {
  const result = await cron.create("0 * * * *", taskUrl);
  return result.job_id;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await recordMatter({
    matterId: "matter-demo",
    clientName: "Northwind Media",
    signedDocumentUrl: "https://example.com/signed/matter-demo",
    deadline: new Date(Date.now() + 86400000).toISOString()
  });
  console.log(JSON.stringify(result));
}
