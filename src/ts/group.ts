import {
  addProduct,
  adminDeleteProduct,
  adminFetch,
  deleteProduct,
  getGroup,
  joinGroup,
  setOrderLine,
  vote,
  type GroupData,
  type GroupProduct,
} from "./api.js";
import { escapeAttr, escapeHtml } from "./escape.js";
import { buildGroupUrl, parseGroupIdFromLocation } from "./groupId.js";
import {
  getAdminKey,
  getSession,
  setAdminKey,
  setSession,
  type MemberSession,
} from "./storage.js";
import { win as buildWin } from "./ui.js";

/** Window chrome; all windows use admin styling when admin key is present. */
function win(title: string, body: string, extraClass = ""): string {
  const parts = ["admin-view", extraClass].filter(Boolean);
  return buildWin(title, body, adminKey ? parts.join(" ") : extraClass);
}
import {
  formatSwishDigits,
  normalizeSwishNumber,
  swishDigitsOnly,
  validateField,
  validateForm,
  wireValidatedFields,
} from "./validate.js";

const PHASES_SUGGESTIONS = [
  { key: "Collecting", label: "1. Förslag" },
  { key: "Voting", label: "2. Rösta" },
  { key: "Ordering", label: "3. Antal" },
  { key: "Closed", label: "4. Klart" },
] as const;

const PHASES_ADMIN_PICKS = [
  { key: "Collecting", label: "1. Öl" },
  { key: "Ordering", label: "2. Antal" },
  { key: "Closed", label: "3. Klart" },
] as const;

function groupPhases(g: GroupData) {
  return g.allowSuggestions ? PHASES_SUGGESTIONS : PHASES_ADMIN_PICKS;
}

function isGroupAdmin(): boolean {
  return !!session && !!group && session.memberId === group.adminMemberId;
}

function canDeleteProduct(p: GroupProduct): boolean {
  if (!group || group.phase !== "Collecting") return false;
  if (adminKey || isGroupAdmin()) return true;
  return !!session && p.addedByMemberId === session.memberId;
}

async function removeProduct(productId: string, btn: HTMLButtonElement) {
  const product = group?.products.find((p) => p.id === productId);
  const label = product?.name ?? "ölen";
  if (!confirm(`Ta bort ${label}?`)) return;

  const isOwn = !!session && product?.addedByMemberId === session.memberId;
  const useMemberApi = !!session && (isOwn || isGroupAdmin());

  await withBusy(btn, "…", async () => {
    try {
      if (useMemberApi) {
        await deleteProduct(groupId!, session!.sessionToken, productId);
      } else if (adminKey) {
        await adminDeleteProduct(groupId!, adminKey, productId);
      } else {
        return;
      }
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Kunde inte ta bort");
    }
  });
}

function renderProductActions(p: GroupProduct): string {
  if (!canDeleteProduct(p)) return "";
  return `<button type="button" class="delete-product-btn" data-product-id="${p.id}">Ta bort</button>`;
}

const params = new URLSearchParams(window.location.search);
const groupId = parseGroupIdFromLocation();
const adminKeyFromUrl = params.get("key");

const app = document.getElementById("app")!;
const errorBanner = document.getElementById("error-banner") as HTMLElement;

let session: MemberSession | null = null;
let adminKey: string | null = null;
let pollTimer: number | null = null;
let group: GroupData | null = null;
let lastGroupSnapshot = "";

interface FormDrafts {
  productUrl?: string;
  productName?: string;
  productPrice?: string;
  quantity?: string;
  displayName?: string;
  selectedBeerId?: string;
  swishNote?: string;
}

let pendingDrafts: FormDrafts = {};
let shellReady = false;
let eventsBound = false;
let pollFailures = 0;

const connectionStatus = document.getElementById("connection-status") as HTMLElement;

function captureDrafts(): FormDrafts {
  const d: FormDrafts = {};
  const url = document.querySelector(
    '#add-product-form input[name="url"]'
  ) as HTMLInputElement | null;
  if (url) d.productUrl = url.value;

  const pname = document.querySelector(
    '#add-product-form input[name="name"]'
  ) as HTMLInputElement | null;
  if (pname) d.productName = pname.value;

  const pprice = document.querySelector(
    '#add-product-form input[name="price"]'
  ) as HTMLInputElement | null;
  if (pprice) d.productPrice = pprice.value;

  const qty = document.querySelector(
    '#order-form input[name="quantity"]'
  ) as HTMLInputElement | null;
  if (qty) d.quantity = qty.value;

  const display = document.getElementById("display-name") as HTMLInputElement | null;
  if (display) d.displayName = display.value;

  const beerPick = document.querySelector(
    'input[name="beer-pick"]:checked'
  ) as HTMLInputElement | null;
  if (beerPick) d.selectedBeerId = beerPick.value;

  const swish = document.getElementById("swish-note") as HTMLInputElement | null;
  if (swish) d.swishNote = swish.value;

  return d;
}

