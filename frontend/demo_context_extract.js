function normalizeValue(value) {
    if (typeof value !== "string") {
      return value;
    }
  
    const trimmed = value.trim();
  
    if (trimmed === "") {
      return "";
    }
  
    if (trimmed === "true") {
      return true;
    }
  
    if (trimmed === "false") {
      return false;
    }
  
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber) && trimmed !== "") {
      return asNumber;
    }
  
    return trimmed;
  }
  
  function readFieldValue(field) {
    if (!field) {
      return null;
    }
  
    if (field.type === "checkbox") {
      return field.checked;
    }
  
    if (field.type === "radio") {
      return field.checked ? normalizeValue(field.value) : null;
    }
  
    if (field.tagName === "SELECT" && field.multiple) {
      return Array.from(field.selectedOptions, (option) =>
        normalizeValue(option.value)
      );
    }
  
    return normalizeValue(field.value);
  }
  
  function getVisiblePageText() {
    const root = document.body;
    if (!root) {
      return "";
    }
  
    return root.innerText.replace(/\s+/g, " ").trim();
  }
  
  function getPageContext() {
    return {
      title: document.title || "",
      url: window.location.href,
      path: window.location.pathname,
      pageText: getVisiblePageText(),
    };
  }
  
  export function extractFormData(formSelector) {
    const form =
      typeof formSelector === "string"
        ? document.querySelector(formSelector)
        : formSelector;
  
    if (!form) {
      throw new Error("Form not found for data extraction.");
    }
  
    const payload = {};
    const fields = form.querySelectorAll("input, textarea, select");
  
    fields.forEach((field) => {
      const key = field.name || field.id;
      if (!key || field.disabled) {
        return;
      }
  
      const value = readFieldValue(field);
      if (value === null) {
        return;
      }
  
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        const currentValue = payload[key];
        payload[key] = Array.isArray(currentValue)
          ? [...currentValue, value]
          : [currentValue, value];
        return;
      }
  
      payload[key] = value;
    });
  
    return {
      pageContext: getPageContext(),
      formData: payload,
    };
  }
  
  export async function sendFormData({
    formSelector,
    endpoint,
    method = "POST",
    headers = {},
  }) {
    const payload = extractFormData(formSelector);
  
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
    });
  
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
  
    return response.json();
  }
  