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
import { parseGroupIdFromLocation } from "./groupId.js";
import {
  getAdminKey,
  getSession,
  setAdminKey,
  setSession,
  type MemberSession,
} from "./storage.js";
import { win } from "./ui.js";

const params = new URLSearchParams(window.location.search);
const groupId = parseGroupIdFromLocation();
const adminKeyFromUrl = params.get("key");

const app = document.getElementById("app")!;
const errorBanner = document.getElementById("error-banner") as HTMLElement;

let session: MemberSession | null = null;
let adminKey: string | null = null;
let pollTimer: number | null = null;
let group: GroupData | null = null;

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
       <p><a href="index.html" class="button primary">Till startsidan</a></p>`
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
    group = await getGroup(groupId!);
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

  const phaseLabel: Record<string, string> = {
    Collecting: "Samla förslag",
    Voting: "Röstning",
    Ordering: "Beställ antal",
    Closed: "Avslutad",
  };

  let html = `
    <header class="group-header">
      <div class="title-bar">
        <span class="title-bar-text">${escapeHtml(group.name)}</span>
      </div>
      <div class="group-header-meta">
        <span>Fas</span>
        <span class="phase-badge">${phaseLabel[group.phase] ?? group.phase}</span>
      </div>
    </header>
  `;

  if (!session) {
    html += renderJoinForm();
  } else {
    html += `<p class="you">Användare: <strong>${escapeHtml(session.displayName)}</strong></p>`;
  }

  if (adminKey) {
    html += renderAdminPanel();
  }

  switch (group.phase) {
    case "Collecting":
      html += renderCollecting();
      break;
    case "Voting":
      html += renderVoting();
      break;
    case "Ordering":
      html += renderOrdering();
      break;
    case "Closed":
      html += renderClosed();
      break;
  }

  html += renderMembers();

  app.innerHTML = html;
  bindEvents();
}

function renderJoinForm(): string {
  return win(
    "Gå med",
    `<form id="join-form">
      <div class="field">
        <label class="field-label" for="display-name">Namn</label>
        <input id="display-name" name="displayName" type="text" required maxlength="50" placeholder="t.ex. Erik" />
      </div>
      <button type="submit" class="primary">OK</button>
    </form>`
  );
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
  if (group.phase === "Collecting") {
    actions = `<button type="button" id="btn-start-voting" class="primary">Starta röstning</button>`;
  } else if (group.phase === "Voting") {
    actions = `<button type="button" id="btn-finish-voting" class="primary">Avsluta röstning</button>`;
  } else if (group.phase === "Ordering") {
    actions = `<button type="button" id="btn-close" class="primary">Stäng order</button>`;
  }

  return win(
    "Administration",
    `${tieBreak}
     <div class="admin-actions btn-row">${actions}</div>
     <div class="field">
       <label class="field-label" for="swish-note">Betalningsinfo</label>
       <textarea id="swish-note" rows="2" placeholder="Valfritt">${escapeHtml(group.swishNote ?? "")}</textarea>
     </div>
     <button type="button" id="btn-save-swish">Spara</button>`,
    "admin"
  );
}

function renderCollecting(): string {
  if (!group) return "";

  const addForm = session
    ? win(
        "Lägg till öl",
        `<p class="hint">Klistra in systembolaget.se-länk</p>
         <form id="add-product-form">
           <input type="url" name="url" required placeholder="https://www.systembolaget.se/produkt/..." />
           <details class="manual-fallback">
             <summary>Manuell inmatning</summary>
             <input type="text" name="name" placeholder="Namn" />
             <input type="number" name="price" placeholder="Pris (kr)" min="0" step="1" />
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

function renderOrdering(): string {
  if (!group || !group.winningProduct) return "";

  const wp = group.winningProduct;
  const myLine = session
    ? group.orderLines.find((o) => o.memberId === session!.memberId)
    : null;
  const myQty = myLine?.quantity ?? 0;

  const kolliNote =
    group.totalQuantity === 0
      ? "Ingen har angett antal."
      : group.remainderUntilNextCase === 0
        ? `${group.casesOf24} kolli (24 st).`
        : `${group.totalQuantity} st — ${group.remainderUntilNextCase} st till nästa kolli.`;

  const winner = win(
    "Vald öl",
    `<div class="product-item">
      ${productImage(wp)}
      <div class="product-info">
        <strong>${escapeHtml(wp.name)}</strong>
        <span>${formatPrice(wp.price)} / st</span>
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
    `<p class="kolli">${kolliNote}</p>
     <p class="status-line">Totalt ${group.totalQuantity} st · ${formatPrice(group.totalCost)}</p>
     <ul class="order-summary">
       ${group.orderLines
         .filter((o) => o.quantity > 0)
         .map(
           (o) =>
             `<li><span>${escapeHtml(o.displayName)}</span><span>${o.quantity} st · ${formatPrice(o.lineTotal)}</span></li>`
         )
         .join("") || '<li class="muted">—</li>'}
     </ul>
     ${group.swishNote ? `<p class="swish-note">${escapeHtml(group.swishNote)}</p>` : ""}`
  );

  return winner + qty + overview;
}

function renderClosed(): string {
  if (!group) return "";
  return win(
    "Sammanfattning",
    `${group.winningProduct ? `<p class="status-line">${escapeHtml(group.winningProduct.name)} · ${formatPrice(group.winningProduct.price)}/st</p>` : ""}
     <p>Totalt <strong>${group.totalQuantity}</strong> st · <strong>${formatPrice(group.totalCost)}</strong></p>
     <ul class="order-summary">
       ${group.orderLines
         .filter((o) => o.quantity > 0)
         .map(
           (o) =>
             `<li><span>${escapeHtml(o.displayName)}</span><span>${o.quantity} st · ${formatPrice(o.lineTotal)}</span></li>`
         )
         .join("")}
     </ul>
     ${group.swishNote ? `<p class="swish-note">${escapeHtml(group.swishNote)}</p>` : ""}
     <p class="footnote">Köp hos Systembolaget — inte privat vidareförsäljning.</p>`
  );
}

function renderMembers(): string {
  if (!group || group.members.length === 0) return "";
  return win(
    `Deltagare (${group.members.length})`,
    `<p class="member-chips">${group.members.map((m) => `<span class="chip">${escapeHtml(m.displayName)}</span>`).join("")}</p>`
  );
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
  document.getElementById("btn-finish-voting")?.addEventListener("click", () =>
    adminAction(`/api/groups/${groupId}/admin/finish-voting`, "POST")
  );
  document.getElementById("btn-close")?.addEventListener("click", () =>
    adminAction(`/api/groups/${groupId}/admin/close`, "POST")
  );
  document.getElementById("btn-save-swish")?.addEventListener("click", async () => {
    if (!adminKey) return;
    const note = (document.getElementById("swish-note") as HTMLTextAreaElement).value;
    try {
      await adminFetch(`/api/groups/${groupId}/admin/swish-note`, adminKey, {
        method: "PUT",
        body: JSON.stringify({ swishNote: note || null }),
      });
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Kunde inte spara");
    }
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