let errorTimer: number | null = null;

function showError(msg: string) {
  if (errorTimer !== null) window.clearTimeout(errorTimer);
  errorBanner.textContent = msg;
  errorBanner.className = "status-banner";
  errorBanner.hidden = false;
  errorTimer = window.setTimeout(() => {
    errorBanner.hidden = true;
    errorTimer = null;
  }, 5000);
}

function setConnectionOk() {
  pollFailures = 0;
  connectionStatus.hidden = true;
  connectionStatus.textContent = "";
  connectionStatus.classList.remove("is-offline");
}

function setConnectionOffline() {
  connectionStatus.hidden = false;
  connectionStatus.textContent = "Ingen anslutning";
  connectionStatus.classList.add("is-offline");
}

function saveFocusSelector(): string | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !app.contains(el)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const name = (el as HTMLInputElement).name;
  if (name) return `[name="${CSS.escape(name)}"]`;
  const productId = el.dataset.productId;
  if (productId) return `[data-product-id="${CSS.escape(productId)}"]`;
  return null;
}

function restoreFocus(selector: string | null) {
  if (!selector) return;
  const el = app.querySelector(selector) as HTMLElement | null;
  el?.focus({ preventScroll: true });
}

async function withBusy(
  btn: HTMLButtonElement,
  label: string,
  fn: () => Promise<void>
) {
  if (btn.disabled || btn.classList.contains("is-busy")) return;
  const prev = btn.textContent;
  btn.disabled = true;
  btn.classList.add("is-busy");
  btn.textContent = label;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    btn.textContent = prev;
  }
}

function formatPrice(n: number): string {
  return `${n.toFixed(0)} kr`;
}

async function init() {
  if (!groupId) {
    app.innerHTML = win(
      "Ingen grupp",
      `<p class="hint">Öppna en inbjudningslänk (<code>/g/…</code>) eller skapa en grupp.</p>
       <p><a href="index.html" class="button primary">Till Öl-lödan</a></p>`
    );
    return;
  }

  if (adminKeyFromUrl) {
    setAdminKey(groupId, adminKeyFromUrl);
  }
  adminKey = getAdminKey(groupId);
  session = getSession(groupId);

  bindEvents();
  await refresh();
  pollTimer = window.setInterval(refresh, 4000);
}

async function refresh() {
  try {
    const data = await getGroup(groupId!);
    setConnectionOk();
    const snapshot = JSON.stringify(data);
    if (snapshot === lastGroupSnapshot) return;

    pendingDrafts = captureDrafts();
    lastGroupSnapshot = snapshot;
    group = data;
    render();
  } catch (err) {
    pollFailures++;
    if (group) {
      if (pollFailures >= 2) setConnectionOffline();
      return;
    }
    shellReady = false;
    app.innerHTML = win(
      "Fel",
      `<p class="error">${escapeHtml(err instanceof Error ? err.message : "Fel vid laddning")}</p>
       <p><button type="button" class="primary" id="btn-retry-load">Försök igen</button></p>`
    );
    document.getElementById("btn-retry-load")?.addEventListener("click", () => refresh());
  }
}

function ensureRegionsShell() {
  if (shellReady) return;
  app.innerHTML = `
    <div id="region-header"></div>
    <div id="region-admin-hint"></div>
    <div id="region-phase"></div>
    <div id="region-main"></div>
    <div id="region-members"></div>
    <div id="region-history"></div>
  `;
  shellReady = true;
}

function patchRegion(id: string, html: string) {
  const el = document.getElementById(id);
  if (!el || el.innerHTML === html) return;
  el.innerHTML = html;
}

function buildRegions(drafts: FormDrafts): Record<string, string> {
  if (!group) return {};

  let main = "";
  if (!session) main += renderJoinForm(drafts);

  switch (group.phase) {
    case "Collecting":
      main += renderCollecting(drafts);
      break;
    case "Voting":
      main += renderVoting();
      break;
    case "Ordering":
      main += renderOrdering(drafts);
      break;
    case "Closed":
      main += renderClosed();
      break;
  }

  return {
    header: renderGroupHeader(drafts),
    "admin-hint": renderAdminKeyHint(),
    phase: renderPhaseWindow(group),
    main,
    members: renderMembers(),
    history: renderOrderHistory(),
  };
}

function render() {
  if (!group) return;

  const drafts = pendingDrafts;
  pendingDrafts = {};
  const focusSelector = saveFocusSelector();

  ensureRegionsShell();
  const regions = buildRegions(drafts);
  for (const [key, html] of Object.entries(regions)) {
    patchRegion(`region-${key}`, html);
  }

  app.setAttribute("aria-busy", "false");
  wireValidatedFields(app);
  restoreFocus(focusSelector);
}

