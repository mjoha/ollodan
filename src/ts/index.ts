import { createGroup } from "./api.js";
import { buildGroupUrl, parseGroupIdFromUrl } from "./groupId.js";

const form = document.getElementById("create-form") as HTMLFormElement;
const nameInput = document.getElementById("group-name") as HTMLInputElement;
const resultEl = document.getElementById("create-result") as HTMLElement;
const errorEl = document.getElementById("create-error") as HTMLElement;
const joinLink = document.getElementById("join-link") as HTMLAnchorElement;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  resultEl.hidden = true;

  const name = nameInput.value.trim();
  if (!name) {
    errorEl.textContent = "Ange ett gruppnamn.";
    errorEl.hidden = false;
    return;
  }

  const btn = form.querySelector("button[type=submit]") as HTMLButtonElement;
  btn.disabled = true;

  try {
    const res = await createGroup(name);
    const participantUrl =
      window.location.origin + buildGroupUrl(res.groupId);
    const adminUrl =
      window.location.origin + buildGroupUrl(res.groupId, res.adminSecret);

    resultEl.innerHTML = `
      <p class="success">Gruppen <strong>${escapeHtml(name)}</strong> är skapad!</p>
      <label>Dela med kompisarna</label>
      <div class="link-row">
        <input type="text" readonly value="${escapeAttr(participantUrl)}" id="participant-url" />
        <button type="button" class="secondary" data-copy="participant-url">Kopiera</button>
      </div>
      <label>Admin-länk (spara denna!)</label>
      <div class="link-row">
        <input type="text" readonly value="${escapeAttr(adminUrl)}" id="admin-url" />
        <button type="button" class="secondary" data-copy="admin-url">Kopiera</button>
      </div>
      <p><a href="${escapeAttr(participantUrl)}">Gå till gruppen →</a></p>
    `;
    resultEl.hidden = false;

    resultEl.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.copy!;
        const input = document.getElementById(id) as HTMLInputElement;
        navigator.clipboard.writeText(input.value);
        (btn as HTMLButtonElement).textContent = "Kopierad!";
        setTimeout(() => {
          (btn as HTMLButtonElement).textContent = "Kopiera";
        }, 1500);
      });
    });
  } catch (err) {
    errorEl.textContent =
      err instanceof Error ? err.message : "Kunde inte skapa gruppen.";
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
