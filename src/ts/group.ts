import {
  addProduct,
  adminFetch,
  getGroup,
  joinGroup,
  setOrderLine,
  vote,
  type GroupData,
  type GroupProduct,
} from "./api.js";
import { escapeHtml } from "./escape.js";
import { buildGroupUrl, parseGroupIdFromLocation } from "./groupId.js";
import {
  getAdminKey,
  getSession,
  setAdminKey,
  setSession,
  type MemberSession,
} from "./storage.js";
import { win } from "./ui.js";
import { wireRequiredFields } from "./validate.js";
import { escapeAttr } from "./escape.js";

const PHASES_SUGGESTIONS = [
  { key: "Collecting", label: "1. Förslag" },
  { key: "Voting", label: "2. Rösta" },
  { key: "Ordering", label: "3. Antal" },
  { key: "Closed", label: "4. Beställ" },
] as const;

const PHASES_ADMIN_PICKS = [
  { key: "Collecting", label: "1. Öl" },
  { key: "Ordering", label: "2. Antal" },
  { key: "Closed", label: "3. Beställ" },
] as const;

function groupPhases(g: GroupData) {
  return g.allowSuggestions ? PHASES_SUGGESTIONS : PHASES_ADMIN_PICKS;
}

function isGroupAdmin(): boolean {
  return !!session && !!group && session.memberId === group.adminMemberId;
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
}

let pendingDrafts: FormDrafts = {};

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

  return d;
}

function showError(msg: string) {
  errorBanner.textContent = msg;
  errorBanner.hidden = false;
  setTimeout(() => {
    errorBanner.hidden = true;
  }, 5000);
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

  await refresh();
  pollTimer = window.setInterval(refresh, 4000);
}

async function refresh() {
  try {
    const data = await getGroup(groupId!);
    const snapshot = JSON.stringify(data);
    if (snapshot === lastGroupSnapshot) return;

    pendingDrafts = captureDrafts();
    lastGroupSnapshot = snapshot;
    group = data;
    render();
  } catch (err) {
    app.innerHTML = win(
      "Fel",
      `<p class="error">${escapeHtml(err instanceof Error ? err.message : "Fel vid laddning")}</p>`
    );
  }
}

function render() {
  if (!group) return;

  const drafts = pendingDrafts;
  pendingDrafts = {};

  let html = `
    ${win(
      "Grupp",
      `<div class="inset-panel readonly-field">${escapeHtml(group.name)}</div>`
    )}
  `;

  if (adminKey) {
    html += renderAdminPanel();
  }

  html += renderPhaseWindow(group);

  if (!session) {
    html += renderJoinForm(drafts);
  }

  switch (group.phase) {
    case "Collecting":
      html += renderCollecting(drafts);
      break;
    case "Voting":
      html += renderVoting();
      break;
    case "Ordering":
      html += renderOrdering(drafts);
      break;
    case "Closed":
      html += renderClosed();
      break;
  }

  html += renderMembers();

  app.innerHTML = html;
  bindEvents();
  wireRequiredFields(app);
}

function renderPhaseWindow(g: GroupData): string {
  const items = groupPhases(g)
    .map(
      (p) =>
        `<li class="phase-step${p.key === g.phase ? " phase-step-current" : ""}">${p.label}</li>`
    )
    .join("");

  return win("Fas", `<ul class="phase-steps">${items}</ul>`);
}

