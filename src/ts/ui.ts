import { escapeHtml } from "./escape.js";

/** Classic window frame: title bar + body */
export function win(title: string, body: string, extraClass = ""): string {
  const cls = extraClass ? `win ${extraClass}` : "win";
  return `<section class="${cls}">
  <div class="title-bar"><span class="title-bar-text">${escapeHtml(title)}</span></div>
  <div class="win-body">${body}</div>
</section>`;
}
