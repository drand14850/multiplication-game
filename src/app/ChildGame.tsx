// Loads a child's game (server + this device's unsent rows, or the device cache when the
// server can't be reached), then plays it with every write going through the queue.

import { useEffect, useState } from "react";
import type { Backend, ServerChildState } from "../data/backend";
import { mergeSaved, readCache, ServerStore } from "../data/serverStore";
import type { OutboxItem, WriteQueue } from "../data/writeQueue";
import { Game } from "../game/ui/Game";

const LOAD_TIMEOUT_MS = 4000;

function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), ms))]);
}

export function ChildGame({ backend, queue, child, timeZone, fluencyMs, onSwitch }: {
  backend: Backend; queue: WriteQueue; child: { id: string; name: string; avatar: string };
  timeZone?: string; fluencyMs?: number; onSwitch: () => void;
}) {
  const [store, setStore] = useState<ServerStore | null>(null);

  useEffect(() => {
    let live = true;
    // Hold the queue so no row is both counted by the server and still pending here.
    queue.hold(async () => {
      const server = await within<ServerChildState>(backend.loadChildState(child.id), LOAD_TIMEOUT_MS);
      const pending = await queue.pending().catch((): OutboxItem[] => []);
      return [server, pending] as const;
    }).then(([server, pending]) => {
      if (!live) return;
      const saved = mergeSaved(server, readCache(child.id), pending, child.id, timeZone);
      setStore(new ServerStore(child.id, saved, queue));
    });
    return () => { live = false; };
  }, [backend, queue, child.id, timeZone]);

  if (!store) return <div className="screen" aria-busy="true" />;
  return <Game store={store} timeZone={timeZone} fluencyMs={fluencyMs}
               player={{ name: child.name, avatar: child.avatar, onSwitch }} />;
}
