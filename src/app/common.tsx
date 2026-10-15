import { BY_ID } from "../game/logic/collectibles";

export function AnimalSvg({ id, className }: { id: string; className?: string }) {
  return <svg viewBox="0 0 200 200" aria-hidden="true" className={className}
              dangerouslySetInnerHTML={{ __html: BY_ID.get(id)?.svg ?? "" }} />;
}

export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/fetch|network/i.test(m)) return "Can't reach the server. Check the internet connection and try again.";
  return m;
}
