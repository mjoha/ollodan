export interface MemberSession {
  memberId: string;
  sessionToken: string;
  displayName: string;
}

const sessionKey = (groupId: string) => `ollodan:session:${groupId}`;
const adminKey = (groupId: string) => `ollodan:admin:${groupId}`;

export function getSession(groupId: string): MemberSession | null {
  const raw = localStorage.getItem(sessionKey(groupId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MemberSession;
  } catch {
    return null;
  }
}

export function setSession(groupId: string, session: MemberSession): void {
  localStorage.setItem(sessionKey(groupId), JSON.stringify(session));
}

export function getAdminKey(groupId: string): string | null {
  return sessionStorage.getItem(adminKey(groupId));
}

export function setAdminKey(groupId: string, key: string): void {
  sessionStorage.setItem(adminKey(groupId), key);
}

export function clearAdminKey(groupId: string): void {
  sessionStorage.removeItem(adminKey(groupId));
}

export function clearSession(groupId: string): void {
  localStorage.removeItem(sessionKey(groupId));
}
