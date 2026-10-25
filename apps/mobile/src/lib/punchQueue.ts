import * as Crypto from "expo-crypto";
import type { PunchKind } from "./database.types";
import { isNetworkError, supabase } from "./supabase";

/** Batida que não chegou ao servidor. `client_id` garante que reenviar não duplica. */
export interface QueuedPunch {
  clientId: string;
  workerId: string;
  kind: PunchKind;
  deviceTime: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
}

const KEY = "relogio.punchQueue.v1";

const read = (): QueuedPunch[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedPunch[];
  } catch {
    return [];
  }
};
const write = (q: QueuedPunch[]) => localStorage.setItem(KEY, JSON.stringify(q));

export const pendingCount = () => read().length;
export const queuedPunches = (): readonly QueuedPunch[] => read();

const send = (p: QueuedPunch, offline: boolean) =>
  supabase.rpc("register_punch", {
    p_client_id: p.clientId,
    p_worker_id: p.workerId,
    p_kind: p.kind,
    p_device_time: p.deviceTime,
    p_offline: offline,
    p_lat: p.lat,
    p_lng: p.lng,
    p_accuracy_m: p.accuracyM,
  });

/**
 * Tenta registrar online (hora do servidor). Sem rede, entra na fila com a hora do aparelho
 * e o servidor marca como `offline_synced`/`suspect_clock` ao sincronizar.
 */
export async function punch(input: Omit<QueuedPunch, "clientId" | "deviceTime">): Promise<"sent" | "queued"> {
  const p: QueuedPunch = { ...input, clientId: Crypto.randomUUID(), deviceTime: new Date().toISOString() };
  const { error } = await send(p, false);
  if (!error) return "sent";
  if (isNetworkError(error)) {
    write([...read(), p]);
    return "queued";
  }
  throw new Error(error.message);
}

/** Reenvia a fila em ordem. Para no primeiro erro de rede; erros de negócio são descartados e reportados. */
export async function flushQueue(): Promise<{ sent: number; failed: string[] }> {
  const queue = read();
  const failed: string[] = [];
  let sent = 0;
  while (queue.length) {
    const p = queue[0]!;
    const { error } = await send(p, true);
    if (error && isNetworkError(error)) break;
    if (error) failed.push(error.message);
    else sent++;
    queue.shift();
    write(queue);
  }
  return { sent, failed };
}
