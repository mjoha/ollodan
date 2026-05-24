/** Swedish HTML5 validation + Win31 field styling via :user-invalid */
export function wireRequiredFields(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "[data-required-msg]"
  ).forEach((el) => {
    const msg = el.dataset.requiredMsg ?? "Fyll i det här fältet.";
    el.addEventListener("invalid", () => {
      el.setCustomValidity(msg);
    });
    el.addEventListener("input", () => {
      el.setCustomValidity("");
    });
  });
}
