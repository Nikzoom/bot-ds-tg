import type { BridgeKind, BridgePayload } from "@dsbot/shared";
import { pushBridgeMessage as push } from "@dsbot/db";

export async function pushBridgeMessage(kind: BridgeKind, payload: BridgePayload): Promise<void> {
  await push(kind, payload);
}