function phaseHint(g: GroupData): string {
  if (!session) {
    return "Ange ditt namn nedan för att gå med i gruppen.";
  }
  switch (g.phase) {
    case "Collecting":
      if (!g.allowSuggestions) {
        return isGroupAdmin()
          ? "Lägg till öl från Systembolaget och bekräfta valet."
          : "Vänta tills admin har valt öl.";
      }
      if (g.products.length === 1) {
        return "Ett förslag — admin kan gå vidare utan röstning.";
      }
      return "Lägg till öl-förslag via Systembolaget-länk.";
    case "Voting":
      return "Välj den öl du vill beställa — flest röster vinner.";
    case "Ordering":
      return "Ange hur många flaskor du vill ha och spara.";
    case "Closed":
      return "Beställ hos Systembolaget enligt sammanfattningen.";
    default:
      return "";
  }
}

function renderAdminKeyHint(): string {
  if (!group || adminKey) return "";
  if (!session || session.memberId !== group.adminMemberId) return "";
  return win(
    "Admin",
    `<p class="hint">Öppna <strong>admin-länken</strong> du fick när gruppen skapades för att styra gruppen och dela inbjudan. Spara den i bokmärken.</p>`
  );
}

function formatSwishNumber(raw: string): string {
  return formatSwishDigits(swishDigitsOnly(raw));
}

function swishTelHref(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("46")) return `+${digits}`;
  if (digits.startsWith("0")) return `+46${digits.slice(1)}`;
  return `+46${digits}`;
}

function adminDisplayName(g: GroupData): string {
  return g.members.find((m) => m.id === g.adminMemberId)?.displayName ?? "—";
}

function renderSwishInHeader(drafts: FormDrafts): string {
  if (!group) return "";

  if (adminKey) {
    const swishRaw = drafts.swishNote ?? group.swishNote ?? "";
    const swishValue = swishRaw ? formatSwishDigits(swishDigitsOnly(swishRaw)) : "";
    return `
    <div class="field group-swish">
      <label class="field-label" for="swish-note">Swish-nummer (valfritt)</label>
      <div class="link-row">
        <input
          type="text"
          id="swish-note"
          name="swishNote"
          inputmode="numeric"
          autocomplete="tel"
          maxlength="13"
          placeholder="070-123 45 67"
          value="${escapeAttr(swishValue)}"
          data-validate="swish"
          data-validate-msg="Ange ett giltigt mobilnummer (10 siffror, börjar med 07)."
        />
        <button type="button" id="btn-save-swish">Spara</button>
      </div>
    </div>`;
  }

  if (!group.swishNote) return "";

  const display = formatSwishNumber(group.swishNote);
  return `<p class="group-swish-line">
    <span class="field-label">Swish</span>
    <a href="tel:${escapeAttr(swishTelHref(group.swishNote))}">${escapeHtml(display)}</a>
  </p>`;
}

function renderGroupHeader(drafts: FormDrafts): string {
  if (!group) return "";
  return win(
    "Grupp",
    `<div class="inset-panel readonly-field">${escapeHtml(group.name)}</div>
     <p class="group-meta">Admin: <strong>${escapeHtml(adminDisplayName(group))}</strong></p>
     ${adminKey ? renderAdminLinks() : ""}
     ${renderSwishInHeader(drafts)}`
  );
}

function renderPhaseStepActions(
  g: GroupData,
  phaseKey: string,
  index: number,
  currentIdx: number
): string {
  if (!adminKey) return "";

  if (index < currentIdx) {
    const revertPhase =
      phaseKey === "Voting" && g.products.length === 1 ? "Collecting" : phaseKey;
    return `<div class="phase-step-actions">
      <button type="button" class="phase-revert-btn" data-revert-phase="${revertPhase}">Tillbaka</button>
    </div>`;
  }

  if (index !== currentIdx) return "";

  if (phaseKey === "Collecting" && g.allowSuggestions) {
    const count = g.products.length;
    const canStart = count > 0;
    const single = count === 1;
    const startLabel = single ? "Gå vidare" : "Starta röstning";
    return `<div class="phase-step-actions">
      <button type="button" id="btn-start-voting" class="primary"${canStart ? "" : " disabled"}>${startLabel}</button>
    </div>`;
  }

  if (phaseKey === "Collecting" && !g.allowSuggestions) {
    return `<div class="phase-step-actions"><span class="hint">Bekräfta öl nedan</span></div>`;
  }

  if (phaseKey === "Voting") {
    const single = g.products.length === 1;
    const label = single ? "Gå vidare" : "Avsluta röstning";
    return `<div class="phase-step-actions">
      <button type="button" id="btn-finish-voting" class="primary">${label}</button>
    </div>`;
  }

  if (phaseKey === "Ordering") {
    const closeLabel = g.isRepeating ? "Bekräfta" : "Stäng order";
    const closeDisabled = g.isOrderFulfilled ? "" : " disabled";
    return `<div class="phase-step-actions">
      <button type="button" id="btn-close" class="primary"${closeDisabled}>${closeLabel}</button>
    </div>`;
  }

  return "";
}

