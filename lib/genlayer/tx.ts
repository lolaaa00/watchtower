import type { WatchtowerClient } from "./client";

export async function waitForTx(
  client: WatchtowerClient,
  hash: string,
  status: string = "FINALIZED"
) {
  return client.waitForTransactionReceipt({
    hash: hash as any,
    status: status as any,
    interval: 3000,
    retries: 40,
  });
}
