/** Inline field validation styled for Win31 (no native browser bubbles). */

const DEFAULT_REQUIRED = "Fyll i det här fältet.";

function fieldErrorEl(el: HTMLElement): HTMLElement | null {
  const id = el.id || el.name;
  if (!id) return null;
  return (
    el.closest(".field")?.querySelector<HTMLElement>(`[data-field-error-for="${id}"]`) ??
    null
  );
}

function ensureFieldError(el: HTMLInputElement | HTMLTextAreaElement): void {
  const id = el.id || el.name;
  if (!id || fieldErrorEl(el)) return;

  const err = document.createElement("p");
  err.className = "field-error";
  err.dataset.fieldErrorFor = id;
  err.hidden = true;

  const field = el.closest(".field");
  if (field) field.appendChild(err);
  else el.insertAdjacentElement("afterend", err);
}

export function setFieldError(
  el: HTMLInputElement | HTMLTextAreaElement,
  msg: string
): void {
  el.classList.add("is-invalid");
  const err = fieldErrorEl(el);
  if (err) {
    err.textContent = msg;
    err.hidden = false;
  }
}

export function clearFieldError(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.classList.remove("is-invalid");
  const err = fieldErrorEl(el);
  if (err) err.hidden = true;
}

export function formatSwishDigits(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 8) return `${d.slice(0, 3)}-${d.slice(3, 6)} ${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

export function swishDigitsOnly(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("46") && digits.length >= 11) {
    digits = `0${digits.slice(2, 12)}`;
  }
  if (digits.length === 9 && digits.startsWith("7")) {
    digits = `0${digits}`;
  }
  return digits.slice(0, 10);
}

/** Store as 10-digit Swedish mobile (07XXXXXXXX). */
export function normalizeSwishNumber(raw: string): string | null {
  const digits = swishDigitsOnly(raw);
  return digits.length > 0 ? digits : null;
}

export function isValidSwishNumber(value: string): boolean {
  const digits = swishDigitsOnly(value);
  return digits.length === 0 || (digits.length === 10 && digits.startsWith("07"));
}

function wireSwishInput(el: HTMLInputElement): void {
  el.addEventListener("input", () => {
    const digits = swishDigitsOnly(el.value);
    const formatted = formatSwishDigits(digits);
    if (el.value !== formatted) el.value = formatted;
    validateField(el, false);
  });
}

export function validateField(
  el: HTMLInputElement | HTMLTextAreaElement,
  showError: boolean
): boolean {
  const value = el.value.trim();
  const required = el.hasAttribute("required");
  const msgRequired = el.dataset.requiredMsg ?? DEFAULT_REQUIRED;
  const msgValidate = el.dataset.validateMsg ?? msgRequired;

  if (required && !value) {
    if (showError) setFieldError(el, msgRequired);
    return false;
  }

  if (!value) {
    if (showError) clearFieldError(el);
    return true;
  }

  if (el.dataset.validate === "swish") {
    if (!isValidSwishNumber(value)) {
      if (showError) setFieldError(el, msgValidate);
      return false;
    }
    if (showError) clearFieldError(el);
    return true;
  }

  if (el.type === "url") {
    try {
      new URL(value);
    } catch {
      if (showError) setFieldError(el, msgValidate);
      return false;
    }
  }

  if (el.pattern) {
    if (!new RegExp(el.pattern).test(value)) {
      if (showError) setFieldError(el, msgValidate);
      return false;
    }
  }

  if (showError) clearFieldError(el);
  return true;
}

export function validateForm(form: HTMLFormElement): boolean {
  let ok = true;
  form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "[data-required-msg], [data-validate-msg]"
  ).forEach((el) => {
    if (!validateField(el, true)) ok = false;
  });
  return ok;
}

export function wireValidatedFields(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "[data-required-msg], [data-validate-msg]"
  ).forEach((el) => {
    ensureFieldError(el);
    if (el.dataset.validate === "swish") wireSwishInput(el);
    el.addEventListener("blur", () => validateField(el, true));
  });
}

/** @deprecated Use wireValidatedFields */
export function wireRequiredFields(root: ParentNode = document): void {
  wireValidatedFields(root);
}