function renderPhaseAdminExtras(g: GroupData): string {
  if (!adminKey) return "";

  const hints: string[] = [];

  if (g.phase === "Collecting" && g.allowSuggestions) {
    if (g.products.length === 0) {
      hints.push("Minst ett förslag krävs innan ni kan gå vidare.");
    } else if (g.products.length === 1) {
      hints.push("Ett förslag — röstning hoppas över.");
    }
  }

  if (g.phase === "Ordering" && !g.isOrderFulfilled) {
    hints.push("Minimiantalet måste vara uppnått innan beställningen kan avslutas.");
  }

  const tieBreak =
    g.needsTieBreak && g.phase === "Voting"
      ? `<div class="alert">
      <p class="status-line">Oavgjort — välj vinnare</p>
      <div class="tie-products">
        ${g.products
          .filter((p) => p.voteCount === Math.max(...g.products.map((x) => x.voteCount)))
          .map(
            (p) =>
              `<button type="button" class="pick-winner" data-product-id="${p.id}">${escapeHtml(p.name)} (${p.voteCount})</button>`
          )
          .join("")}
      </div>
    </div>`
      : "";

  const hintsHtml =
    hints.length > 0
      ? hints.map((h) => `<p class="hint phase-admin-hint">${escapeHtml(h)}</p>`).join("")
      : "";

  if (!hintsHtml && !tieBreak) return "";

  return `<div class="phase-admin-block">${hintsHtml}${tieBreak}</div>`;
}

function renderPhaseWindow(g: GroupData): string {
  const phases = groupPhases(g);
  const currentIdx = phases.findIndex((p) => p.key === g.phase);
  const items = phases
    .map((p, i) => {
      const cls =
        i === currentIdx
          ? " phase-step-current"
          : i < currentIdx
            ? " phase-step-done"
            : "";
      const actions = renderPhaseStepActions(g, p.key, i, currentIdx);
      return `<li class="phase-step${cls}">
        <span class="phase-step-label">${p.label}</span>
        ${actions}
      </li>`;
    })
    .join("");

  const hint = phaseHint(g);
  const hintHtml = hint ? `<p class="hint phase-hint">${escapeHtml(hint)}</p>` : "";

  return win(
    "Steg",
    `${hintHtml}
     <ul class="phase-steps" aria-label="Gruppens steg">${items}</ul>
     ${renderPhaseAdminExtras(g)}`
  );
}

function renderJoinForm(drafts: FormDrafts): string {
  const value = drafts.displayName ?? "";
  return win(
    "Gå med",
    `<form id="join-form" novalidate>
      <div class="field">
        <label class="field-label" for="display-name">Namn</label>
        <input id="display-name" name="displayName" type="text" required maxlength="50" placeholder="t.ex. Erik" value="${escapeAttr(value)}" data-required-msg="Ange ditt namn." />
      </div>
      <button type="submit" class="primary">Gå med</button>
    </form>`
  );
}

function renderAdminLinks(): string {
  if (!groupId || !adminKey) return "";

  const participantUrl =
    window.location.origin + buildGroupUrl(groupId);
  const adminUrl =
    window.location.origin + buildGroupUrl(groupId, adminKey);

  return `
    <div class="field">
      <label class="field-label">Deltagarlänk</label>
      <div class="link-row">
        <input type="text" readonly value="${escapeAttr(participantUrl)}" id="participant-url" />
        <button type="button" data-copy="participant-url">Kopiera</button>
      </div>
    </div>
    <div class="field">
      <label class="field-label">Admin-länk (behåll privat)</label>
      <div class="link-row">
        <input type="text" readonly value="${escapeAttr(adminUrl)}" id="admin-url" />
        <button type="button" data-copy="admin-url">Kopiera</button>
      </div>
    </div>`;
}

