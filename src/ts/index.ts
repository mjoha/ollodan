import { createGroup } from "./api.js";
import { buildGroupUrl, parseGroupIdFromUrl } from "./groupId.js";
import { setAdminKey, setSession } from "./storage.js";
import { wireRequiredFields } from "./validate.js";

const form = document.getElementById("create-form") as HTMLFormElement;
const nameInput = document.getElementById("group-name") as HTMLInputElement;
const adminInput = document.getElementById("admin-name") as HTMLInputElement;
const allowSuggestionsInput = document.getElementById("allow-suggestions") as HTMLInputElement;
const isRepeatingInput = document.getElementById("is-repeating") as HTMLInputElement;
const errorEl = document.getElementById("create-error") as HTMLElement;
const submitBtn = document.getElementById("create-submit") as HTMLButtonElement;
const joinLink = document.getElementById("join-link") as HTMLAnchorElement;

wireRequiredFields(form);

let creating = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (creating) return;
  if (!form.reportValidity()) return;

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

joinLink.addEventListener("click", (e) => {
  e.preventDefault();
  const url = prompt("Klistra in grupplänken:");
  if (!url) return;
  const id = parseGroupIdFromUrl(url);
  if (id) {
    window.location.href =
      window.location.origin + buildGroupUrl(id, extractKeyFromUrl(url));
  } else {
    window.location.href = url;
  }
});

function extractKeyFromUrl(url: string): string | undefined {
  try {
    return new URL(url.trim(), window.location.origin).searchParams.get("key") ?? undefined;
  } catch {
    return undefined;
  }
}
