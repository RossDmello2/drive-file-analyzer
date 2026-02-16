(function () {
  "use strict";

  var WEBHOOK_URL = "https://ben-unconflictive-many.ngrok-free.dev/webhook/drive-chatbot-api";

  var form = document.getElementById("analyzerForm");
  var driveFolderIdInput = document.getElementById("driveFolderId");
  var messageInput = document.getElementById("message");
  var filesInput = document.getElementById("files");
  var submitButton = document.getElementById("submitButton");
  var submitButtonText = document.getElementById("submitButtonText");
  var runAgainButton = document.getElementById("runAgainButton");
  var statusMessage = document.getElementById("statusMessage");

  var driveFolderIdError = document.getElementById("driveFolderIdError");
  var messageError = document.getElementById("messageError");

  var resultsSection = document.getElementById("resultsSection");
  var resultsContainer = document.getElementById("resultsContainer");
  var emptyState = document.getElementById("emptyState");

  var errorSection = document.getElementById("errorSection");
  var errorStatus = document.getElementById("errorStatus");
  var errorMessage = document.getElementById("errorMessage");
  var retryButton = document.getElementById("retryButton");

  // Session is created once per run and regenerated only by "Run again".
  var currentSessionId = generateSessionId();
  var lastRequestSnapshot = null;
  var isSubmitting = false;

  form.addEventListener("submit", handleSubmit);
  retryButton.addEventListener("click", handleRetry);
  runAgainButton.addEventListener("click", handleRunAgain);

  setStatus("Ready.");

  function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    clearFieldErrors();
    hideError();

    var prepared = prepareSubmissionFromForm();
    if (!prepared.valid) {
      focusFirstInvalid(prepared.invalidFields);
      return;
    }

    var snapshot = {
      driveFolderId: prepared.driveFolderId,
      message: prepared.message,
      sessionId: currentSessionId,
      files: prepared.files
    };

    lastRequestSnapshot = snapshot;
    sendRequest(snapshot);
  }

  function handleRetry() {
    if (isSubmitting || !lastRequestSnapshot) {
      return;
    }
    sendRequest(lastRequestSnapshot);
  }

  function handleRunAgain() {
    form.reset();
    clearFieldErrors();
    clearResults();
    hideError();
    hideRunAgain();

    lastRequestSnapshot = null;
    currentSessionId = generateSessionId();
    setStatus("Ready.");
  }

  function prepareSubmissionFromForm() {
    var invalidFields = [];
    var normalizedFolderId = normalizeDriveFolderId(driveFolderIdInput.value || "");
    var message = (messageInput.value || "").trim();
    var files = Array.from(filesInput.files || []);

    if (!normalizedFolderId) {
      setFieldError(driveFolderIdError, "Google Drive Folder is required.");
      invalidFields.push(driveFolderIdInput);
    }
    if (!message) {
      setFieldError(messageError, "Message is required.");
      invalidFields.push(messageInput);
    }

    return {
      valid: invalidFields.length === 0,
      invalidFields: invalidFields,
      driveFolderId: normalizedFolderId,
      message: message,
      files: files
    };
  }

  function normalizeDriveFolderId(rawInput) {
    var trimmed = String(rawInput || "").trim();
    if (!trimmed) {
      return "";
    }

    // Best-effort extraction from Drive links; fallback keeps raw trimmed input.
    var extracted = extractFolderId(trimmed);
    return extracted || trimmed;
  }

  function extractFolderId(input) {
    var folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) {
      return folderMatch[1];
    }

    var idParamMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
      return idParamMatch[1];
    }

    try {
      var parsed = new URL(input);
      if (!/drive\.google\.com$/i.test(parsed.hostname)) {
        return "";
      }

      var pathMatch = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (pathMatch && pathMatch[1]) {
        return pathMatch[1];
      }

      var idParam = parsed.searchParams.get("id");
      if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) {
        return idParam;
      }
    } catch (error) {
      return "";
    }

    return "";
  }

  async function sendRequest(snapshot) {
    setSubmitting(true);
    showRunAgain();
    clearResults();
    hideError();
    setStatus("Sending request...");

    try {
      var requestConfig = buildRequest(snapshot);
      var response = await fetch(WEBHOOK_URL, requestConfig);
      var parsed = await parseJsonResponse(response);

      if (!response.ok) {
        var serverMessage = extractErrorMessage(parsed, response.status);
        throw createDisplayError(serverMessage, response.status, response.statusText);
      }

      if (!isFlatObject(parsed)) {
        throw createDisplayError("Response JSON must be a flat key/value object.", response.status, response.statusText);
      }

      renderResults(parsed);
      setStatus("Request completed.");
    } catch (error) {
      renderError(normalizeError(error));
      setStatus("Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function buildRequest(snapshot) {
    if (snapshot.files && snapshot.files.length > 0) {
      // File uploads must be multipart/form-data via FormData.
      var formData = new FormData();
      formData.append("driveFolderId", snapshot.driveFolderId);
      formData.append("message", snapshot.message);
      formData.append("sessionId", snapshot.sessionId);

      snapshot.files.forEach(function (file) {
        formData.append("files", file);
      });

      return {
        method: "POST",
        body: formData
      };
    }

    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        driveFolderId: snapshot.driveFolderId,
        message: snapshot.message,
        sessionId: snapshot.sessionId
      })
    };
  }

  async function parseJsonResponse(response) {
    var rawText;
    try {
      rawText = await response.text();
    } catch (error) {
      throw createDisplayError("Unable to read response body.", response.status, response.statusText);
    }

    if (!rawText) {
      throw createDisplayError("Response body was empty and not valid JSON.", response.status, response.statusText);
    }

    try {
      return JSON.parse(rawText);
    } catch (error) {
      throw createDisplayError("Response was not valid JSON.", response.status, response.statusText);
    }
  }

  function isFlatObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) {
      var child = value[keys[i]];
      if (child !== null && typeof child === "object") {
        return false;
      }
    }
    return true;
  }

  function renderResults(data) {
    hideError();
    resultsContainer.innerHTML = "";
    resultsSection.classList.remove("hidden");

    var keys = Object.keys(data);
    if (keys.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    keys.forEach(function (key) {
      var value = stringifyValue(data[key]);
      var row = document.createElement("article");
      row.className = "result-row";

      var keyCell = document.createElement("div");
      keyCell.className = "result-key";
      keyCell.textContent = key;

      var valueCell = document.createElement("div");
      valueCell.className = "result-value";

      var valueText = document.createElement("pre");
      valueText.className = "value-text";
      valueText.textContent = value;

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", function () {
        copyValue(copyBtn, value);
      });

      valueCell.appendChild(valueText);
      valueCell.appendChild(copyBtn);
      row.appendChild(keyCell);
      row.appendChild(valueCell);

      resultsContainer.appendChild(row);
    });
  }

  function clearResults() {
    resultsContainer.innerHTML = "";
    emptyState.classList.add("hidden");
    resultsSection.classList.add("hidden");
  }

  function renderError(error) {
    clearResults();
    errorStatus.textContent = error.status ? "HTTP " + error.status + (error.statusText ? " " + error.statusText : "") : "Request error";
    errorMessage.textContent = error.message || "An unexpected error occurred.";
    errorSection.classList.remove("hidden");
    retryButton.disabled = !lastRequestSnapshot;
  }

  function hideError() {
    errorSection.classList.add("hidden");
    errorStatus.textContent = "";
    errorMessage.textContent = "";
  }

  function showRunAgain() {
    runAgainButton.classList.remove("hidden");
  }

  function hideRunAgain() {
    runAgainButton.classList.add("hidden");
  }

  function setSubmitting(submitting) {
    isSubmitting = submitting;
    submitButton.disabled = submitting;
    retryButton.disabled = submitting || !lastRequestSnapshot;
    submitButtonText.textContent = submitting ? "Sending..." : "Send Request";
  }

  function setStatus(message) {
    statusMessage.textContent = message;
  }

  function setFieldError(element, message) {
    element.textContent = message;
    element.classList.remove("hidden");
  }

  function clearFieldErrors() {
    driveFolderIdError.textContent = "";
    messageError.textContent = "";
    driveFolderIdError.classList.add("hidden");
    messageError.classList.add("hidden");
  }

  function focusFirstInvalid(invalidFields) {
    if (invalidFields && invalidFields.length > 0 && typeof invalidFields[0].focus === "function") {
      invalidFields[0].focus();
    }
  }

  function createDisplayError(message, status, statusText) {
    return {
      message: message,
      status: status,
      statusText: statusText
    };
  }

  function normalizeError(error) {
    if (error && typeof error === "object" && "message" in error) {
      return {
        message: String(error.message || "An unexpected error occurred."),
        status: typeof error.status === "number" ? error.status : null,
        statusText: typeof error.statusText === "string" ? error.statusText : ""
      };
    }

    return {
      message: "Network request failed. Check your connection and try again.",
      status: null,
      statusText: ""
    };
  }

  function extractErrorMessage(parsedBody, status) {
    if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
      if (typeof parsedBody.error === "string" && parsedBody.error.trim()) {
        return parsedBody.error.trim();
      }
      if (typeof parsedBody.message === "string" && parsedBody.message.trim()) {
        return parsedBody.message.trim();
      }
    }

    return "Request failed with status " + status + ".";
  }

  function stringifyValue(value) {
    if (value === null) {
      return "null";
    }
    return typeof value === "string" ? value : String(value);
  }

  async function copyValue(button, value) {
    var copied = false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (error) {
        copied = false;
      }
    }

    if (!copied) {
      copied = legacyCopy(value);
    }

    var original = button.textContent;
    button.textContent = copied ? "Copied" : "Copy failed";
    button.disabled = true;

    window.setTimeout(function () {
      button.textContent = original;
      button.disabled = false;
    }, 1200);
  }

  function legacyCopy(value) {
    var temp = document.createElement("textarea");
    temp.value = value;
    temp.setAttribute("readonly", "");
    temp.style.position = "absolute";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);
    temp.select();

    var success = false;
    try {
      success = document.execCommand("copy");
    } catch (error) {
      success = false;
    }

    document.body.removeChild(temp);
    return success;
  }

  function generateSessionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "sess-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }
})();