function renderCollecting(drafts: FormDrafts): string {
  if (!group) return "";

  if (!group.allowSuggestions) {
    if (isGroupAdmin()) return renderAdminBeerSetup(drafts);
    return renderWaitingForAdminBeer();
  }

  const addForm = session
    ? win(
        "Lägg till öl",
        `<p class="hint">Klistra in systembolaget.se-länk</p>
         <form id="add-product-form" novalidate>
           <input type="url" name="url" required placeholder="https://www.systembolaget.se/produkt/..." value="${escapeAttr(drafts.productUrl ?? "")}" data-required-msg="Klistra in en produktlänk." />
           <details class="manual-fallback">
             <summary>Manuell inmatning</summary>
             <input type="text" name="name" placeholder="Namn" value="${escapeAttr(drafts.productName ?? "")}" />
             <input type="number" name="price" placeholder="Pris (kr)" min="0" step="1" value="${escapeAttr(drafts.productPrice ?? "")}" />
           </details>
           <button type="submit">Lägg till</button>
         </form>`
      )
    : "";

  const list =
    group.products.length === 0
      ? '<p class="muted">Inga förslag ännu.</p>'
      : renderProductList(group.products, { allowDelete: true });

  return `${addForm}${win(`Förslag (${group.products.length})`, list)}`;
}

function renderWaitingForAdminBeer(): string {
  if (!group) return "";
  const preview =
    group.products.length === 0
      ? '<p class="muted">Admin lägger in öl snart.</p>'
      : `<p class="hint">Admin bekräftar öl innan ni kan ange antal.</p>${renderProductList(group.products, { allowDelete: true })}`;
  return win("Väntar på öl", preview);
}

function renderAdminBeerSetup(drafts: FormDrafts): string {
  if (!group) return "";

  const selectedId =
    drafts.selectedBeerId ??
    (group.products.length === 1 ? group.products[0]!.id : "");

  const preview =
    group.products.length === 0
      ? '<p class="muted">Klistra in en länk och klicka Lägg till.</p>'
      : `<ul class="product-list beer-confirm-list">
          ${group.products
            .map((p) => {
              const checked = selectedId === p.id;
              return `
            <li class="product-item ${checked ? "selected" : ""}">
              <label class="beer-pick-label">
                <input type="radio" name="beer-pick" value="${p.id}" class="win-radio" ${checked ? "checked" : ""} />
                ${productImage(p)}
                <span class="product-info">
                  <strong>${escapeHtml(p.name)}</strong>
                  <span>${formatPrice(p.price)} · min ${p.minimumOrderQuantity} st</span>
                </span>
              </label>
              ${renderProductActions(p)}
            </li>`;
            })
            .join("")}
        </ul>`;

  return win(
    "Beställningsöl",
    `<p class="hint">1. Klistra in systembolaget.se-länk · 2. Lägg till · 3. Bekräfta öl</p>
     <form id="add-product-form" novalidate>
       <input type="url" name="url" required placeholder="https://www.systembolaget.se/produkt/..." value="${escapeAttr(drafts.productUrl ?? "")}" data-required-msg="Klistra in en produktlänk." />
       <details class="manual-fallback">
         <summary>Manuell inmatning</summary>
         <input type="text" name="name" placeholder="Namn" value="${escapeAttr(drafts.productName ?? "")}" />
         <input type="number" name="price" placeholder="Pris (kr)" min="0" step="1" value="${escapeAttr(drafts.productPrice ?? "")}" />
       </details>
       <button type="submit">Lägg till</button>
     </form>
     ${preview}
     <div class="btn-row confirm-beer-row">
       <button type="button" id="btn-confirm-beer" class="primary" ${selectedId ? "" : "disabled"}>
         Bekräfta öl och öppna beställning
       </button>
     </div>`
  );
}

function renderVoting(): string {
  if (!group) return "";

  const myVote = session
    ? group.votes.find((v) => v.memberId === session!.memberId)?.productId
    : null;

  const list = `
    ${!session ? '<p class="muted">Gå med för att rösta.</p>' : ""}
    <ul class="product-list vote-list">
      ${group.products
        .map((p) => {
          const selected = myVote === p.id;
          return `
        <li class="product-item ${selected ? "selected" : ""}">
          ${productImage(p)}
          <div class="product-info">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${formatPrice(p.price)} · ${p.voteCount} röst${p.voteCount === 1 ? "" : "er"}</span>
          </div>
          ${session ? `<button type="button" class="vote-btn ${selected ? "primary" : ""}" data-product-id="${p.id}">${selected ? "Vald" : "Rösta"}</button>` : ""}
        </li>`;
        })
        .join("")}
    </ul>`;

  return win("Röstning", list);
}

