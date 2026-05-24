import { API_BASE_URL } from "./config.js";

export interface GroupProduct {
  id: string;
  systembolagetProductId: string;
  url: string;
  name: string;
  price: number;
  imageUrl: string | null;
  minimumOrderQuantity: number;
  caseSize: number | null;
  addedByMemberId: string | null;
  addedByName: string | null;
  voteCount: number;
}

export interface GroupData {
  id: string;
  name: string;
  phase: string;
  allowSuggestions: boolean;
  isRepeating: boolean;
  adminMemberId: string;
  swishNote: string | null;
  winningProductId: string | null;
  winningProduct: GroupProduct | null;
  members: { id: string; displayName: string }[];
  products: GroupProduct[];
  votes: { memberId: string; productId: string }[];
  orderLines: {
    memberId: string;
    displayName: string;
    quantity: number;
    adjustedQuantity: number;
    lineTotal: number;
    chosenProductId: string | null;
    chosenProductName: string | null;
  }[];
  minimumOrderQuantity: number;
  caseSize: number | null;
  requestedTotalQuantity: number;
  adjustedTotalQuantity: number;
  totalCost: number;
  orderMultiples: number;
  remainderUntilNextMultiple: number;
  nextRequestedTarget: number;
  remainderUntilRequestedTarget: number;
  isOrderFulfilled: boolean;
  needsTieBreak: boolean;
    orderHistory: {
    roundNumber: number;
    completedAt: string;
    productName: string;
    productUrl: string;
    productPrice: number;
    adjustedTotalQuantity: number;
    totalCost: number;
    lines: {
      displayName: string;
      quantity: number;
      adjustedQuantity: number;
      lineTotal: number;
    }[];
  }[];
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? body.title ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const base = API_BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function adminFetch(
  path: string,
  adminKey: string,
  options: RequestInit = {}
): Promise<void> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Admin-Key", adminKey);

  const base = API_BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(await parseError(res));
}

export function createGroup(
  name: string,
  adminDisplayName: string,
  options: { allowSuggestions: boolean; isRepeating: boolean }
) {
  return apiFetch<{
    groupId: string;
    adminSecret: string;
    memberId: string;
    sessionToken: string;
    displayName: string;
  }>("/api/groups", {
    method: "POST",
    body: JSON.stringify({
      name,
      adminDisplayName,
      allowSuggestions: options.allowSuggestions,
      isRepeating: options.isRepeating,
    }),
  });
}

export function getGroup(id: string) {
  return apiFetch<GroupData>(`/api/groups/${id}`);
}

export function joinGroup(id: string, displayName: string) {
  return apiFetch<{
    memberId: string;
    sessionToken: string;
    displayName: string;
  }>(`/api/groups/${id}/join`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export function addProduct(
  groupId: string,
  token: string,
  url: string,
  name?: string,
  price?: number
) {
  return apiFetch<GroupProduct>(`/api/groups/${groupId}/products`, {
    method: "POST",
    body: JSON.stringify({ url, name, price }),
  }, token);
}

export function deleteProduct(groupId: string, token: string, productId: string) {
  return apiFetch<void>(
    `/api/groups/${groupId}/products/${productId}/delete`,
    { method: "POST" },
    token
  );
}

export function adminDeleteProduct(groupId: string, adminKey: string, productId: string) {
  return adminFetch(
    `/api/groups/${groupId}/admin/products/${productId}/delete`,
    adminKey,
    { method: "POST" }
  );
}

export function vote(groupId: string, token: string, productId: string) {
  return apiFetch<void>(`/api/groups/${groupId}/vote`, {
    method: "POST",
    body: JSON.stringify({ productId }),
  }, token);
}

export function setOrderLine(groupId: string, token: string, quantity: number) {
  return apiFetch<void>(`/api/groups/${groupId}/order-lines`, {
    method: "POST",
    body: JSON.stringify({ quantity }),
  }, token);
}
