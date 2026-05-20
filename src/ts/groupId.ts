const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Läs grupp-id från ?id=, /g/{id} eller UUID i URL. */
export function parseGroupIdFromLocation(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get("id");
  if (fromQuery) return fromQuery;

  const pathMatch = window.location.pathname.match(
    /\/g\/([0-9a-f-]{36})/i
  );
  if (pathMatch) return pathMatch[1];

  return null;
}

/** Extrahera grupp-id från en inklistrad länk. */
export function parseGroupIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url.trim(), window.location.origin);
    const q = u.searchParams.get("id");
    if (q) return q;
    const pathMatch = u.pathname.match(/\/g\/([0-9a-f-]{36})/i);
    if (pathMatch) return pathMatch[1];
  } catch {
    /* relativ URL eller ogiltig */
  }
  const match = url.match(UUID_RE);
  return match ? match[0] : null;
}

export function buildGroupUrl(groupId: string, adminKey?: string): string {
  const url = new URL(`/g/${groupId}`, window.location.origin);
  if (adminKey) url.searchParams.set("key", adminKey);
  return url.pathname + url.search;
}