function renderOrdering(drafts: FormDrafts): string {
  if (!group || !group.winningProduct) {
    if (!group?.allowSuggestions && group?.phase === "Ordering") {
      return win("Väntar", '<p class="muted">Öl saknas — admin måste bekräfta.</p>');
    }
    return "";
  }

  const wp = group.winningProduct;
  const myLine = session
    ? group.orderLines.find((o) => o.memberId === session!.memberId)
    : null;
  const myQty =
    drafts.quantity !== undefined
      ? Number(drafts.quantity) || 0
      : (myLine?.quantity ?? 0);

  const min = group.minimumOrderQuantity;
  const req = group.requestedTotalQuantity;
  const adj = group.adjustedTotalQuantity;
  let orderNote = "Ingen har angett antal.";
  if (req > 0) {
    if (req < min) {
      orderNote = `Minimiantalet ${min} st är inte uppnått (${req} st önskade).`;
    } else if (group.isOrderFulfilled && req !== adj) {
      orderNote = `${req} önskade → <strong>${adj} st</strong> beställs (min ${min} st).`;
    } else if (group.isOrderFulfilled) {
      orderNote =
        min === 1
          ? `${adj} st totalt.`
          : `${group.orderMultiples}×${min} st = ${adj} st — minimiantalet uppfyllt.`;
    } else if (req !== adj) {
      orderNote = `${req} önskade → <strong>${adj} st</strong> justeras (min ${min} st).`;
    } else {
      const target = Math.ceil(req / min) * min;
      orderNote = `${target - req} st kvar till ${target} st (min ${min} st).`;
    }
  }

  const winner = win(
    "Vald öl",
    `<div class="product-item">
      ${productImage(wp)}
      <div class="product-info">
        <strong>${escapeHtml(wp.name)}</strong>
        <span>${formatPrice(wp.price)} / st · min ${wp.minimumOrderQuantity} st${wp.caseSize && wp.caseSize > wp.minimumOrderQuantity ? ` · leverantörskolli ${wp.caseSize} st` : ""}</span>
      </div>
    </div>`
  );

  const qty = session
    ? win(
        "Din beställning",
        `<form id="order-form">
          <div class="qty-row">
            <button type="button" class="qty-minus">−</button>
            <input type="number" name="quantity" min="0" max="999" value="${myQty}" />
            <button type="button" class="qty-plus">+</button>
          </div>
          <p class="hint">Summa: <strong id="line-total">${formatPrice(myQty * wp.price)}</strong></p>
          <button type="submit">Spara</button>
        </form>`
      )
    : "";

  const statusLine = !group.isOrderFulfilled && req > 0
    ? `<p class="status-line muted">Beställningen kan inte avslutas ännu.</p>`
    : `<p class="status-line">Justeras till <strong>${adj}</strong> st · ${formatPrice(group.totalCost)}</p>`;

  const overview = win(
    "Översikt",
    `<p class="kolli">${orderNote}</p>
     ${statusLine}
     <ul class="order-summary">
       ${group.orderLines
         .filter((o) => o.quantity > 0 || o.adjustedQuantity > 0)
         .map((o) => {
           const qtyLabel =
             o.quantity !== o.adjustedQuantity
               ? `${o.quantity} → ${o.adjustedQuantity} st`
               : `${o.adjustedQuantity} st`;
           const beer = o.chosenProductName ? `${escapeHtml(o.chosenProductName)} · ` : "";
           return `<li><span>${escapeHtml(o.displayName)}</span><span>${beer}${qtyLabel} · ${formatPrice(o.lineTotal)}</span></li>`;
         })
         .join("") || '<li class="muted">—</li>'}
     </ul>`
  );

  return winner + qty + overview;
}

function renderClosed(): string {
  if (!group) return "";
  const last = group.orderHistory[0];
  const beerLine = last
    ? `<p class="status-line">${escapeHtml(last.productName)} · ${formatPrice(last.productPrice)}/st</p>`
    : group.winningProduct
      ? `<p class="status-line">${escapeHtml(group.winningProduct.name)} · ${formatPrice(group.winningProduct.price)}/st</p>`
      : "";
  return win(
    "Sammanfattning",
    `${beerLine}
     <p>Totalt <strong>${group.adjustedTotalQuantity}</strong> st beställs · <strong>${formatPrice(group.totalCost)}</strong></p>
     <ul class="order-summary">
       ${group.orderLines
         .filter((o) => o.adjustedQuantity > 0)
         .map((o) => {
           const beer = o.chosenProductName ? `${escapeHtml(o.chosenProductName)} · ` : "";
           return `<li><span>${escapeHtml(o.displayName)}</span><span>${beer}${o.adjustedQuantity} st · ${formatPrice(o.lineTotal)}</span></li>`;
         })
         .join("")}
     </ul>
     <p class="footnote">Köp hos Systembolaget — inte privat vidareförsäljning.</p>`
  );
}

function renderMembers(): string {
  if (!group || group.members.length === 0) return "";
  const chips = group.members
    .map((m) => {
      const isYou = session?.memberId === m.id;
      return `<span class="chip${isYou ? " chip-current" : ""}">${escapeHtml(m.displayName)}</span>`;
    })
    .join("");
  return win(`Deltagare (${group.members.length})`, `<p class="member-chips">${chips}</p>`);
}

