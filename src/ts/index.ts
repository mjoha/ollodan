import { createGroup, redeemTransferCode } from "./api.js";
import { buildGroupUrl, parseGroupIdFromUrl } from "./groupId.js";
import { setAdminKey, setSession } from "./storage.js";
import { validateForm, wireValidatedFields } from "./validate.js";

const form = document.getElementById("create-form") as HTMLFormElement;
const nameInput = document.getElementById("group-name") as HTMLInputElement;
const adminInput = document.getElementById("admin-name") as HTMLInputElement;
const allowSuggestionsInput = document.getElementById("allow-suggestions") as HTMLInputElement;
const isRepeatingInput = document.getElementById("is-repeating") as HTMLInputElement;
const errorEl = document.getElementById("create-error") as HTMLElement;
const submitBtn = document.getElementById("create-submit") as HTMLButtonElement;
const joinLink = document.getElementById("join-link") as HTMLAnchorElement;
const joinPanel = document.getElementById("join-panel") as HTMLElement;
const joinForm = document.getElementById("join-form") as HTMLFormElement;
const joinUrlInput = document.getElementById("join-url") as HTMLInputElement;
const joinErrorEl = document.getElementById("join-error") as HTMLElement;
const joinCancelBtn = document.getElementById("join-cancel") as HTMLButtonElement;
const transferLink = document.getElementById("transfer-link") as HTMLAnchorElement;
const transferPanel = document.getElementById("transfer-panel") as HTMLElement;
const transferForm = document.getElementById("transfer-form") as HTMLFormElement;
const transferCodeInput = document.getElementById("transfer-code") as HTMLInputElement;
const transferErrorEl = document.getElementById("transfer-error") as HTMLElement;
const transferCancelBtn = document.getElementById("transfer-cancel") as HTMLButtonElement;

wireValidatedFields(form);
wireValidatedFields(joinForm);
wireValidatedFields(transferForm);

let creating = false;
let redeeming = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (creating) return;
  if (!validateForm(form)) return;

  errorEl.hidden = true;

  const name = nameInput.value.trim();
  const adminName = adminInput.value.trim();

  creating = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Skapar…";

  try {
    const res = await createGroup(name, adminName, {
      allowSuggestions: allowSuggestionsInput.checked,
      isRepeating: isRepeatingInput.checked,
    });

    setSession(res.groupId, {
      memberId: res.memberId,
      sessionToken: res.sessionToken,
      displayName: res.displayName,
    });
    setAdminKey(res.groupId, res.adminSecret);

    window.location.href =
      window.location.origin + buildGroupUrl(res.groupId, res.adminSecret);
  } catch (err) {
    errorEl.textContent =
      err instanceof Error ? err.message : "Kunde inte skapa gruppen.";
    errorEl.hidden = false;
    creating = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Skapa";
  }
});

function showJoinPanel() {
  hideTransferPanel();
  joinPanel.hidden = false;
  joinErrorEl.hidden = true;
  joinLink.setAttribute("aria-expanded", "true");
  joinUrlInput.focus();
  joinPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hideJoinPanel() {
  joinPanel.hidden = true;
  joinLink.setAttribute("aria-expanded", "false");
  joinForm.reset();
  joinErrorEl.hidden = true;
}

function showTransferPanel() {
  hideJoinPanel();
  transferPanel.hidden = false;
  transferErrorEl.hidden = true;
  transferLink.setAttribute("aria-expanded", "true");
  transferCodeInput.focus();
  transferPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hideTransferPanel() {
  transferPanel.hidden = true;
  transferLink.setAttribute("aria-expanded", "false");
  transferForm.reset();
  transferErrorEl.hidden = true;
}

joinLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (joinPanel.hidden) showJoinPanel();
  else hideJoinPanel();
});

joinCancelBtn.addEventListener("click", hideJoinPanel);

transferLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (transferPanel.hidden) showTransferPanel();
  else hideTransferPanel();
});

transferCancelBtn.addEventListener("click", hideTransferPanel);

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validateForm(joinForm)) return;

  joinErrorEl.hidden = true;
  const url = joinUrlInput.value.trim();
  const id = parseGroupIdFromUrl(url);

  if (id) {
    window.location.href =
      window.location.origin + buildGroupUrl(id, extractKeyFromUrl(url));
    return;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin || parsed.hostname) {
      window.location.href = parsed.href;
      return;
    }
  } catch {
    /* fall through */
  }

  joinErrorEl.textContent =
    "Kunde inte läsa länken. Kontrollera att du klistrat in hela adressen.";
  joinErrorEl.hidden = false;
});

transferForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (redeeming) return;
  if (!validateForm(transferForm)) return;

  transferErrorEl.hidden = true;
  const raw = transferCodeInput.value.trim();
  if (!raw) return;

  const submit = transferForm.querySelector('button[type="submit"]') as HTMLButtonElement;
  redeeming = true;
  submit.disabled = true;
  submit.textContent = "Fortsätter…";

  try {
    const res = await redeemTransferCode(raw);
    setSession(res.groupId, {
      memberId: res.memberId,
      sessionToken: res.sessionToken,
      displayName: res.displayName,
    });
    window.location.href = window.location.origin + buildGroupUrl(res.groupId);
  } catch (err) {
    transferErrorEl.textContent =
      err instanceof Error ? err.message : "Ogiltig eller utgången kod.";
    transferErrorEl.hidden = false;
    redeeming = false;
    submit.disabled = false;
    submit.textContent = "Fortsätt";
  }
});

transferCodeInput.addEventListener("input", () => {
  const raw = transferCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length <= 3) {
    transferCodeInput.value = raw;
    return;
  }
  transferCodeInput.value = `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;
});

function extractKeyFromUrl(url: string): string | undefined {
  try {
    return new URL(url.trim(), window.location.origin).searchParams.get("key") ?? undefined;
  } catch {
    return undefined;
  }
}