function renderJoinForm(drafts: FormDrafts): string {
  const value = drafts.displayName ?? "";
  return win(
    "Gå med",
    `<form id="join-form">
      <div class="field">
        <label class="field-label" for="display-name">Namn</label>
        <input id="display-name" name="displayName" type="text" required maxlength="50" placeholder="t.ex. Erik" value="${escapeAttr(value)}" data-required-msg="Ange ditt namn." />
      </div>
      <button type="submit" class="primary">OK</button>
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
      <label class="field-label">Admin-länk (spara)</label>
      <div class="link-row">
        <input type="text" readonly value="${escapeAttr(adminUrl)}" id="admin-url" />
        <button type="button" data-copy="admin-url">Kopiera</button>
      </div>
    </div>`;
}

function renderAdminPanel(): string {
  if (!group) return "";

  const tieBreak =
    group.needsTieBreak && group.phase === "Voting"
      ? `
    <div class="alert">
      <p class="status-line">Oavgjort</p>
      <div class="tie-products">
        ${group.products
          .filter((p) => p.voteCount === Math.max(...group!.products.map((x) => x.voteCount)))
          .map(
            (p) =>
              `<button type="button" class="pick-winner" data-product-id="${p.id}">${escapeHtml(p.name)} (${p.voteCount})</button>`
          )
          .join("")}
      </div>
    </div>`
      : "";

  let actions = "";
  if (group.phase === "Collecting" && group.allowSuggestions) {
    actions = `<button type="button" id="btn-start-voting" class="primary">Starta röstning</button>`;
  } else if (group.phase === "Voting") {
    actions = `<button type="button" id="btn-finish-voting" class="primary">Avsluta röstning</button>`;
  } else if (group.phase === "Ordering") {
    const closeLabel = group.isRepeating
      ? "Bekräfta beställning och starta om"
      : "Stäng order";
    actions = `<button type="button" id="btn-close" class="primary">${closeLabel}</button>`;
  }

  return win(
    "Administration",
    `${renderAdminLinks()}
     ${tieBreak}
     <div class="admin-actions btn-row">${actions}</div>`,
    "admin"
  );
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
         <form id="add-product-form">
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
      : renderProductList(group.products, false);

  return `${addForm}${win(`Förslag (${group.products.length})`, list)}`;
}

function renderWaitingForAdminBeer(): string {
  if (!group) return "";
  const preview =
    group.products.length === 0
      ? '<p class="muted">Admin lägger in öl snart.</p>'
      : `<p class="hint">Admin bekräftar öl innan ni kan ange antal.</p>${renderProductList(group.products, false)}`;
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
            </li>`;
            })
            .join("")}
        </ul>`;

  return win(
    "Beställningsöl",
    `<p class="hint">1. Klistra in systembolaget.se-länk · 2. Lägg till · 3. Bekräfta öl</p>
     <form id="add-product-form">
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
    if (req !== adj) {
      orderNote = `${req} önskade → <strong>${adj} st</strong> beställs (min ${min} st).`;
    } else if (group.isOrderFulfilled) {
      orderNote =
        min === 1
          ? `${adj} st totalt.`
          : `${group.orderMultiples}×${min} st = ${adj} st — ordern uppfyller minimiantalet.`;
    } else {
      orderNote = `${adj} st — ${group.remainderUntilNextMultiple} st till nästa minimum (${min} st).`;
    }
  }

  const kolliNote =
    req > 0 && min > 1
      ? group.remainderUntilRequestedTarget === 0
        ? `Era önskemål (${req} st) når ${group.nextRequestedTarget} st.`
        : `${group.remainderUntilRequestedTarget} st till nästa kolli (${group.nextRequestedTarget} st).`
      : "";

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

  const overview = win(
    "Översikt",
    `<p class="kolli">${orderNote}</p>
     ${kolliNote ? `<p class="kolli kolli-secondary">${kolliNote}</p>` : ""}
     <p class="status-line">Beställs <strong>${adj}</strong> st · ${formatPrice(group.totalCost)}</p>
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
  const beerLine = group.winningProduct
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

function renderProductList(products: GroupProduct[], showVotes: boolean): string {
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
        <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="link-out">Öppna</a>
      </li>`
      )
      .join("")}
  </ul>`;
}

function productImage(p: GroupProduct): string {
  if (p.imageUrl) {
    return `<img src="${escapeHtml(p.imageUrl)}" alt="" class="product-img" loading="lazy" />`;
  }
  return `<div class="product-img placeholder" aria-hidden="true"></div>`;
}

function bindEvents() {
  const joinForm = document.getElementById("join-form") as HTMLFormElement | null;
  joinForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (new FormData(joinForm).get("displayName") as string).trim();
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

  const addForm = document.getElementById("add-product-form") as HTMLFormElement | null;
  addForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!session) return;
    const fd = new FormData(addForm);
    const url = (fd.get("url") as string).trim();
    const name = (fd.get("name") as string)?.trim() || undefined;
    const priceRaw = fd.get("price") as string;
    const price = priceRaw ? Number(priceRaw) : undefined;
    try {
      await addProduct(groupId!, session.sessionToken, url, name, price);
      addForm.reset();
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Kunde inte lägga till");
    }
  });

  document.querySelectorAll(".vote-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!session) return;
      const productId = (btn as HTMLElement).dataset.productId!;
      try {
        await vote(groupId!, session.sessionToken, productId);
        await refresh();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Kunde inte rösta");
      }
    });
  });

  const orderForm = document.getElementById("order-form") as HTMLFormElement | null;
  if (orderForm && group?.winningProduct) {
    const qtyInput = orderForm.querySelector('input[name="quantity"]') as HTMLInputElement;
    const lineTotal = document.getElementById("line-total");
    const price = group.winningProduct.price;

    const updateTotal = () => {
      if (lineTotal) lineTotal.textContent = formatPrice(Number(qtyInput.value) * price);
    };

    orderForm.querySelector(".qty-minus")?.addEventListener("click", () => {
      qtyInput.value = String(Math.max(0, Number(qtyInput.value) - 1));
      updateTotal();
    });
    orderForm.querySelector(".qty-plus")?.addEventListener("click", () => {
      qtyInput.value = String(Number(qtyInput.value) + 1);
      updateTotal();
    });
    qtyInput.addEventListener("input", updateTotal);

    orderForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!session) return;
      try {
        await setOrderLine(groupId!, session.sessionToken, Number(qtyInput.value));
        await refresh();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Kunde inte spara");
      }
    });
  }

  document.getElementById("btn-start-voting")?.addEventListener("click", () =>
    adminAction(`/api/groups/${groupId}/admin/start-voting`, "POST")
  );
  document.getElementById("btn-confirm-beer")?.addEventListener("click", async () => {
    if (!adminKey) return;
    const picked = document.querySelector(
      'input[name="beer-pick"]:checked'
    ) as HTMLInputElement | null;
    if (!picked) {
      showError("Välj en öl att bekräfta.");
      return;
    }
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

  document.querySelectorAll('input[name="beer-pick"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const btn = document.getElementById("btn-confirm-beer") as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
    });
  });
  document.getElementById("btn-finish-voting")?.addEventListener("click", () =>
    adminAction(`/api/groups/${groupId}/admin/finish-voting`, "POST")
  );
  document.getElementById("btn-close")?.addEventListener("click", () =>
    adminAction(`/api/groups/${groupId}/admin/close`, "POST")
  );
  app.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.copy!;
      const input = document.getElementById(id) as HTMLInputElement;
      navigator.clipboard.writeText(input.value);
      (btn as HTMLButtonElement).textContent = "OK";
      setTimeout(() => {
        (btn as HTMLButtonElement).textContent = "Kopiera";
      }, 1500);
    });
  });

  document.querySelectorAll(".pick-winner").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!adminKey) return;
      const productId = (btn as HTMLElement).dataset.productId!;
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