function formatRoundDate(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderOrderHistory(): string {
  if (!group) return "";

  const body =
    group.orderHistory.length === 0
      ? '<p class="muted">Ingen avslutad beställning ännu.</p>'
      : `<ul class="history-list">
          ${group.orderHistory
            .map((round) => {
              const lines = round.lines
                .filter((l) => l.adjustedQuantity > 0)
                .map((l) => {
                  const qty =
                    l.quantity !== l.adjustedQuantity
                      ? `${l.quantity} → ${l.adjustedQuantity} st`
                      : `${l.adjustedQuantity} st`;
                  return `<li><span>${escapeHtml(l.displayName)}</span><span>${qty} · ${formatPrice(l.lineTotal)}</span></li>`;
                })
                .join("");
              return `
            <li class="history-round">
              <p class="history-round-head">
                <strong>${escapeHtml(round.productName)}</strong>
                <span class="history-date">${formatRoundDate(round.completedAt)}</span>
              </p>
              <p class="history-beer">
                ${formatPrice(round.productPrice)}/st · ${round.adjustedTotalQuantity} st · ${formatPrice(round.totalCost)}
                ${round.productUrl ? ` · <a href="${escapeAttr(round.productUrl)}" target="_blank" rel="noopener" class="link-out">Systembolaget</a>` : ""}
              </p>
              <ul class="order-summary history-lines">${lines || '<li class="muted">—</li>'}</ul>
            </li>`;
            })
            .join("")}
        </ul>`;

  return win("Historik", body);
}

function renderProductList(
  products: GroupProduct[],
  opts: { showVotes?: boolean; allowDelete?: boolean } = {}
): string {
  const { showVotes = false, allowDelete = false } = opts;
  return `<ul class="product-list">
    ${products
      .map(
        (p) => `
      <li class="product-item">
        ${productImage(p)}
        <div class="product-info">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${formatPrice(p.price)}${p.addedByName ? ` · ${escapeHtml(p.addedByName)}` : ""}${showVotes ? ` · ${p.voteCount}` : ""}</span>
        </div>
        <div class="product-actions">
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="link-out">Öppna</a>
          ${allowDelete ? renderProductActions(p) : ""}
        </div>
      </li>`
      )
      .join("")}
  </ul>`;
}

function productImage(p: GroupProduct): string {
  if (p.imageUrl) {
    return `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeAttr(p.name)}" class="product-img" loading="lazy" />`;
  }
  return `<div class="product-img placeholder" role="img" aria-label="${escapeAttr(p.name)}"></div>`;
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  app.addEventListener("submit", async (e) => {
    const form = (e.target as HTMLElement).closest("form");
    if (!form || !app.contains(form)) return;
    e.preventDefault();

    if (form.id === "join-form") {
      if (!validateForm(form)) return;
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      const name = (new FormData(form).get("displayName") as string).trim();
      await withBusy(submit, "Går med…", async () => {
        try {
          const res = await joinGroup(groupId!, name);
          session = {
            memberId: res.memberId,
            sessionToken: res.sessionToken,
            displayName: res.displayName,
          };
          setSession(groupId!, session);
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte gå med");
        }
      });
      return;
    }

    if (form.id === "add-product-form") {
      if (!session) return;
      if (!validateForm(form)) return;
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      const fd = new FormData(form);
      const url = (fd.get("url") as string).trim();
      const name = (fd.get("name") as string)?.trim() || undefined;
      const priceRaw = fd.get("price") as string;
      const price = priceRaw ? Number(priceRaw) : undefined;
      await withBusy(submit, "Lägger till…", async () => {
        try {
          await addProduct(groupId!, session!.sessionToken, url, name, price);
          form.reset();
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte lägga till");
        }
      });
      return;
    }

    if (form.id === "order-form" && group?.winningProduct) {
      if (!session) return;
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      const qtyInput = form.querySelector('input[name="quantity"]') as HTMLInputElement;
      await withBusy(submit, "Sparar…", async () => {
        try {
          await setOrderLine(groupId!, session!.sessionToken, Number(qtyInput.value));
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte spara");
        }
      });
      return;
    }

  });

  app.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;

    const deleteBtn = target.closest(".delete-product-btn") as HTMLButtonElement | null;
    if (deleteBtn) {
      const productId = deleteBtn.dataset.productId!;
      await removeProduct(productId, deleteBtn);
      return;
    }

    const voteBtn = target.closest(".vote-btn") as HTMLButtonElement | null;
    if (voteBtn && session) {
      const productId = voteBtn.dataset.productId!;
      await withBusy(voteBtn, "…", async () => {
        try {
          await vote(groupId!, session!.sessionToken, productId);
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte rösta");
        }
      });
      return;
    }

    if (target.closest("#btn-save-swish")) {
      if (!adminKey) return;
      const input = document.getElementById("swish-note") as HTMLInputElement | null;
      const saveBtn = target.closest("#btn-save-swish") as HTMLButtonElement;
      if (!input) return;
      if (!validateField(input, true)) return;
      const normalized = normalizeSwishNumber(input.value);
      await withBusy(saveBtn, "…", async () => {
        try {
          await adminFetch(`/api/groups/${groupId}/admin/swish-note`, adminKey, {
            method: "PUT",
            body: JSON.stringify({ swishNote: normalized }),
          });
          if (group) group.swishNote = normalized;
          lastGroupSnapshot = "";
          await refresh();
          const btn = document.getElementById("btn-save-swish") as HTMLButtonElement | null;
          if (btn) {
            btn.textContent = "Sparat!";
            setTimeout(() => {
              btn.textContent = "Spara";
            }, 1500);
          }
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte spara nummer");
        }
      });
      return;
    }

    const revertBtn = target.closest(".phase-revert-btn") as HTMLButtonElement | null;
    if (revertBtn && adminKey) {
      const phase = revertBtn.dataset.revertPhase!;
      const btn = revertBtn;
      await withBusy(btn, "…", async () => {
        try {
          await adminFetch(`/api/groups/${groupId}/admin/revert-phase`, adminKey, {
            method: "POST",
            body: JSON.stringify({ phase }),
          });
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte gå tillbaka");
        }
      });
      return;
    }

    if (target.closest("#btn-start-voting")) {
      adminAction(`/api/groups/${groupId}/admin/start-voting`, "POST");
      return;
    }

    if (target.closest("#btn-confirm-beer")) {
      if (!adminKey) return;
      const picked = app.querySelector(
        'input[name="beer-pick"]:checked'
      ) as HTMLInputElement | null;
      if (!picked) {
        showError("Välj en öl att bekräfta.");
        return;
      }
      const btn = target.closest("button") as HTMLButtonElement;
      await withBusy(btn, "Bekräftar…", async () => {
        try {
          await adminFetch(`/api/groups/${groupId}/admin/confirm-beer`, adminKey, {
            method: "POST",
            body: JSON.stringify({ productId: picked.value }),
          });
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte bekräfta öl");
        }
      });
      return;
    }

    if (target.closest("#btn-finish-voting")) {
      adminAction(`/api/groups/${groupId}/admin/finish-voting`, "POST");
      return;
    }

    if (target.closest("#btn-close")) {
      adminAction(`/api/groups/${groupId}/admin/close`, "POST");
      return;
    }

    const copyBtn = target.closest("[data-copy]") as HTMLButtonElement | null;
    if (copyBtn) {
      const id = copyBtn.dataset.copy!;
      const input = document.getElementById(id) as HTMLInputElement;
      try {
        await navigator.clipboard.writeText(input.value);
        copyBtn.textContent = "Kopierat!";
        setTimeout(() => {
          copyBtn.textContent = "Kopiera";
        }, 1500);
      } catch {
        input.select();
        showError("Kunde inte kopiera — markera länken och kopiera manuellt.");
      }
      return;
    }

    const pickWinner = target.closest(".pick-winner") as HTMLButtonElement | null;
    if (pickWinner && adminKey) {
      const productId = pickWinner.dataset.productId!;
      await withBusy(pickWinner, "…", async () => {
        try {
          await adminFetch(`/api/groups/${groupId}/admin/pick-winner`, adminKey, {
            method: "POST",
            body: JSON.stringify({ productId }),
          });
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : "Kunde inte välja vinnare");
        }
      });
      return;
    }

    if (target.closest(".qty-minus") || target.closest(".qty-plus")) {
      const orderForm = target.closest("#order-form");
      if (!orderForm || !group?.winningProduct) return;
      const qtyInput = orderForm.querySelector('input[name="quantity"]') as HTMLInputElement;
      const lineTotal = document.getElementById("line-total");
      const price = group.winningProduct.price;
      if (target.closest(".qty-minus")) {
        qtyInput.value = String(Math.max(0, Number(qtyInput.value) - 1));
      } else {
        qtyInput.value = String(Number(qtyInput.value) + 1);
      }
      if (lineTotal) {
        lineTotal.textContent = formatPrice(Number(qtyInput.value) * price);
      }
    }
  });

  app.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "quantity" || !group?.winningProduct) return;
    const lineTotal = document.getElementById("line-total");
    if (lineTotal) {
      lineTotal.textContent = formatPrice(Number(target.value) * group.winningProduct.price);
    }
  });

  app.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (
      target instanceof HTMLInputElement &&
      target.name === "beer-pick"
    ) {
      const btn = document.getElementById("btn-confirm-beer") as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
    }
  });
}

async function adminAction(path: string, method: string) {
  if (!adminKey) return;
  try {
    await adminFetch(path, adminKey, { method });
    await refresh();
  } catch (err) {
    showError(err instanceof Error ? err.message : "Admin-åtgärden misslyckades");
  }
}

init();
