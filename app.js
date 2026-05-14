const state = {
  amcRows: [],
  taskEntries: [],
  clientMap: new Map(),
  reports: [],
  selectedClient: null,
  clientModalMonth: "",
  searchQuery: "",
  reportMonth: "",
  alertRecipientEmail: "",
  alertWindowDays: 5,
  sourceFiles: {
    amc: null,
    task: null,
  },
  sourceFileHandles: {
    amc: null,
    task: null,
  },
  sourceFileFingerprints: {
    amc: "",
    task: "",
  },
  driveConfig: {
    amcDriveLink: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJkPXGrcvOg6XMccE6rBvLLcgAF5ZuIbWOENrThdyltPfKuGWdaVyqHhEdsJOWfE6c1HLWWnCC8f__/pub?output=xlsx",
    amcFileId: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJkPXGrcvOg6XMccE6rBvLLcgAF5ZuIbWOENrThdyltPfKuGWdaVyqHhEdsJOWfE6c1HLWWnCC8f__/pub?output=xlsx",
    amcSourceType: "sheet",
    taskDriveLink: "https://docs.google.com/document/d/e/2PACX-1vRyOCXhRpK4pZKf1YjZN_3fqPpifs9XTDqj5l9dV2-G0-8lS6bgPINaMBxYBTuKCPsTU3oS-hMTJf-8/pub",
    taskFileId: "https://docs.google.com/document/d/e/2PACX-1vRyOCXhRpK4pZKf1YjZN_3fqPpifs9XTDqj5l9dV2-G0-8lS6bgPINaMBxYBTuKCPsTU3oS-hMTJf-8/pub",
    taskSourceType: "doc",
  },
};

let sessionGroqApiKey = "";
let publishedSourceRefreshTimer = null;
let publishedSourceRefreshInFlight = false;
let localSourceWatchTimer = null;
let localSourceWatchInFlight = false;
let alertConfigSyncTimer = null;

const DRIVE_STORAGE_KEY = "amc.driveConfig.v1";
const REPORT_MONTH_STORAGE_KEY = "amc.reportMonth.v1";
const ALERT_RECIPIENT_STORAGE_KEY = "amc.alertRecipientEmail.v1";
const PUBLISHED_SOURCE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOCAL_SOURCE_WATCH_INTERVAL_MS = 2000;
const DEFAULT_DRIVE_CONFIG = {
  amcDriveLink: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJkPXGrcvOg6XMccE6rBvLLcgAF5ZuIbWOENrThdyltPfKuGWdaVyqHhEdsJOWfE6c1HLWWnCC8f__/pub?output=xlsx",
  amcFileId: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJkPXGrcvOg6XMccE6rBvLLcgAF5ZuIbWOENrThdyltPfKuGWdaVyqHhEdsJOWfE6c1HLWWnCC8f__/pub?output=xlsx",
  amcSourceType: "sheet",
  taskDriveLink: "https://docs.google.com/document/d/e/2PACX-1vRyOCXhRpK4pZKf1YjZN_3fqPpifs9XTDqj5l9dV2-G0-8lS6bgPINaMBxYBTuKCPsTU3oS-hMTJf-8/pub",
  taskFileId: "https://docs.google.com/document/d/e/2PACX-1vRyOCXhRpK4pZKf1YjZN_3fqPpifs9XTDqj5l9dV2-G0-8lS6bgPINaMBxYBTuKCPsTU3oS-hMTJf-8/pub",
  taskSourceType: "doc",
};
const LEGACY_DEFAULT_DRIVE_CONFIG = {
  amcFileId: "1f3IaKA_YWMmb-s9odPX-nd4Tcdtj72qmZYemqXBUKz4",
  amcSourceType: "sheet",
  taskFileId: "1wRYMtYx9ijhAIftOJ59ooLXMX9ydYK0TIlbghLBT9gU",
  taskSourceType: "doc",
};
const PREVIOUS_AMC_LINKS = new Set([
  "1f3IaKA_YWMmb-s9odPX-nd4Tcdtj72qmZYemqXBUKz4",
  "1qZ8y_asPHIfTlmjoZ-6y5Bks_qyoKgYdYqQVqoKZGfU",
  "https://docs.google.com/spreadsheets/d/1qZ8y_asPHIfTlmjoZ-6y5Bks_qyoKgYdYqQVqoKZGfU/edit?usp=sharing",
]);
const PREVIOUS_TASK_LINKS = new Set([
  "1wRYMtYx9ijhAIftOJ59ooLXMX9ydYK0TIlbghLBT9gU",
  "https://docs.google.com/document/d/1wRYMtYx9ijhAIftOJ59ooLXMX9ydYK0TIlbghLBT9gU/edit?usp=sharing",
]);

const GROQ_MODEL_CANDIDATES = [
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
];

const IKF_BRAND = {
  blue: [31, 95, 157],
  blueDark: [23, 71, 121],
  gold: [220, 168, 46],
  goldSoft: [245, 229, 184],
  text: [44, 44, 44],
  muted: [108, 108, 108],
  border: [198, 200, 204],
};

const IKF_LOGO_URLS = [
  "./IKF.png?v=20260447",
  "https://www.ikf.co.in/wp-content/uploads/ikf-logo-svg.svg",
  "https://www.ikf.co.in/wp-content/uploads/ikf-white-logo.svg",
];

let cachedIkfLogoDataUrl = "";
let cachedIkfLogoLoadPromise = null;

const SMART_RULES = [
  { keywords: ["banner update", "banner replace", "banner add"], minutes: 45 },
  { keywords: ["blog update", "blog content and image", "pfa blog content"], minutes: 45 },
  { keywords: ["new page create", "new page design", "create new page"], minutes: 120 },
  { keywords: ["vapt"], minutes: 120 },
  { keywords: ["meta title", "meta description"], minutes: 60 },
  { keywords: ["heading tag", "heading tags change"], minutes: 60 },
];

const TASK_CATEGORY_RULES = [
  {
    category: "Design",
    keywords: ["banner", "slider", "creative", "design", "layout", "mockup", "ui", "ux", "graphic", "image"],
  },
  {
    category: "Development",
    keywords: ["new page", "create page", "page create", "integration", "development", "plugin", "script", "code", "feature"],
  },
  {
    category: "Content",
    keywords: ["blog", "article", "content", "copy", "write", "rewrite", "edit content", "text update"],
  },
  {
    category: "SEO",
    keywords: ["meta title", "meta description", "seo", "search console", "schema", "sitemap", "robots", "canonical", "alt text", "keyword"],
  },
  {
    category: "Maintenance",
    keywords: ["wordpress update", "plugin update", "core update", "website update", "site update", "page update", "backup", "restore", "optimize", "maintenance"],
  },
  {
    category: "Security",
    keywords: ["vapt", "security", "malware", "ssl", "firewall", "vulnerability", "patch"],
  },
  {
    category: "Bug Fix",
    keywords: ["bug", "fix", "issue", "error", "not working", "troubleshoot", "broken", "problem"],
  },
  {
    category: "Hosting / Server",
    keywords: ["server", "hosting", "migration", "dns", "cpanel", "php", "email issue", "hosting issue"],
  },
  {
    category: "Analytics",
    keywords: ["analytics", "dashboard", "tracking", "tag manager", "pixel", "report", "search console"],
  },
  {
    category: "Communication",
    keywords: ["meeting", "call", "follow up", "discussion", "email", "coordination", "approval"],
  },
  {
    category: "Other",
    keywords: [],
  },
];

const AMC_HEADER_ALIASES = {
  clientName: [
    "client name",
    "website - url",
    "website-url",
    "website url",
    "client",
    "client website",
    "website",
    "url",
  ],
  startDate: [
    "amc start date",
    "amc startdate",
    "start date",
    "amc start",
  ],
  endDate: [
    "amc end date",
    "amc enddate",
    "end date",
    "amc end",
  ],
  allocatedHours: [
    "total amc hours allocated",
    "allocated hours yearly",
    "alloted hours yearly",
    "allotted hours yearly",
    "allocated hours",
    "alloted hours",
    "allotted hours",
    "yearly allocated hours",
    "total allocated hours",
  ],
};

const elements = {
  amcFile: document.getElementById("amcFile"),
  taskFile: document.getElementById("taskFile"),
  amcFileName: document.getElementById("amcFileName"),
  taskFileName: document.getElementById("taskFileName"),
  watchAmcFileBtn: document.getElementById("watchAmcFileBtn"),
  watchTaskFileBtn: document.getElementById("watchTaskFileBtn"),
  autoRefreshStatus: document.getElementById("autoRefreshStatus"),
  amcDriveInput: document.getElementById("amcDriveInput"),
  taskDriveInput: document.getElementById("taskDriveInput"),
  alertRecipientEmailInput: document.getElementById("alertRecipientEmailInput"),
  openAmcDriveBtn: document.getElementById("openAmcDriveBtn"),
  openTaskDriveBtn: document.getElementById("openTaskDriveBtn"),
  saveDriveConfigBtn: document.getElementById("saveDriveConfigBtn"),
  clearDriveConfigBtn: document.getElementById("clearDriveConfigBtn"),
  restoreDefaultsBtn: document.getElementById("restoreDefaultsBtn"),
  runAlertCheckBtn: document.getElementById("runAlertCheckBtn"),
  workspaceSourcesTab: document.getElementById("workspaceSourcesTab"),
  workspaceInputsTab: document.getElementById("workspaceInputsTab"),
  workspaceSourcesPanel: document.getElementById("workspaceSourcesPanel"),
  workspaceInputsPanel: document.getElementById("workspaceInputsPanel"),
  driveStatus: document.getElementById("driveStatus"),
  generateBtn: document.getElementById("generateBtn"),
  aiParseBtn: document.getElementById("aiParseBtn"),
  summaryPdfBtn: document.getElementById("summaryPdfBtn"),
  messageBox: document.getElementById("messageBox"),
  reportSection: document.getElementById("reportSection"),
  summaryCards: document.getElementById("summaryCards"),
  reportTableBody: document.getElementById("reportTableBody"),
  clientSearchInput: document.getElementById("clientSearchInput"),
  reportMonthInput: document.getElementById("reportMonthInput"),
  reportScopeNote: document.getElementById("reportScopeNote"),
  detailModal: document.getElementById("detailModal"),
  modalContent: document.getElementById("modalContent"),
  closeModalBtn: document.getElementById("closeModalBtn"),
};

function init() {
  loadReportMonthFromStorage();
  loadAlertRecipientEmailFromStorage();
  loadDriveConfigFromStorage();
  syncDriveConfigInputs();
  syncAlertRecipientInput();
  syncReportMonthInput();
  updateDriveStatus();
  updateReportScopeNote();
  syncAlertConfigToServer(state.driveConfig, state.alertRecipientEmail, { includeRecipient: false });
  void loadAlertConfigFromServer();

  elements.amcFile.addEventListener("change", () => {
    handleLocalSourceInputChange("amc");
  });

  elements.taskFile.addEventListener("change", () => {
    handleLocalSourceInputChange("task");
  });

  elements.watchAmcFileBtn?.addEventListener("click", () => {
    void pickLocalSourceFile("amc");
  });

  elements.watchTaskFileBtn?.addEventListener("click", () => {
    void pickLocalSourceFile("task");
  });

  elements.saveDriveConfigBtn?.addEventListener("click", saveDriveConfig);
  elements.clearDriveConfigBtn?.addEventListener("click", clearDriveConfig);
  elements.restoreDefaultsBtn?.addEventListener("click", restorePublishedDefaults);
  elements.runAlertCheckBtn?.addEventListener("click", runAlertCheckNow);
  elements.openAmcDriveBtn?.addEventListener("click", () => openDriveLinkFromInput("sheet"));
  elements.openTaskDriveBtn?.addEventListener("click", () => openDriveLinkFromInput("doc"));
  elements.amcDriveInput?.addEventListener("input", handleDriveInputChange);
  elements.taskDriveInput?.addEventListener("input", handleDriveInputChange);
  elements.alertRecipientEmailInput?.addEventListener("input", handleAlertRecipientEmailInput);
  elements.workspaceSourcesTab?.addEventListener("click", () => activateWorkspaceTab("sources"));
  elements.workspaceInputsTab?.addEventListener("click", () => activateWorkspaceTab("inputs"));

  elements.generateBtn.addEventListener("click", handleGenerateReport);
  elements.aiParseBtn?.addEventListener("click", handleAiParseReport);
  elements.summaryPdfBtn.addEventListener("click", generateSummaryPdf);
  elements.clientSearchInput?.addEventListener("input", (event) => {
    state.searchQuery = event.target.value || "";
    renderMainTable(state.reports);
  });
  elements.reportMonthInput?.addEventListener("change", handleReportMonthChange);
  elements.closeModalBtn.addEventListener("click", closeModal);
  elements.detailModal.addEventListener("click", (event) => {
    if (event.target.dataset.closeModal === "true") {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.detailModal.classList.contains("hidden")) {
      closeModal();
    }
  });

  registerServiceWorker();
  startPublishedSourceRefreshLoop();
  startLocalSourceWatchLoop();

  if (!hasSelectedLocalFiles() && state.driveConfig.amcFileId && state.driveConfig.taskFileId) {
    queueMicrotask(() => {
      generateReportFromSources().catch((error) => {
        console.error(error);
      });
    });
  }

  activateWorkspaceTab("sources");
}

function startPublishedSourceRefreshLoop() {
  if (publishedSourceRefreshTimer) {
    clearInterval(publishedSourceRefreshTimer);
  }

  const refresh = () => {
    if (document.hidden) {
      return;
    }

    if (publishedSourceRefreshInFlight) {
      return;
    }

    if (hasSelectedLocalFiles()) {
      return;
    }

    if (!state.driveConfig.amcFileId || !state.driveConfig.taskFileId) {
      return;
    }

    publishedSourceRefreshInFlight = true;
    generateReportFromSources()
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        publishedSourceRefreshInFlight = false;
      });
  };

  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  publishedSourceRefreshTimer = window.setInterval(refresh, PUBLISHED_SOURCE_REFRESH_INTERVAL_MS);
}

function startLocalSourceWatchLoop() {
  if (localSourceWatchTimer) {
    clearInterval(localSourceWatchTimer);
  }

  const refresh = () => {
    if (document.hidden || localSourceWatchInFlight) {
      return;
    }

    if (!state.sourceFileHandles.amc && !state.sourceFileHandles.task) {
      return;
    }

    localSourceWatchInFlight = true;
    void checkLocalSourceChanges()
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        localSourceWatchInFlight = false;
      });
  };

  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  localSourceWatchTimer = window.setInterval(refresh, LOCAL_SOURCE_WATCH_INTERVAL_MS);
}

function activateWorkspaceTab(tabName) {
  const isSources = tabName === "sources";

  if (elements.workspaceSourcesTab) {
    elements.workspaceSourcesTab.classList.toggle("is-active", isSources);
    elements.workspaceSourcesTab.setAttribute("aria-selected", String(isSources));
  }

  if (elements.workspaceInputsTab) {
    elements.workspaceInputsTab.classList.toggle("is-active", !isSources);
    elements.workspaceInputsTab.setAttribute("aria-selected", String(!isSources));
  }

  if (elements.workspaceSourcesPanel) {
    elements.workspaceSourcesPanel.classList.toggle("is-active", isSources);
    elements.workspaceSourcesPanel.hidden = !isSources;
  }

  if (elements.workspaceInputsPanel) {
    elements.workspaceInputsPanel.classList.toggle("is-active", !isSources);
    elements.workspaceInputsPanel.hidden = isSources;
  }
}

async function handleGenerateReport() {
  await generateReportFromSources({ useAi: false });
}

async function handleAiParseReport() {
  const apiKey = promptForGroqApiKey();
  if (!apiKey) {
    showMessage("Groq API key was not provided. AI parse canceled.", true);
    return;
  }

  sessionGroqApiKey = apiKey;
  await generateReportFromSources({ useAi: true, groqApiKey: apiKey });
}

async function generateReportFromSources({ useAi = false, groqApiKey = "" } = {}) {
  clearMessage();

  const amcFile = getSelectedLocalSourceFile("amc");
  const taskFile = getSelectedLocalSourceFile("task");
  const driveConfig = readDriveConfigFromInputs();
  const reportMonth = readReportMonthFromInput();
  const normalizedConfig = normalizeDriveConfig(driveConfig);
  const preserveViewState = (!amcFile && !taskFile) || Boolean(state.sourceFileHandles.amc || state.sourceFileHandles.task);
  const previousSelectedClientKey = preserveViewState && state.selectedClient ? state.selectedClient.clientKey : null;
  const previousSearchQuery = preserveViewState ? state.searchQuery : "";

  if (driveConfig.amcFileId || driveConfig.taskFileId) {
    persistDriveConfig(normalizedConfig);
  }
  persistReportMonth(reportMonth);

  if (!amcFile && !normalizedConfig.amcFileId) {
    showMessage("Please upload the AMC Excel file or save the published source link for it.", true);
    return;
  }

  if (!taskFile && !normalizedConfig.taskFileId) {
    showMessage("Please upload the Daily Task TXT file or save the published source link for it.", true);
    return;
  }

  if (!window.XLSX) {
    showMessage("SheetJS library is not available yet. Please wait a moment and try again.", true);
    return;
  }

  try {
    elements.generateBtn.disabled = true;
    if (elements.aiParseBtn) {
      elements.aiParseBtn.disabled = true;
    }
    showMessage(
      useAi
        ? "Reading files and running AI-assisted parsing..."
        : "Reading files and preparing the report...",
    );

    const [amcRows, taskContent] = await Promise.all([
      parseAmcWorkbook(await resolveSourceFile(amcFile, "amc", normalizedConfig.amcFileId, {
        kind: "AMC Excel",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })),
      resolveSourceText(taskFile, "task", normalizedConfig.taskFileId, { kind: "Task TXT" }),
    ]);
    const localTaskEntries = parseTaskContent(taskContent);
    const taskEntries = useAi
      ? mergeTaskEntries(localTaskEntries, await parseTaskFileWithAI(taskContent, amcRows, groqApiKey))
      : localTaskEntries;
    state.amcRows = amcRows;
    state.taskEntries = taskEntries;
    const reports = buildClientReports(amcRows, taskEntries, reportMonth);

    if (!reports.length) {
      throw new Error("No AMC client records were found in the uploaded Excel file.");
    }

    state.reports = reports;
    state.clientMap = new Map(reports.map((report) => [report.clientKey, report]));
    state.selectedClient = previousSelectedClientKey ? state.clientMap.get(previousSelectedClientKey) || null : null;
    state.searchQuery = previousSearchQuery;
    state.reportMonth = reportMonth;
    if (elements.clientSearchInput) {
      elements.clientSearchInput.value = state.searchQuery;
    }

    renderSummaryCards(reports);
    renderMainTable(reports);
    syncReportMonthInput();
    updateReportScopeNote();

    elements.reportSection.classList.remove("hidden");
    elements.summaryPdfBtn.disabled = false;
    showMessage(
      reportMonth
        ? `Report generated for ${reports.length} client${reports.length === 1 ? "" : "s"} for ${formatReportMonthLabel(reportMonth)}.`
        : `Report generated for ${reports.length} client${reports.length === 1 ? "" : "s"}.`,
    );
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to process the uploaded files.", true);
  } finally {
    elements.generateBtn.disabled = false;
    if (elements.aiParseBtn) {
      elements.aiParseBtn.disabled = false;
    }
  }
}

function hasSelectedLocalFiles() {
  return Boolean(getSelectedLocalSourceFile("amc") || getSelectedLocalSourceFile("task"));
}

function getSelectedLocalSourceFile(sourceKey) {
  return state.sourceFiles[sourceKey] || elements[`${sourceKey}File`]?.files?.[0] || null;
}

function getSourceFingerprint(file) {
  if (!file) {
    return "";
  }

  return `${file.name}|${file.size}|${file.lastModified}`;
}

function setSelectedLocalSourceFile(sourceKey, file, handle = null) {
  const input = elements[`${sourceKey}File`];
  if (!input) {
    return;
  }

  state.sourceFiles[sourceKey] = file || null;
  state.sourceFileHandles[sourceKey] = handle || null;
  state.sourceFileFingerprints[sourceKey] = getSourceFingerprint(file);

  if (!file) {
    input.value = "";
  } else if (window.DataTransfer) {
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
    } catch (error) {
      console.warn("Unable to mirror the selected file into the file input.", error);
    }
  }

  const fileNameElement = elements[`${sourceKey}FileName`];
  if (fileNameElement) {
    fileNameElement.textContent = file?.name || "No file selected";
  }

  updateDriveStatus();
}

function handleLocalSourceInputChange(sourceKey) {
  const input = elements[`${sourceKey}File`];
  const file = input?.files?.[0] || null;
  setSelectedLocalSourceFile(sourceKey, file, null);
}

async function pickLocalSourceFile(sourceKey) {
  if (typeof window.showOpenFilePicker !== "function") {
    elements[`${sourceKey}File`]?.click();
    return;
  }

  const pickerOptions = sourceKey === "amc"
    ? {
        multiple: false,
        excludeAcceptAllOption: true,
        types: [
          {
            description: "AMC Excel file",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xls", ".xlsm", ".xlsb"],
            },
          },
        ],
      }
    : {
        multiple: false,
        excludeAcceptAllOption: true,
        types: [
          {
            description: "Task TXT file",
            accept: {
              "text/plain": [".txt"],
            },
          },
        ],
      };

  try {
    const [handle] = await window.showOpenFilePicker(pickerOptions);
    if (!handle) {
      return;
    }

    const file = await handle.getFile();
    setSelectedLocalSourceFile(sourceKey, file, handle);
    showMessage(
      sourceKey === "amc"
        ? "AMC local watch is active. Save the Excel file and the report will refresh automatically."
        : "Task local watch is active. Save the TXT file and the report will refresh automatically.",
    );
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      showMessage(error.message || "Unable to open the local file picker.", true);
    }
  }
}

async function checkLocalSourceChanges() {
  const liveKeys = Object.keys(state.sourceFileHandles).filter((sourceKey) => Boolean(state.sourceFileHandles[sourceKey]));
  if (!liveKeys.length) {
    return;
  }

  let sourceChanged = false;
  for (const sourceKey of liveKeys) {
    const handle = state.sourceFileHandles[sourceKey];
    if (!handle) {
      continue;
    }

    const file = await handle.getFile();
    const fingerprint = getSourceFingerprint(file);
    if (fingerprint !== state.sourceFileFingerprints[sourceKey]) {
      sourceChanged = true;
      setSelectedLocalSourceFile(sourceKey, file, handle);
    }
  }

  if (sourceChanged) {
    await generateReportFromSources();
  }
}

function loadDriveConfigFromStorage() {
  const rawConfig = window.localStorage.getItem(DRIVE_STORAGE_KEY);

  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig);
      if (isLegacyDefaultDriveConfig(parsed)) {
        state.driveConfig = { ...DEFAULT_DRIVE_CONFIG };
        persistDriveConfig(state.driveConfig);
        return;
      }

      state.driveConfig = normalizeDriveConfig(parsed);
      if (shouldReplaceAmcWithCurrentDefault(state.driveConfig)) {
        state.driveConfig.amcDriveLink = DEFAULT_DRIVE_CONFIG.amcDriveLink;
        state.driveConfig.amcFileId = DEFAULT_DRIVE_CONFIG.amcFileId;
        state.driveConfig.amcSourceType = DEFAULT_DRIVE_CONFIG.amcSourceType;
        persistDriveConfig(state.driveConfig);
      }
      if (shouldReplaceTaskWithCurrentDefault(state.driveConfig)) {
        state.driveConfig.taskDriveLink = DEFAULT_DRIVE_CONFIG.taskDriveLink;
        state.driveConfig.taskFileId = DEFAULT_DRIVE_CONFIG.taskFileId;
        state.driveConfig.taskSourceType = DEFAULT_DRIVE_CONFIG.taskSourceType;
        persistDriveConfig(state.driveConfig);
        return;
      }

      if (!state.driveConfig.amcFileId || !state.driveConfig.taskFileId) {
        state.driveConfig = { ...DEFAULT_DRIVE_CONFIG };
        persistDriveConfig(state.driveConfig);
      }
    } catch (error) {
      console.warn("Unable to read saved Drive config.", error);
      state.driveConfig = { ...DEFAULT_DRIVE_CONFIG };
    }
  } else {
    state.driveConfig = { ...DEFAULT_DRIVE_CONFIG };
  }
}

function loadReportMonthFromStorage() {
  state.reportMonth = String(window.localStorage.getItem(REPORT_MONTH_STORAGE_KEY) || "").trim();
  if (!isValidReportMonth(state.reportMonth)) {
    state.reportMonth = "";
  }
}

function loadAlertRecipientEmailFromStorage() {
  state.alertRecipientEmail = normalizeAlertRecipientEmail(window.localStorage.getItem(ALERT_RECIPIENT_STORAGE_KEY));
}

async function loadAlertConfigFromServer() {
  try {
    const response = await fetch("/api/amc-alert-config", { method: "GET" });
    if (!response.ok) {
      return;
    }

    const config = await response.json();
    const serverRecipientEmail = normalizeAlertRecipientEmail(config?.alertRecipientEmail);
    const serverAlertWindowDays = Number.parseInt(config?.alertWindowDays, 10);
    if (Number.isFinite(serverAlertWindowDays) && serverAlertWindowDays > 0) {
      state.alertWindowDays = serverAlertWindowDays;
    }
    if (serverRecipientEmail && !state.alertRecipientEmail) {
      persistAlertRecipientEmail(serverRecipientEmail);
    }
    updateDriveStatus();
  } catch (error) {
    console.warn("Unable to load AMC alert config from server.", error);
  }
}

function persistReportMonth(reportMonth) {
  state.reportMonth = isValidReportMonth(reportMonth) ? reportMonth : "";
  if (state.reportMonth) {
    window.localStorage.setItem(REPORT_MONTH_STORAGE_KEY, state.reportMonth);
  } else {
    window.localStorage.removeItem(REPORT_MONTH_STORAGE_KEY);
  }
  syncReportMonthInput();
  updateReportScopeNote();
}

function persistAlertRecipientEmail(alertRecipientEmail) {
  state.alertRecipientEmail = normalizeAlertRecipientEmail(alertRecipientEmail);
  if (state.alertRecipientEmail) {
    window.localStorage.setItem(ALERT_RECIPIENT_STORAGE_KEY, state.alertRecipientEmail);
  } else {
    window.localStorage.removeItem(ALERT_RECIPIENT_STORAGE_KEY);
  }
  syncAlertRecipientInput();
}

function syncAlertRecipientInput() {
  if (elements.alertRecipientEmailInput) {
    elements.alertRecipientEmailInput.value = state.alertRecipientEmail;
  }
}

function normalizeAlertRecipientEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function handleReportMonthChange() {
  const reportMonth = readReportMonthFromInput();
  persistReportMonth(reportMonth);
  if (state.amcRows.length && state.taskEntries.length) {
    void rerenderReportFromCachedData();
  }
}

function readReportMonthFromInput() {
  const value = String(elements.reportMonthInput?.value || "").trim();
  return isValidReportMonth(value) ? value : "";
}

function syncReportMonthInput() {
  populateReportMonthOptions(state.amcRows);
}

function populateReportMonthOptions(amcRows = []) {
  if (!elements.reportMonthInput) {
    return;
  }

  const currentValue = state.reportMonth;
  const monthOptions = buildReportMonthOptions(amcRows);
  const optionsMarkup = [
    `<option value="">All Months</option>`,
    ...monthOptions.map((monthKey) => `<option value="${monthKey}">${escapeHtml(formatReportMonthLabel(monthKey))}</option>`),
  ].join("");

  elements.reportMonthInput.innerHTML = optionsMarkup;
  elements.reportMonthInput.value = monthOptions.includes(currentValue) ? currentValue : "";
}

function buildReportMonthOptions(amcRows = []) {
  const monthKeys = new Set();

  for (const row of amcRows) {
    const startComparable = normalizeDateComparable(row?.startDateComparable ?? row?.startDateDisplay);
    const endComparable = normalizeDateComparable(row?.endDateComparable ?? row?.endDateDisplay);
    if (Number.isNaN(startComparable) || Number.isNaN(endComparable)) {
      continue;
    }

    const scopedMonths = getMonthKeysBetween(startComparable, endComparable);
    scopedMonths.forEach((monthKey) => monthKeys.add(monthKey));
  }

  return [...monthKeys].sort();
}

function updateReportScopeNote() {
  if (!elements.reportScopeNote) {
    return;
  }

  elements.reportScopeNote.textContent = state.reportMonth
    ? `Showing report for ${formatReportMonthLabel(state.reportMonth)}.`
    : "Showing all months.";
}

function isValidReportMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || "").trim());
}

function formatReportMonthLabel(value) {
  if (!isValidReportMonth(value)) {
    return "All Months";
  }

  const [yearText, monthText] = String(value).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return "All Months";
  }

  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function isDateInReportMonth(value, reportMonth) {
  if (!isValidReportMonth(reportMonth)) {
    return true;
  }

  const parsed = normalizeDateComparable(value);
  if (Number.isNaN(parsed)) {
    return false;
  }

  const date = new Date(parsed);
  const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return monthKey === reportMonth;
}

function isDateWithinAmcPeriod(value, startComparable, endComparable) {
  const parsed = normalizeDateComparable(value);
  if (Number.isNaN(parsed)) {
    return false;
  }

  if (!Number.isNaN(startComparable) && parsed < startComparable) {
    return false;
  }

  if (!Number.isNaN(endComparable) && parsed > endComparable) {
    return false;
  }

  return true;
}

function getMonthKeysBetween(startComparable, endComparable) {
  if (Number.isNaN(startComparable) || Number.isNaN(endComparable)) {
    return [];
  }

  const startDate = new Date(startComparable);
  const endDate = new Date(endComparable);
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const lastMonth = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1);

  if (cursor.getTime() > lastMonth) {
    return [];
  }

  const monthKeys = [];
  while (cursor.getTime() <= lastMonth) {
    monthKeys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return monthKeys;
}

async function rerenderReportFromCachedData() {
  if (!state.amcRows.length || !state.taskEntries.length) {
    return;
  }

  const reports = buildClientReports(state.amcRows, state.taskEntries, state.reportMonth);
  if (!reports.length) {
    return;
  }

  state.reports = reports;
  state.clientMap = new Map(reports.map((report) => [report.clientKey, report]));
  const selectedClientKey = state.selectedClient?.clientKey || "";
  state.selectedClient = selectedClientKey ? state.clientMap.get(selectedClientKey) || null : null;
  if (elements.clientSearchInput) {
    state.searchQuery = elements.clientSearchInput.value || "";
  }

  renderSummaryCards(reports);
  renderMainTable(reports);
  updateReportScopeNote();
  elements.reportSection.classList.remove("hidden");
  elements.summaryPdfBtn.disabled = false;
  showMessage(
    state.reportMonth
      ? `Report updated for ${formatReportMonthLabel(state.reportMonth)}.`
      : `Report updated for all months.`,
  );
}

function normalizeDriveConfig(config = {}) {
  const amcDriveLink = normalizeDriveLinkValue(
    config.amcDriveLink ?? config.amcFileId ?? DEFAULT_DRIVE_CONFIG.amcDriveLink,
    "sheet",
  );
  const taskDriveLink = normalizeDriveLinkValue(
    config.taskDriveLink ?? config.taskFileId ?? DEFAULT_DRIVE_CONFIG.taskDriveLink,
    "doc",
  );
  const amcSourceType = detectDriveSourceType(
    amcDriveLink,
    String(config.amcSourceType ?? DEFAULT_DRIVE_CONFIG.amcSourceType),
  );
  const taskSourceType = detectDriveSourceType(
    taskDriveLink,
    String(config.taskSourceType ?? DEFAULT_DRIVE_CONFIG.taskSourceType),
  );

  return {
    amcDriveLink,
    amcFileId: normalizeDriveFileId(amcDriveLink),
    amcSourceType,
    taskDriveLink,
    taskFileId: normalizeDriveFileId(taskDriveLink),
    taskSourceType,
  };
}

function isLegacyDefaultDriveConfig(config = {}) {
  return normalizeDriveFileId(config.amcFileId) === LEGACY_DEFAULT_DRIVE_CONFIG.amcFileId
    && detectDriveSourceType(config.amcFileId ?? "", "sheet") === "sheet"
    && normalizeDriveFileId(config.taskFileId) === LEGACY_DEFAULT_DRIVE_CONFIG.taskFileId
    && detectDriveSourceType(config.taskFileId ?? "", "doc") === "doc";
}

function shouldReplaceAmcWithCurrentDefault(config = {}) {
  const savedAmcLink = String(config.amcDriveLink || config.amcFileId || "").trim();
  if (!savedAmcLink) {
    return true;
  }

  return PREVIOUS_AMC_LINKS.has(savedAmcLink) || PREVIOUS_AMC_LINKS.has(normalizeDriveFileId(savedAmcLink));
}

function shouldReplaceTaskWithCurrentDefault(config = {}) {
  const savedTaskLink = String(config.taskDriveLink || config.taskFileId || "").trim();
  if (!savedTaskLink) {
    return true;
  }

  return PREVIOUS_TASK_LINKS.has(savedTaskLink) || PREVIOUS_TASK_LINKS.has(normalizeDriveFileId(savedTaskLink));
}

function syncDriveConfigInputs() {
  if (elements.amcDriveInput) {
    elements.amcDriveInput.value = state.driveConfig.amcDriveLink || buildDriveLinkFromFileId(state.driveConfig.amcFileId, "sheet");
  }
  if (elements.taskDriveInput) {
    elements.taskDriveInput.value = state.driveConfig.taskDriveLink || buildDriveLinkFromFileId(state.driveConfig.taskFileId, "doc");
  }
  updateDriveActionState();
}

function readDriveConfigFromInputs() {
  const amcInputValue = String(elements.amcDriveInput?.value || "");
  const taskInputValue = String(elements.taskDriveInput?.value || "");
  return {
    amcDriveLink: normalizeDriveLinkValue(amcInputValue, "sheet"),
    amcFileId: normalizeDriveFileId(amcInputValue),
    amcSourceType: detectDriveSourceType(amcInputValue, state.driveConfig.amcSourceType || "sheet"),
    taskDriveLink: normalizeDriveLinkValue(taskInputValue, "doc"),
    taskFileId: normalizeDriveFileId(taskInputValue),
    taskSourceType: detectDriveSourceType(taskInputValue, state.driveConfig.taskSourceType || "doc"),
  };
}

function saveDriveConfig() {
  const config = readDriveConfigFromInputs();
  persistDriveConfig(config);
  syncAlertConfigToServer(state.driveConfig, state.alertRecipientEmail, { includeRecipient: true });
  updateDriveStatus();
  showMessage("Published sources saved.");
}

function persistDriveConfig(config) {
  const normalizedConfig = normalizeDriveConfig(config);
  state.driveConfig = {
    amcDriveLink: normalizedConfig.amcDriveLink || buildDriveLinkFromFileId(normalizedConfig.amcFileId, "sheet"),
    amcFileId: normalizedConfig.amcFileId,
    amcSourceType: normalizedConfig.amcSourceType || "file",
    taskDriveLink: normalizedConfig.taskDriveLink || buildDriveLinkFromFileId(normalizedConfig.taskFileId, "doc"),
    taskFileId: normalizedConfig.taskFileId,
    taskSourceType: normalizedConfig.taskSourceType || "file",
  };
  window.localStorage.setItem(
    DRIVE_STORAGE_KEY,
    JSON.stringify({
      amcDriveLink: state.driveConfig.amcDriveLink,
      amcFileId: state.driveConfig.amcFileId,
      amcSourceType: state.driveConfig.amcSourceType || "file",
      taskDriveLink: state.driveConfig.taskDriveLink,
      taskFileId: state.driveConfig.taskFileId,
      taskSourceType: state.driveConfig.taskSourceType || "file",
    }),
  );
}

function clearDriveConfig() {
  state.driveConfig = {
    amcDriveLink: "",
    amcFileId: "",
    amcSourceType: "file",
    taskDriveLink: "",
    taskFileId: "",
    taskSourceType: "file",
  };
  window.localStorage.removeItem(DRIVE_STORAGE_KEY);
  syncAlertConfigToServer(state.driveConfig, state.alertRecipientEmail, { includeRecipient: true });
  syncDriveConfigInputs();
  updateDriveStatus();
  showMessage("Published sources cleared.");
}

function restorePublishedDefaults() {
  state.driveConfig = { ...DEFAULT_DRIVE_CONFIG };
  window.localStorage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(DEFAULT_DRIVE_CONFIG));
  persistReportMonth("");
  syncAlertConfigToServer(state.driveConfig, state.alertRecipientEmail, { includeRecipient: true });
  syncDriveConfigInputs();
  updateDriveStatus();
  showMessage("Published default sources restored.");
}

function syncAlertConfigToServer(config, alertRecipientEmail = state.alertRecipientEmail, { includeRecipient = true } = {}) {
  if (!config) {
    return;
  }

  const payload = {
    amcDriveLink: String(config.amcDriveLink || ""),
    amcFileId: String(config.amcFileId || ""),
    amcSourceType: String(config.amcSourceType || "file"),
  };
  if (includeRecipient) {
    payload.alertRecipientEmail = normalizeAlertRecipientEmail(alertRecipientEmail);
  }
  payload.alertWindowDays = state.alertWindowDays;

  void fetch("/api/amc-alert-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.warn("AMC alert config sync failed.", error);
  });
}

function handleDriveInputChange() {
  updateDriveStatus();
  updateDriveActionState();
  scheduleAlertConfigSync({ includeSmtpCredentials: false });
}

function handleAlertRecipientEmailInput() {
  persistAlertRecipientEmail(elements.alertRecipientEmailInput?.value || "");
  scheduleAlertConfigSync();
  updateDriveStatus();
}

function scheduleAlertConfigSync({ delayMs = 500 } = {}) {
  if (alertConfigSyncTimer) {
    window.clearTimeout(alertConfigSyncTimer);
  }

  alertConfigSyncTimer = window.setTimeout(() => {
    alertConfigSyncTimer = null;
    syncAlertConfigToServer(state.driveConfig, state.alertRecipientEmail, {
      includeRecipient: true,
    });
  }, delayMs);
}

async function runAlertCheckNow() {
  if (!state.driveConfig.amcFileId) {
    showMessage("Save an AMC source first before running the alert check.", true);
    return;
  }

  if (!state.alertRecipientEmail) {
    showMessage("Enter the alert recipient email first.", true);
    return;
  }

  try {
    if (elements.runAlertCheckBtn) {
      elements.runAlertCheckBtn.disabled = true;
    }

    showMessage("Running AMC alert check now...");
    const response = await fetch("/api/amc-alert-run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amcDriveLink: String(state.driveConfig.amcDriveLink || ""),
        amcFileId: String(state.driveConfig.amcFileId || ""),
        amcSourceType: String(state.driveConfig.amcSourceType || "file"),
        alertRecipientEmail: state.alertRecipientEmail,
        alertWindowDays: state.alertWindowDays,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result?.ok) {
      throw new Error(result?.reason || "AMC alert check failed.");
    }

    if (result.sent) {
      showMessage(`AMC expiry email sent for ${result.count} client${result.count === 1 ? "" : "s"}.`);
    } else {
      showMessage(`AMC alert check completed. No AMC contracts are within the ${state.alertWindowDays}-day alert window.`);
    }
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to run the AMC alert check.", true);
  } finally {
    updateDriveActionState();
  }
}

function updateDriveStatus() {
  if (!elements.driveStatus) {
    return;
  }

  const config = readDriveConfigFromInputs();
  const bits = [];
  bits.push(config.amcFileId ? "AMC link saved" : "AMC link missing");
  bits.push(config.taskFileId ? "Task link saved" : "Task link missing");
  bits.push(state.alertRecipientEmail ? `Alert email set: ${state.alertRecipientEmail}` : "Alert email missing");
  if (state.sourceFileHandles.amc || state.sourceFileHandles.task) {
    const liveBits = [];
    if (state.sourceFileHandles.amc) {
      liveBits.push("AMC live watch on");
    }
    if (state.sourceFileHandles.task) {
      liveBits.push("Task live watch on");
    }
    bits.push(liveBits.join(" | "));
  }
  elements.driveStatus.textContent = `Sources sync: ${bits.join(" | ")}`;
  updateAutoRefreshStatus();
  updateDriveActionState(config);
}

function updateAutoRefreshStatus() {
  if (!elements.autoRefreshStatus) {
    return;
  }

  const hasLiveWatch = Boolean(state.sourceFileHandles.amc || state.sourceFileHandles.task);
  if (!hasLiveWatch) {
    elements.autoRefreshStatus.textContent = "Auto-refresh: off";
    elements.autoRefreshStatus.classList.remove("is-active");
    return;
  }

  const parts = [];
  if (state.sourceFileHandles.amc) {
    parts.push("AMC");
  }
  if (state.sourceFileHandles.task) {
    parts.push("TXT");
  }
  elements.autoRefreshStatus.textContent = `Auto-refresh: on for ${parts.join(" + ")}`;
  elements.autoRefreshStatus.classList.add("is-active");
}

function updateDriveActionState(config = null) {
  const currentConfig = config || readDriveConfigFromInputs();
  if (elements.openAmcDriveBtn) {
    elements.openAmcDriveBtn.disabled = !currentConfig.amcFileId;
  }
  if (elements.openTaskDriveBtn) {
    elements.openTaskDriveBtn.disabled = !currentConfig.taskFileId;
  }
  if (elements.runAlertCheckBtn) {
    elements.runAlertCheckBtn.disabled = !currentConfig.amcFileId || !state.alertRecipientEmail;
  }
}

function openDriveLinkFromInput(sourceType = "file") {
  const input = sourceType === "sheet" ? elements.amcDriveInput : elements.taskDriveInput;
  const value = String(input?.value || "").trim();
  const normalizedLink = normalizeDriveLinkValue(value, sourceType);

  if (!normalizedLink) {
    showMessage(sourceType === "sheet" ? "Paste an AMC link first." : "Paste a task link first.", true);
    return;
  }

  window.open(normalizedLink, "_blank", "noopener,noreferrer");
}

function normalizeDriveFileId(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  if (/\/spreadsheets\/d\/e\/[a-zA-Z0-9_-]+\/pub(?:\?.*)?$/i.test(text)) {
    return text;
  }

  if (/\/document\/d\/e\/[a-zA-Z0-9_-]+\/pub(?:\?.*)?$/i.test(text)) {
    return text;
  }

  if (/\/spreadsheets\/d\/e\//i.test(text) || /\/document\/d\/e\//i.test(text)) {
    return "";
  }

  const docMatch = text.match(/\/document\/d\/([a-zA-Z0-9_-]+)/i);
  if (docMatch) {
    return isLikelyGoogleFileId(docMatch[1]) ? docMatch[1] : "";
  }

  const sheetMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (sheetMatch) {
    return isLikelyGoogleFileId(sheetMatch[1]) ? sheetMatch[1] : "";
  }

  const fileMatch = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch) {
    return isLikelyGoogleFileId(fileMatch[1]) ? fileMatch[1] : "";
  }

  const openMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (openMatch) {
    return isLikelyGoogleFileId(openMatch[1]) ? openMatch[1] : "";
  }

  const foldersMatch = text.match(/\/folders\/([a-zA-Z0-9_-]+)/i);
  if (foldersMatch) {
    return isLikelyGoogleFileId(foldersMatch[1]) ? foldersMatch[1] : "";
  }

  return isLikelyGoogleFileId(text) ? text : "";
}

function detectDriveSourceType(value, fallbackType = "file") {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) {
    return fallbackType;
  }

  if (text.includes("spreadsheets/d/")) {
    return "sheet";
  }

  if (text.includes("docs.google.com/spreadsheets")) {
    return "sheet";
  }

  if (text.includes("document/d/")) {
    return "doc";
  }

  if (text.includes("docs.google.com/document")) {
    return "doc";
  }

  return fallbackType;
}

function normalizeDriveLinkValue(value, sourceType = "file") {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    if (/\/spreadsheets\/d\/e\/[a-zA-Z0-9_-]+\/pub(?:\?.*)?$/i.test(text) || /\/document\/d\/e\/[a-zA-Z0-9_-]+\/pub(?:\?.*)?$/i.test(text)) {
      return text;
    }
    if (/\/spreadsheets\/d\/e\//i.test(text) || /\/document\/d\/e\//i.test(text)) {
      return "";
    }
    return text;
  }

  const fileId = normalizeDriveFileId(text);
  if (!fileId) {
    return "";
  }

  return buildDriveLinkFromFileId(fileId, sourceType);
}

function isLikelyGoogleFileId(value) {
  return /^[a-zA-Z0-9_-]{10,}$/.test(String(value ?? "").trim());
}

function buildDriveLinkFromFileId(fileId, sourceType = "file") {
  const encodedFileId = encodeURIComponent(String(fileId || "").trim());
  if (!encodedFileId) {
    return "";
  }

  if (sourceType === "sheet") {
    return `https://docs.google.com/spreadsheets/d/${encodedFileId}/edit?usp=sharing`;
  }

  if (sourceType === "doc") {
    return `https://docs.google.com/document/d/${encodedFileId}/edit?usp=sharing`;
  }

  return `https://drive.google.com/file/d/${encodedFileId}/view?usp=sharing`;
}

function buildDriveFetchTarget(fileId, sourceType = "file") {
  const text = String(fileId || "").trim();
  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  return buildDriveLinkFromFileId(text, sourceType);
}

async function resolveSourceFile(localFile, sourceKey, driveFileId, { kind, mimeType }) {
  if (localFile) {
    return localFile;
  }

  if (!driveFileId) {
    throw new Error(`Please provide a ${kind} file.`);
  }

  const sourceType = kind === "AMC Excel" ? state.driveConfig.amcSourceType : state.driveConfig.taskSourceType;
  const blob = await fetchDriveFileBlob(buildDriveFetchTarget(driveFileId, sourceType), mimeType, sourceType);
  const name = kind === "AMC Excel" ? "amc-source.xlsx" : "task-source.txt";
  return new File([blob], name, { type: blob.type || mimeType });
}

async function resolveSourceText(localFile, sourceKey, driveFileId, { kind }) {
  if (localFile) {
    return localFile.text();
  }

  if (!driveFileId) {
    throw new Error(`Please provide a ${kind} file.`);
  }

  const sourceType = kind === "Task TXT" ? state.driveConfig.taskSourceType : "file";
  const sourceTarget = buildDriveFetchTarget(driveFileId, sourceType);
  const text = await fetchDriveTextSource(sourceTarget, sourceType);
  return text;
}

async function fetchDriveFileBlob(fileId, expectedMimeType = "", sourceType = "file") {
  const directUrl = buildDirectGoogleDriveFetchUrl(fileId, sourceType);
  if (directUrl) {
    try {
      const directResponse = await fetch(directUrl, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
      });
      if (directResponse.ok) {
        return await directResponse.blob();
      }
    } catch (error) {
      console.warn("Direct Google Drive fetch failed, falling back to proxy.", error);
    }
  }

  const baseOrigin = window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : "http://localhost:3000";
  const url = new URL("/api/drive-file", baseOrigin);
  url.searchParams.set("fileId", fileId);
  url.searchParams.set("sourceType", sourceType);
  if (expectedMimeType) {
    url.searchParams.set("expectedMimeType", expectedMimeType);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(responseText || `Unable to fetch Google Drive file ${fileId}.`);
  }

  return await response.blob();
}

async function fetchDriveTextSource(sourceTarget, sourceType = "file") {
  const directUrl = buildDirectGoogleDriveFetchUrl(sourceTarget, sourceType);
  if (directUrl) {
    try {
      const response = await fetch(directUrl, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Unable to fetch Google Drive file.`);
      }

      const responseText = await response.text();
      if (sourceType === "doc" || looksLikeHtml(responseText)) {
        return extractPublishedDocText(responseText);
      }

      return responseText;
    } catch (error) {
      console.warn("Direct Google Drive text fetch failed, falling back to proxy.", error);
    }
  }

  const blob = await fetchDriveFileBlob(sourceTarget, "text/plain", sourceType);
  const responseText = await blob.text();
  if (sourceType === "doc" || looksLikeHtml(responseText)) {
    return extractPublishedDocText(responseText);
  }

  return responseText;
}

function looksLikeHtml(text) {
  return /<html[\s>]/i.test(String(text || "")) || /<body[\s>]/i.test(String(text || ""));
}

function extractPublishedDocText(html) {
  const text = String(html || "");
  if (!text) {
    return "";
  }

  if (typeof DOMParser === "undefined") {
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const doc = new DOMParser().parseFromString(text, "text/html");
  const contents = doc.querySelector("#contents");
  if (contents) {
    const lines = Array.from(contents.querySelectorAll("p, li, tr, h1, h2, h3, h4, h5, h6"))
      .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (lines.length) {
      return lines.join("\n");
    }
    const contentsText = String(contents.textContent || "").replace(/\s+\n/g, "\n").trim();
    if (contentsText) {
      return contentsText;
    }
  }

  const body = doc.body;
  return String(body?.textContent || text).replace(/\s+\n/g, "\n").trim();
}

function buildDirectGoogleDriveFetchUrl(value, sourceType = "file") {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  if (!/^https?:\/\//i.test(text)) {
    return "";
  }

  const lower = text.toLowerCase();
  if (lower.includes("docs.google.com/spreadsheets/") || lower.includes("docs.google.com/document/")) {
    return text;
  }

  if (sourceType === "sheet" && lower.includes("pub?output=xlsx")) {
    return text;
  }

  if (sourceType === "doc" && (lower.includes("pub?output=txt") || lower.includes("export?format=txt"))) {
    return text;
  }

  return "";
}

function promptForGroqApiKey() {
  const existing = sessionGroqApiKey ? `${sessionGroqApiKey}` : "";
  const value = window.prompt("Enter your Groq API key for this session only:", existing);
  return value ? value.trim() : "";
}

async function parseAmcWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellNF: true,
    cellText: true,
  });

  const bestSheetMeta = detectBestAmcSheet(workbook);
  const { sheet, range, headerRowIndex, resolvedHeaders } = bestSheetMeta;

  const missingHeaders = [];
  if (resolvedHeaders.clientName === undefined) {
    missingHeaders.push("Client Name / Website - URL");
  }
  if (resolvedHeaders.startDate === undefined) {
    missingHeaders.push("AMC Start Date");
  }
  if (resolvedHeaders.endDate === undefined) {
    missingHeaders.push("AMC End Date");
  }
  if (resolvedHeaders.allocatedHours === undefined) {
    missingHeaders.push("Total/Allocated Hours");
  }

  if (missingHeaders.length) {
    throw new Error(`AMC Excel file is missing required columns: ${missingHeaders.join(", ")}`);
  }

  const rows = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const clientName = readSheetDisplayValue(sheet, rowIndex, resolvedHeaders.clientName);
    if (!clientName) {
      continue;
    }

    const startMeta = readDateCell(sheet, rowIndex, resolvedHeaders.startDate);
    const endMeta = readDateCell(sheet, rowIndex, resolvedHeaders.endDate);
    const allocatedRaw = readSheetDisplayValue(sheet, rowIndex, resolvedHeaders.allocatedHours);
    let allocatedHours = Number.parseFloat(String(allocatedRaw).replace(/,/g, ""));

    if (Number.isNaN(allocatedHours)) {
      allocatedHours = calculateDefaultAllocatedHours(
        startMeta.comparable,
        endMeta.comparable,
        startMeta.display,
        endMeta.display,
      );
    }

    if (Number.isNaN(allocatedHours)) {
      allocatedHours = 8;
      console.warn(`Allocated hours missing for client "${clientName}". Falling back to 8 hours.`);
    }

    rows.push({
      clientName,
      clientKey: normalizeClientKey(clientName),
      startDateDisplay: startMeta.display,
      endDateDisplay: endMeta.display,
      startDateComparable: startMeta.comparable,
      endDateComparable: endMeta.comparable,
      allocatedHours,
    });
  }

  return rows;
}

function detectBestAmcSheet(workbook) {
  let bestSheetMeta = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      continue;
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const headerMeta = detectAmcHeaderRow(sheet, range);
    const score = Object.values(headerMeta.resolvedHeaders).filter((value) => value !== undefined).length;

    const candidate = {
      sheetName,
      sheet,
      range,
      headerRowIndex: headerMeta.headerRowIndex,
      resolvedHeaders: headerMeta.resolvedHeaders,
      score,
      weightedScore: calculateSheetMatchScore(headerMeta),
    };

    if (
      !bestSheetMeta ||
      candidate.weightedScore > bestSheetMeta.weightedScore ||
      (candidate.weightedScore === bestSheetMeta.weightedScore && candidate.score > bestSheetMeta.score)
    ) {
      bestSheetMeta = candidate;
    }
  }

  if (!bestSheetMeta) {
    throw new Error("The uploaded AMC Excel file does not contain readable worksheet data.");
  }

  return bestSheetMeta;
}

function detectAmcHeaderRow(sheet, range) {
  const scanLimit = Math.min(range.e.r, range.s.r + 14);
  let bestMatch = {
    score: -1,
    weightedScore: -1,
    headerRowIndex: range.s.r,
    resolvedHeaders: {
      clientName: undefined,
      startDate: undefined,
      endDate: undefined,
      allocatedHours: undefined,
    },
    matchedAliases: {
      clientName: "",
      startDate: "",
      endDate: "",
      allocatedHours: "",
    },
  };

  for (let rowIndex = range.s.r; rowIndex <= scanLimit; rowIndex += 1) {
    const headerMap = new Map();

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
      const cell = sheet[address];
      const headerText = normalizeHeaderText(cell?.w ?? cell?.v ?? "");
      if (headerText) {
        headerMap.set(headerText, col);
      }
    }

    const clientNameMatch = findHeaderMatch(headerMap, AMC_HEADER_ALIASES.clientName);
    const startDateMatch = findHeaderMatch(headerMap, AMC_HEADER_ALIASES.startDate);
    const endDateMatch = findHeaderMatch(headerMap, AMC_HEADER_ALIASES.endDate);
    const allocatedHoursMatch = findHeaderMatch(headerMap, AMC_HEADER_ALIASES.allocatedHours);

    const resolvedHeaders = {
      clientName: clientNameMatch.column,
      startDate: startDateMatch.column,
      endDate: endDateMatch.column,
      allocatedHours: allocatedHoursMatch.column,
    };

    const score = Object.values(resolvedHeaders).filter((value) => value !== undefined).length;
    const matchedAliases = {
      clientName: clientNameMatch.alias,
      startDate: startDateMatch.alias,
      endDate: endDateMatch.alias,
      allocatedHours: allocatedHoursMatch.alias,
    };
    const weightedScore = calculateHeaderWeightedScore(matchedAliases);

    if (weightedScore > bestMatch.weightedScore || (weightedScore === bestMatch.weightedScore && score > bestMatch.score)) {
      bestMatch = { score, weightedScore, headerRowIndex: rowIndex, resolvedHeaders, matchedAliases };
    }

    if (score === 4) {
      if (weightedScore >= 110) {
        break;
      }
    }
  }

  return bestMatch;
}

function normalizeHeaderText(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/:+/g, "")
    .replace(/[()]+/g, "");
}

function findHeaderColumn(headerMap, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderText(alias);
    if (headerMap.has(normalizedAlias)) {
      return headerMap.get(normalizedAlias);
    }
  }

  return undefined;
}

function findHeaderMatch(headerMap, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderText(alias);
    if (headerMap.has(normalizedAlias)) {
      return { column: headerMap.get(normalizedAlias), alias: normalizedAlias };
    }
  }

  return { column: undefined, alias: "" };
}

function calculateHeaderWeightedScore(matchedAliases) {
  let score = 0;

  if (matchedAliases.clientName) {
    score += matchedAliases.clientName === normalizeHeaderText("website - url") ? 40 : 20;
  }

  if (matchedAliases.startDate) {
    score += matchedAliases.startDate === normalizeHeaderText("amc start date") ? 30 : 15;
  }

  if (matchedAliases.endDate) {
    score += matchedAliases.endDate === normalizeHeaderText("amc end date") ? 30 : 15;
  }

  if (matchedAliases.allocatedHours) {
    score +=
      matchedAliases.allocatedHours === normalizeHeaderText("alloted hours yearly") ||
      matchedAliases.allocatedHours === normalizeHeaderText("allocated hours yearly")
        ? 40
        : 20;
  }

  return score;
}

function calculateSheetMatchScore(headerMeta) {
  const headerBonus = calculateHeaderWeightedScore(headerMeta.matchedAliases);
  return headerBonus + headerMeta.score * 10;
}

function calculateDefaultAllocatedHours(startComparable, endComparable, startDisplay = "", endDisplay = "") {
  let safeStartComparable = startComparable;
  let safeEndComparable = endComparable;

  if (Number.isNaN(safeStartComparable) && startDisplay) {
    safeStartComparable = normalizeDateComparable(startDisplay);
  }

  if (Number.isNaN(safeEndComparable) && endDisplay) {
    safeEndComparable = normalizeDateComparable(endDisplay);
  }

  if (Number.isNaN(safeStartComparable) || Number.isNaN(safeEndComparable)) {
    return Number.NaN;
  }

  const startDate = new Date(safeStartComparable);
  const endDate = new Date(safeEndComparable);
  const monthCount = monthDifferenceInclusive(startDate, endDate);

  if (monthCount <= 0) {
    return Number.NaN;
  }

  return monthCount * 8;
}

function monthDifferenceInclusive(startDate, endDate) {
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();

  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
}

function readSheetDisplayValue(sheet, rowIndex, colIndex) {
  if (colIndex === undefined) {
    return "";
  }

  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
  return String(cell?.w ?? cell?.v ?? "").trim();
}

function readDateCell(sheet, rowIndex, colIndex) {
  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
  const display = String(cell?.w ?? cell?.v ?? "").trim();
  let comparable = Number.NaN;

  if (cell?.v instanceof Date) {
    comparable = normalizeDateComparable(cell.v);
  } else if (typeof cell?.v === "number") {
    const parsed = XLSX.SSF.parse_date_code(cell.v);
    if (parsed) {
      comparable = Date.UTC(parsed.y, parsed.m - 1, parsed.d);
    }
  } else if (display) {
    comparable = normalizeDateComparable(display);
  }

  return { display, comparable };
}

async function parseTaskFile(file) {
  const content = await file.text();
  return parseTaskContent(content);
}

function parseTaskContent(content) {
  const structuredTasks = parseStructuredTaskBlocks(content);
  if (structuredTasks.length) {
    return structuredTasks;
  }

  const lines = content
    .split(/\r?\n/)
    .map((line, index) => ({ raw: line, lineNumber: index + 1 }))
    .filter(({ raw }) => raw.trim());

  const tasks = [];

  for (const { raw, lineNumber } of lines) {
    const line = raw.trim();
    if (shouldSkipTaskLine(line)) {
      continue;
    }

    const parts = splitTaskLine(line);
    if (parts.length < 3) {
      throw new Error(`Task TXT line ${lineNumber} is invalid. Expected format: Date | Client Name | Task Description | Minutes`);
    }

    const date = parts[0];
    const clientName = parts[1];
    const minutesRaw = parts.length >= 4 ? parts[parts.length - 1] : "";
    const descriptionParts = parts.slice(2, parts.length >= 4 ? parts.length - 1 : parts.length);
    const description = descriptionParts.join(" | ").trim();

    if (!date || !clientName || !description) {
      throw new Error(`Task TXT line ${lineNumber} must include date, client name, and task description.`);
    }

    const providedMinutes = minutesRaw ? Number.parseFloat(minutesRaw) : Number.NaN;
    if (minutesRaw && Number.isNaN(providedMinutes)) {
      throw new Error(`Task TXT line ${lineNumber} has invalid minutes value "${minutesRaw}".`);
    }

    const minutes = Number.isNaN(providedMinutes) ? resolveTaskMinutes(description) : providedMinutes;

    tasks.push(createTaskEntry(date, clientName, description, minutes, line, "local"));
  }

  if (!tasks.length) {
    throw new Error("The Task TXT file does not contain any readable task entries.");
  }

  return tasks;
}

async function parseTaskFileWithAI(content, amcRows, groqApiKey) {
  if (!groqApiKey) {
    return [];
  }

  const clientHints = amcRows
    .map((row) => row.clientName)
    .filter(Boolean)
    .slice(0, 250);

  const prompt = [
    "Extract AMC task entries from the TXT content below.",
    "Return ONLY valid JSON in this shape: {\"tasks\":[{\"date\":\"DD-MM-YY or DD-MM-YYYY as written\",\"clientName\":\"as written in TXT\",\"description\":\"exact task description text without rewriting\",\"minutes\":number}]}",
    "Rules:",
    "- Keep description exactly as written. Do not paraphrase or fix grammar.",
    "- Do not skip any dated/client task block.",
    "- If a task line or its block contains an explicit duration like 15min, 60 min, 1 hr, use that exact duration converted to minutes.",
    "- If no explicit duration exists, apply these defaults: blog upload/update/content and image/PFA blog content = 45, banner upload/update/replace/add = 30, VAPT = 120, file upload = 30, otherwise 30.",
    "- Preserve the client heading as written in TXT. Examples may be 'mitbio -', 'praj -', or a URL/domain.",
    "- A project may have multiple task lines under the same date and client; return each task separately.",
    "- Use the full TXT structure as-is. Do not invent new tasks.",
    `AMC client hints: ${clientHints.join(" | ")}`,
    "TXT content:",
    content,
  ].join("\n");

  const responseText = await callGroqChat(groqApiKey, prompt);
  const payload = parseAiJsonPayload(responseText);
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];

  return tasks
    .map((task, index) => normalizeAiTask(task, index + 1))
    .filter(Boolean);
}

async function callGroqChat(groqApiKey, prompt) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  let lastError = null;

  for (const model of GROQ_MODEL_CANDIDATES) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 6000,
          messages: [
            {
              role: "system",
              content:
                "You are a strict data extraction engine. Output only JSON and nothing else.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        lastError = new Error(`Groq API error (${response.status}): ${text}`);
        continue;
      }

      const parsed = safeJsonParse(text);
      const assistantText = parsed?.choices?.[0]?.message?.content;
      if (typeof assistantText === "string" && assistantText.trim()) {
        return assistantText.trim();
      }

      lastError = new Error("Groq API returned an empty response.");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to call Groq API.");
}

function parseAiJsonPayload(responseText) {
  const text = String(responseText ?? "").trim();
  if (!text) {
    throw new Error("Groq response was empty.");
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;
  const parsed = safeJsonParse(candidate);
  if (parsed) {
    return parsed;
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return safeJsonParse(candidate.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Groq response could not be parsed as JSON.");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function normalizeAiTask(task, fallbackIndex) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const date = String(task.date ?? "").trim();
  const clientName = String(task.clientName ?? "").trim();
  const description = String(task.description ?? "").trim();
  const minutes = Number.parseFloat(String(task.minutes ?? ""));

  if (!date || !clientName || !description || Number.isNaN(minutes)) {
    console.warn("Skipping invalid AI task at index", fallbackIndex, task);
    return null;
  }

  return createTaskEntry(date, clientName, description, minutes, description, "ai");
}

function parseStructuredTaskBlocks(content) {
  const lines = content.split(/\r?\n/);
  const tasks = [];
  let currentDate = "";
  let currentClient = "";
  let currentBlockLines = [];

  function commitCurrentBlock() {
    if (!currentDate || !currentClient || !currentBlockLines.length) {
      currentBlockLines = [];
      return;
    }

    const descriptions = splitStructuredClientTasks(currentBlockLines);
    for (const description of descriptions) {
      if (!description) {
        continue;
      }

      const minutes = resolveTaskMinutes(description);
      tasks.push(
        createTaskEntry(
          currentDate,
          currentClient,
          description,
          minutes,
          description,
          "local",
        ),
      );
    }
    currentBlockLines = [];
  }

  function commitClientTasks() {
    commitCurrentBlock();
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const preservedLine = String(rawLine ?? "").replace(/\r/g, "").trimEnd();
    if (!line) {
      continue;
    }

    if (isSeparatorLine(line)) {
      continue;
    }

    if (isStructuredDateLine(line)) {
      commitClientTasks();
      currentDate = line;
      currentClient = "";
      continue;
    }

    const clientMatch = isClientHeadingLine(line, {
      allowLooseMatch: !currentClient || !currentBlockLines.length,
    });
    if (clientMatch && currentDate) {
      commitClientTasks();
      currentClient = clientMatch;
      continue;
    }

    const compactClientTask = parseCompactClientTaskLine(line);
    if (compactClientTask && currentDate) {
      commitClientTasks();
      currentClient = compactClientTask.clientName;
      currentBlockLines = [compactClientTask.description];
      continue;
    }

    if (currentDate && currentClient) {
      if (!currentBlockLines.length) {
        currentBlockLines = [preservedLine];
      } else {
        currentBlockLines.push(preservedLine);
      }
    }
  }

  commitClientTasks();
  return tasks;
}

function splitStructuredClientTasks(lines = []) {
  const normalizedLines = lines
    .map((line) => String(line ?? "").replace(/\r/g, "").trimEnd())
    .filter((line) => line.trim());

  if (!normalizedLines.length) {
    return [];
  }

  const combinedText = normalizedLines
    .join("\n")
    .replace(/([.?!])\s+(?=\d+\.\s+)/g, "$1\n");

  if (!/(?:^|\n)\s*\d+\.\s+/m.test(combinedText)) {
    return [combinedText.trim()];
  }

  return combinedText
    .split(/\n(?=\s*\d+\.\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getLeadingWhitespaceWidth(value) {
  const match = String(value ?? "").match(/^\s*/);
  return match ? match[0].length : 0;
}

function splitTaskLine(line) {
  const pipeParts = line.split("|").map((part) => part.trim()).filter((part, index, arr) => part || index < arr.length - 1);
  if (pipeParts.length >= 3) {
    return pipeParts;
  }

  const tabParts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
  if (tabParts.length >= 3) {
    return tabParts;
  }

  const multiSpaceParts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
  if (multiSpaceParts.length >= 3) {
    return multiSpaceParts;
  }

  return [];
}

function shouldSkipTaskLine(line) {
  const normalized = line.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (/^[-_=|.\s]+$/.test(normalized)) {
    return true;
  }

  const looksLikeHeader =
    normalized.includes("date") &&
    normalized.includes("client") &&
    (normalized.includes("task") || normalized.includes("description"));

  return looksLikeHeader;
}

function isStructuredDateLine(line) {
  return /^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/.test(line.trim());
}

function isSeparatorLine(line) {
  return /^[-_=|.\s]+$/.test(line) || /^=+$/.test(line);
}

function isClientHeadingLine(line, options = {}) {
  const { allowLooseMatch = true } = options;
  const text = String(line).trim();
  if (!text || isStructuredDateLine(text) || isSeparatorLine(text)) {
    return null;
  }

  if (/^\d+\.\s*/.test(text)) {
    return null;
  }

  const numberedHeading = text.match(/^(?:\d+\)\s*)?(.+?)\s*-\s*$/);
  if (numberedHeading) {
    return numberedHeading[1].trim();
  }

  if (!allowLooseMatch) {
    return null;
  }

  const looksLikeShortProject = text.length <= 80 && !text.includes("://") && !/\b(min|mins?|hour|hours|hr|hrs)\b/i.test(text);
  if (looksLikeShortProject) {
    return text.replace(/\s*-\s*$/, "").trim();
  }

  return null;
}

function parseCompactClientTaskLine(line) {
  const text = String(line ?? "").trim();
  if (!text || isStructuredDateLine(text) || isSeparatorLine(text)) {
    return null;
  }

  const match = text.match(/^\d+\)\s*([a-z0-9][a-z0-9.&/ -]{1,60}?)\s*-\s*(.+)$/i);
  if (!match) {
    return null;
  }

  const clientName = match[1].trim().replace(/\s*-\s*$/, "");
  const description = match[2].trim();
  if (!clientName || !description) {
    return null;
  }

  if (description.includes("://") || description.length > 120) {
    return null;
  }

  return { clientName, description };
}

function resolveTaskMinutes(description) {
  const explicitMinutes = extractExplicitMinutes(description);
  if (!Number.isNaN(explicitMinutes)) {
    return explicitMinutes;
  }

  const text = String(description).toLowerCase();

  if (text.includes("blog upload") || text.includes("blog update") || text.includes("blog content and image") || text.includes("pfa blog content")) {
    return 45;
  }

  if (text.includes("banner upload") || text.includes("banner update") || text.includes("banner replace") || text.includes("banner add")) {
    return 30;
  }

  if (text.includes("vapt")) {
    return 120;
  }

  if (text.includes("file upload")) {
    return 30;
  }

  return 30;
}

function extractExplicitMinutes(description) {
  const text = String(description);
  const pattern = /(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|mins?|hr|hrs?|hour|hours)\b/gi;
  let match;
  let found = Number.NaN;

  while ((match = pattern.exec(text)) !== null) {
    const value = Number.parseFloat(match[1]);
    if (Number.isNaN(value)) {
      continue;
    }

    const unit = match[2].toLowerCase();
    found = unit.startsWith("hr") || unit.startsWith("hour") ? value * 60 : value;
  }

  return found;
}

function inferMinutesSource(description) {
  const explicitMinutes = extractExplicitMinutes(description);
  if (!Number.isNaN(explicitMinutes)) {
    return "explicit";
  }

  const text = String(description).toLowerCase();
  if (
    text.includes("blog upload") ||
    text.includes("blog update") ||
    text.includes("blog content and image") ||
    text.includes("pfa blog content") ||
    text.includes("banner upload") ||
    text.includes("banner update") ||
    text.includes("banner replace") ||
    text.includes("banner add") ||
    text.includes("vapt") ||
    text.includes("file upload")
  ) {
    return "rule";
  }

  return "default";
}

function createTaskEntry(date, clientName, description, minutes, rawLine, source = "local") {
  const explicitMinutes = extractExplicitMinutes(description);
  const resolvedMinutes = Number.isNaN(explicitMinutes) ? minutes : explicitMinutes;
  const rawDescription = String(description ?? "").trimEnd();
  const normalizedDescription = normalizeTaskDescription(rawDescription);
  const taskCategory = classifyTaskCategory(normalizedDescription);

  return {
    rawLine,
    date,
    clientName,
    clientKey: normalizeClientKey(clientName),
    description: rawDescription,
    normalizedDescription,
    minutes: resolvedMinutes,
    hours: resolvedMinutes / 60,
    source,
    minutesSource: Number.isNaN(explicitMinutes) ? inferMinutesSource(rawDescription) : "explicit",
    category: taskCategory.category,
    categoryMatchedKeyword: taskCategory.keyword,
  };
}

function normalizeTaskDescription(description) {
  const text = stripExplicitMinutesFromText(String(description ?? "").trim());
  const normalized = text.toLowerCase();

  if (normalized === "wordpress and plugin update") {
    return "Updated WordPress core and plugins to the latest versions and tested the website to ensure everything is working properly.";
  }

  if (normalized === "website backup") {
    return "Created and verified a full website backup (files and database) for security and recovery purposes.";
  }

  return text;
}

function getDisplayTaskDescription(description) {
  return stripLeadingTaskNumber(stripExplicitMinutesFromText(String(description ?? "")));
}

function classifyTaskCategory(description) {
  const text = String(description ?? "").trim().toLowerCase();
  if (!text) {
    return { category: "Other", keyword: "" };
  }

  let bestMatch = { category: "Other", keyword: "", score: 0 };

  for (const rule of TASK_CATEGORY_RULES) {
    if (rule.category === "Other") {
      continue;
    }

    for (const keyword of rule.keywords) {
      const normalizedKeyword = String(keyword).toLowerCase();
      if (!normalizedKeyword) {
        continue;
      }

      if (!matchesTaskKeyword(text, normalizedKeyword)) {
        continue;
      }

      const score = normalizedKeyword.split(/\s+/).length * 10 + normalizedKeyword.length;
      if (score > bestMatch.score) {
        bestMatch = { category: rule.category, keyword: normalizedKeyword, score };
      }
    }
  }

  return { category: bestMatch.category, keyword: bestMatch.keyword };
}

function matchesTaskKeyword(text, keyword) {
  const normalizedText = String(text ?? "").toLowerCase();
  const normalizedKeyword = String(keyword ?? "").trim().toLowerCase();

  if (!normalizedText || !normalizedKeyword) {
    return false;
  }

  const escapedKeyword = escapeRegExp(normalizedKeyword).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(^|[^a-z0-9])${escapedKeyword}([^a-z0-9]|$)`, "i");
  return pattern.test(normalizedText);
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTaskCategorySummary(tasks = [], options = {}) {
  const { includeAutoTasks = false } = options;
  const buckets = new Map();
  let totalMinutes = 0;

  for (const task of tasks) {
    if (!includeAutoTasks && task?.source === "auto") {
      continue;
    }

    const category = String(task?.category || "Other").trim() || "Other";
    const minutes = Number(task?.minutes) || 0;
    totalMinutes += minutes;
    const current = buckets.get(category) || { category, minutes: 0, tasks: 0 };
    current.minutes += minutes;
    current.tasks += 1;
    buckets.set(category, current);
  }

  const summary = [...buckets.values()].sort((left, right) => right.minutes - left.minutes || right.tasks - left.tasks || left.category.localeCompare(right.category));

  return summary.map((item) => ({
    ...item,
    percent: totalMinutes > 0 ? (item.minutes / totalMinutes) * 100 : 0,
  }));
}

function stripExplicitMinutesFromText(description) {
  const text = String(description ?? "");
  if (!text.trim()) {
    return "";
  }

  const withoutDurations = text.replace(/(?:\s*[-–—:|]?\s*)?(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|mins?|hr|hrs?|hour|hours)\b/gi, " ");
  const normalized = withoutDurations
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–—:|]\s*$/g, "")
    .trim();

  return normalized;
}

function stripLeadingTaskNumber(description) {
  return String(description ?? "").replace(/^\s*\d+\.\s*/, "");
}

function mergeTaskEntries(primaryTasks, secondaryTasks) {
  const merged = new Map();

  for (const task of primaryTasks) {
    merged.set(makeTaskMergeKey(task), task);
  }

  for (const task of secondaryTasks) {
    const key = makeTaskMergeKey(task);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, task);
      continue;
    }

    if (taskQualityScore(task) > taskQualityScore(existing)) {
      merged.set(key, task);
    }
  }

  return [...merged.values()];
}

function makeTaskMergeKey(task) {
  return `${normalizeDateKey(task.date)}|${normalizeClientKey(task.clientName)}|${normalizeTaskKey(task.description)}`;
}

function taskQualityScore(task) {
  let score = 0;

  if (task.source === "ai") {
    score += 40;
  } else if (task.source === "auto") {
    score += 10;
  }

  if (task.minutesSource === "explicit") {
    score += 100;
  } else if (task.minutesSource === "rule") {
    score += 25;
  }

  if (task.minutes !== 30) {
    score += 5;
  }

  return score;
}

function buildClientReports(amcRows, taskEntries, reportMonth = "") {
  const autoTasks = buildMonthlyAutoTasks(amcRows, taskEntries);
  const allTaskEntries = [...taskEntries, ...autoTasks].filter((task) => isDateInReportMonth(task.date, reportMonth));
  const groupedTasks = new Map();
  const clientIndex = amcRows.map((row) => ({
    row,
    aliases: buildClientAliases(row.clientName, row.clientKey),
  }));

  allTaskEntries.forEach((task) => {
    const matchedRow = resolveClientRowForTask(clientIndex, task.clientKey, task.clientName, task.description);
    if (!matchedRow) {
      return;
    }

    if (!isDateWithinAmcPeriod(task.date, matchedRow.startDateComparable, matchedRow.endDateComparable)) {
      return;
    }

    const groupKey = matchedRow.clientKey;

    if (!groupedTasks.has(groupKey)) {
      groupedTasks.set(groupKey, []);
    }
    groupedTasks.get(groupKey).push(task);
  });

  return amcRows
    .map((row) => {
      const tasks = groupedTasks.get(row.clientKey) || [];
      const normalizedTasks = tasks.map((task) => ({
        ...task,
        description: getDisplayTaskDescription(task.description),
      }));
      const reportableTasks = normalizedTasks.filter((task) => task.source !== "auto");
      const categorySummary = buildTaskCategorySummary(reportableTasks);
      const consumedMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0);
      const consumedHours = consumedMinutes / 60;
      const remainingHours = row.allocatedHours - consumedHours;
      const usagePct = row.allocatedHours === 0 ? 0 : (consumedHours / row.allocatedHours) * 100;
      const remainingPct = row.allocatedHours === 0 ? 0 : (remainingHours / row.allocatedHours) * 100;
      const usageBand = remainingHours < 0 ? "red" : remainingPct <= 20 ? "orange" : "green";
      const amcStatus = isExpired(row.endDateComparable) ? "Expired" : "Active";
      const topTaskCategory = categorySummary[0]?.category || "Other";
      const classifiedTaskCount = reportableTasks.filter((task) => task.category && task.category !== "Other").length;

      return {
        ...row,
        tasks: normalizedTasks,
        taskCategorySummary: categorySummary,
        topTaskCategory,
        classifiedTaskCount,
        consumedMinutes,
        consumedHours,
        remainingHours,
        usagePct,
        usageBand,
        amcStatus,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

function buildClientAliases(clientName, clientKey) {
  const aliases = new Set();
  const normalizedName = normalizeAliasText(clientName);
  const normalizedKey = normalizeAliasText(clientKey);

  if (normalizedName) {
    aliases.add(normalizedName);
  }
  if (normalizedKey) {
    aliases.add(normalizedKey);
  }

  const urlMatch = String(clientName ?? "").toLowerCase().match(/https?:\/\/([^\s/)\]]+)/i);
  const domain = urlMatch ? urlMatch[1] : String(clientName ?? "");
  const cleanedDomain = normalizeAliasText(domain);
  if (cleanedDomain) {
    aliases.add(cleanedDomain);
    aliases.add(cleanedDomain.replace(/\./g, ""));
  }

  const tokens = String(clientName ?? "")
    .toLowerCase()
    .replace(/https?:\/\/|www\./g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length) {
    aliases.add(tokens[0]);
    aliases.add(tokens.join(""));
  }

  return [...aliases].filter(Boolean);
}

function buildMonthlyAutoTasks(amcRows, existingTasks) {
  const generated = [];
  const existingKeys = new Set(
    existingTasks.map((task) => `${normalizeClientKey(task.clientName)}|${normalizeDateKey(task.date)}|${normalizeTaskKey(task.description)}`),
  );
  const today = new Date();
  const todayCutoff = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const fristamAliases = new Set(["fristam.in", "fristamin", "fristam"]);

  const autoTaskTemplates = [
    {
      description: "Wordpress Core File upgrade to latest version",
      minutes: 45,
    },
    {
      description: "Plugins upgraded to latest version and checked the compatibility issues",
      minutes: 45,
    },
  ];

  for (const row of amcRows) {
    const start = getComparableDate(row.startDateComparable);
    const end = getComparableDate(row.endDateComparable);
    if (!start || !end) {
      continue;
    }
    const rowAliases = buildClientAliases(row.clientName, row.clientKey);
    const isFristamProject = rowAliases.some((alias) => fristamAliases.has(alias));
    const autoTemplatesForRow = isFristamProject
      ? autoTaskTemplates.map((template) => ({ ...template, minutes: 30 }))
      : autoTaskTemplates;

    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

    while (cursor.getTime() <= end.getTime() && cursor.getTime() <= todayCutoff) {
      const dateForMonth = getLastFridayOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth());
      if (dateForMonth.getTime() < start.getTime()) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        continue;
      }
      if (dateForMonth.getTime() > end.getTime() || dateForMonth.getTime() > todayCutoff) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        continue;
      }

      const dateLabel = formatGeneratedTaskDate(dateForMonth);

      for (const template of autoTemplatesForRow) {
        const taskKey = `${row.clientKey}|${normalizeDateKey(dateLabel)}|${normalizeTaskKey(template.description)}`;
        if (existingKeys.has(taskKey)) {
          continue;
        }

        existingKeys.add(taskKey);
        generated.push(
          createTaskEntry(
            dateLabel,
            row.clientName,
            template.description,
            template.minutes,
            template.description,
            "auto",
          ),
        );
      }

      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return generated;
}

function getLastFridayOfMonth(year, monthIndex) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const dayOfWeek = lastDay.getUTCDay();
  const daysBack = (dayOfWeek - 5 + 7) % 7;
  lastDay.setUTCDate(lastDay.getUTCDate() - daysBack);
  return lastDay;
}

function getComparableDate(comparableDate) {
  if (Number.isNaN(comparableDate)) {
    return null;
  }

  return new Date(comparableDate);
}

function formatGeneratedTaskDate(date) {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function compareTasksByDateDescending(left, right) {
  const leftComparable = normalizeDateComparable(left?.date);
  const rightComparable = normalizeDateComparable(right?.date);

  if (!Number.isNaN(leftComparable) && !Number.isNaN(rightComparable)) {
    if (leftComparable !== rightComparable) {
      return rightComparable - leftComparable;
    }
  } else if (!Number.isNaN(leftComparable)) {
    return -1;
  } else if (!Number.isNaN(rightComparable)) {
    return 1;
  }

  return String(right?.date ?? "").localeCompare(String(left?.date ?? ""));
}

function normalizeDateKey(value) {
  const parsed = normalizeDateComparable(value);
  if (Number.isNaN(parsed)) {
    return String(value ?? "").trim().toLowerCase();
  }

  const date = new Date(parsed);
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

function normalizeTaskKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveClientRowForTask(clientIndex, taskKey, rawTaskClientName, taskDescription = "") {
  const taskAliases = buildTaskAliases(taskKey, rawTaskClientName, taskDescription);
  let bestMatch = null;
  let bestScore = 0;

  for (const entry of clientIndex) {
    const score = scoreClientMatch(entry.aliases, taskAliases);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry.row;
    }
  }

  return bestScore >= 80 ? bestMatch : null;
}

function buildTaskAliases(taskKey, rawTaskClientName, taskDescription = "") {
  const aliases = new Set();
  [taskKey, rawTaskClientName].forEach((value) => {
    const alias = normalizeAliasText(value);
    if (alias) {
      aliases.add(alias);
      aliases.add(alias.replace(/\./g, ""));
    }
  });

  for (const domain of extractTaskDomains(taskDescription)) {
    const alias = normalizeAliasText(domain);
    if (alias) {
      aliases.add(alias);
      aliases.add(alias.replace(/\./g, ""));
    }
  }

  return [...aliases].filter(Boolean);
}

function scoreClientMatch(clientAliases, taskAliases) {
  let score = 0;
  const clientSet = clientAliases.map((alias) => normalizeAliasText(alias));
  const taskSet = taskAliases.map((alias) => normalizeAliasText(alias));

  for (const taskAlias of taskSet) {
    for (const clientAlias of clientSet) {
      if (!taskAlias || !clientAlias) {
        continue;
      }

      const compactTaskAlias = canonicalAlias(taskAlias);
      const compactClientAlias = canonicalAlias(clientAlias);

      if (taskAlias === clientAlias) {
        score = Math.max(score, 100);
        continue;
      }

      if (compactTaskAlias === compactClientAlias) {
        score = Math.max(score, 98);
        continue;
      }

      if (
        compactTaskAlias.length >= 5 &&
        compactClientAlias.length >= 5 &&
        (compactClientAlias.includes(compactTaskAlias) || compactTaskAlias.includes(compactClientAlias))
      ) {
        score = Math.max(score, 85);
      }
    }
  }

  return score;
}

function normalizeAliasText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^m\./, "")
    .replace(/\/.*$/, "")
    .replace(/\?.*$/, "")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function canonicalAlias(value) {
  return normalizeAliasText(value).replace(/[^a-z0-9]+/g, "");
}

function extractTaskDomains(text) {
  const value = String(text ?? "");
  if (!value) {
    return [];
  }

  const matches = [];
  const urlPattern = /https?:\/\/([^\s/)\],'"'"'"<>]+)/gi;
  let match;

  while ((match = urlPattern.exec(value)) !== null) {
    const host = String(match[1] || "").toLowerCase().replace(/^www\./, "");
    if (host) {
      matches.push(host);
    }
  }

  const hostPattern = /\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi;
  while ((match = hostPattern.exec(value)) !== null) {
    const host = String(match[0] || "").toLowerCase().replace(/^www\./, "");
    if (host) {
      matches.push(host);
    }
  }

  return [...new Set(matches)];
}

function normalizeSearchQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isExpired(endDateComparable) {
  if (Number.isNaN(endDateComparable)) {
    return false;
  }

  const today = new Date();
  const todayComparable = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return todayComparable > endDateComparable;
}

function formatAmcEndDateDisplay(endDateDisplay, endDateComparable) {
  const baseValue = String(endDateDisplay ?? "").trim();
  if (!baseValue) {
    return baseValue;
  }

  return baseValue;
}

function getAmcCountdownText(endDateDisplay, endDateComparable) {
  const remainingDays = getCalendarDaysRemaining(endDateDisplay, endDateComparable);
  if (remainingDays === null) {
    return "";
  }

  if (remainingDays >= 0 && remainingDays <= 5) {
    const suffix = remainingDays === 1 ? "day" : "days";
    return `${remainingDays} ${suffix} left`;
  }

  return "";
}

function renderSummaryCards(reports) {
  const totals = reports.reduce(
    (acc, report) => {
      acc.clients += 1;
      acc.allocated += report.allocatedHours;
      acc.consumed += report.consumedHours;
      acc.remaining += report.remainingHours;
      return acc;
    },
    { clients: 0, allocated: 0, consumed: 0, remaining: 0 },
  );
  const allTasks = reports.flatMap((report) => report.tasks || []);
  const reportableTasks = allTasks.filter((task) => task.source !== "auto");
  const taskCategorySummary = buildTaskCategorySummary(reportableTasks);
  const totalClassifiedTasks = reportableTasks.filter((task) => task.category && task.category !== "Other").length;
  const topTaskCategory = taskCategorySummary[0]?.category || "No tasks yet";

  const cards = [
    {
      label: "Total Clients",
      value: totals.clients.toString(),
      help: "How many AMC clients are included in this report.",
    },
    {
      label: "Total Allocated Hours",
      value: formatHours(totals.allocated),
      help: "The full AMC hours promised to all clients in this report.",
    },
    {
      label: "Total Consumed Hours",
      value: formatHours(totals.consumed),
      help: "The hours already used by the tasks in the report.",
    },
    {
      label: "Total Remaining Hours",
      value: formatHours(totals.remaining),
      help: "The AMC hours still left after subtracting the consumed time.",
    },
    {
      label: "Top Task Category",
      value: topTaskCategory,
      help: "The category with the most time spent in the visible report.",
    },
    {
      label: "Classified Tasks",
      value: reportableTasks.length ? `${totalClassifiedTasks}/${reportableTasks.length}` : "0/0",
      help: "How many real uploaded tasks were recognized into a category.",
    },
  ];

  elements.summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card" title="${escapeHtml(card.help)}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderMainTable(reports) {
  const query = normalizeSearchQuery(state.searchQuery);
  const filteredReports = query
    ? reports.filter((report) => normalizeSearchQuery(report.clientName).includes(query))
    : reports;

  if (!filteredReports.length) {
    elements.reportTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">No clients matched your search.</td>
      </tr>
    `;
    return;
  }

  elements.reportTableBody.innerHTML = filteredReports
    .map(
      (report) => `
        <tr data-client-key="${escapeHtml(report.clientKey)}" title="Open the detailed view for ${escapeHtml(report.clientName)}.">
          <td>${escapeHtml(report.clientName)}</td>
          <td>${escapeHtml(report.startDateDisplay)}</td>
          <td>${escapeHtml(formatAmcEndDateDisplay(report.endDateDisplay, report.endDateComparable))}</td>
          <td>${escapeHtml(formatHours(report.allocatedHours))}</td>
          <td>${escapeHtml(formatHours(report.consumedHours))}</td>
          <td>${escapeHtml(formatHours(report.remainingHours))}</td>
          <td>${escapeHtml(formatPercentage(report.usagePct))}</td>
          <td>
            <div class="status-cell">
              <span class="status-chip ${report.amcStatus === "Expired" ? "red" : report.usageBand}">
                ${escapeHtml(report.amcStatus)}
              </span>
              ${
                getAmcCountdownText(report.endDateDisplay, report.endDateComparable)
                  ? `<span class="status-countdown">${escapeHtml(getAmcCountdownText(report.endDateDisplay, report.endDateComparable))}</span>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  [...elements.reportTableBody.querySelectorAll("tr")].forEach((row) => {
    row.addEventListener("click", () => openClientModal(row.dataset.clientKey));
  });
}

function openClientModal(clientKey) {
  const report = state.clientMap.get(clientKey);
  if (!report) {
    return;
  }

  state.selectedClient = report;
  state.clientModalMonth = isValidReportMonth(state.reportMonth) ? state.reportMonth : "";
  renderClientModal(report);
  elements.detailModal.classList.remove("hidden");
  elements.detailModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  elements.detailModal.classList.add("hidden");
  elements.detailModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function buildClientMonthOptions(report) {
  return getMonthKeysBetween(report.startDateComparable, report.endDateComparable);
}

function getClientModalMonth(report) {
  const monthOptions = buildClientMonthOptions(report);
  if (isValidReportMonth(state.clientModalMonth) && monthOptions.includes(state.clientModalMonth)) {
    return state.clientModalMonth;
  }
  if (isValidReportMonth(state.reportMonth) && monthOptions.includes(state.reportMonth)) {
    return state.reportMonth;
  }
  return "";
}

function getClientModalTasks(report, month = "") {
  const reportableTasks = report.tasks || [];
  if (!isValidReportMonth(month)) {
    return reportableTasks;
  }

  return reportableTasks.filter((task) => isDateInReportMonth(task.date, month));
}

function buildClientModalReportView(report, month = "") {
  const selectedMonth = isValidReportMonth(month) ? month : "";
  const allTasks = report.tasks || [];
  const scopedTasks = selectedMonth ? allTasks.filter((task) => isDateInReportMonth(task.date, selectedMonth)) : allTasks;
  const categorySummary = buildTaskCategorySummary(scopedTasks, { includeAutoTasks: true });
  const consumedMinutes = scopedTasks.reduce((sum, task) => sum + task.minutes, 0);
  const consumedHours = consumedMinutes / 60;
  const scopedRemainingHours = report.allocatedHours - consumedHours;
  const overallReport = getOverallClientReport(report);
  const remainingHours = overallReport.remainingHours;
  const usagePct = report.allocatedHours === 0 ? 0 : (consumedHours / report.allocatedHours) * 100;
  const remainingPct = report.allocatedHours === 0 ? 0 : (scopedRemainingHours / report.allocatedHours) * 100;
  const usageBand = scopedRemainingHours < 0 ? "red" : remainingPct <= 20 ? "orange" : "green";
  const topTaskCategory = categorySummary[0]?.category || "Other";
  const classifiedTaskCount = scopedTasks.filter((task) => task.category && task.category !== "Other").length;

  return {
    ...report,
    tasks: scopedTasks,
    reportableTasks: scopedTasks,
    taskCategorySummary: categorySummary,
    topTaskCategory,
    classifiedTaskCount,
    consumedMinutes,
    consumedHours,
    remainingHours,
    usagePct,
    usageBand,
    selectedMonth,
  };
}

function renderClientModal(report) {
  const monthOptions = buildClientMonthOptions(report);
  const selectedMonth = getClientModalMonth(report);
  const modalReport = buildClientModalReportView(report, selectedMonth);
  const clientTasks = modalReport.reportableTasks || [];
  const categorySummary = modalReport.taskCategorySummary || [];
  const selectedMonthLabel = selectedMonth ? formatReportMonthLabel(selectedMonth) : "All Months";
  const reportPeriodLine = state.reportMonth
    ? `<p class="subtle">Report Period: ${escapeHtml(formatReportMonthLabel(state.reportMonth))}</p>`
    : "";
  const monthDropdownMarkup = `
    <div class="modal-month-filter">
      <label class="report-filter-field modal-month-field">
        <span class="drive-label">Month View</span>
        <select id="clientMonthInput" class="report-month-select">
          <option value="">All Months</option>
          ${monthOptions
            .map((monthKey) => `<option value="${monthKey}" ${monthKey === selectedMonth ? "selected" : ""}>${escapeHtml(formatReportMonthLabel(monthKey))}</option>`)
            .join("")}
        </select>
      </label>
      <p class="report-filter-note modal-month-note">Select a month to show only that month’s tasks and export the same month in PDF.</p>
      <p class="subtle modal-month-scope">Viewing: ${escapeHtml(selectedMonthLabel)}</p>
    </div>
  `;
  const categorySummaryMarkup = categorySummary.length
    ? `
      <section class="category-summary">
        ${categorySummary
          .map(
            (item) => `
              <article class="category-card" title="This category groups tasks that belong to the same type of work.">
                <span>${escapeHtml(item.category)}</span>
                <strong>${escapeHtml(formatMinutes(item.minutes))}</strong>
                <small>${escapeHtml(String(item.tasks))} task${item.tasks === 1 ? "" : "s"} | ${escapeHtml(formatPercentage(item.percent))}</small>
              </article>
            `,
          )
          .join("")}
      </section>
    `
    : "";
  elements.modalContent.innerHTML = `
    <div class="detail-actions">
      <div>
        <p class="eyebrow">Client Detail View</p>
        <h2 class="modal-title">${escapeHtml(report.clientName)}</h2>
        <p class="subtle">AMC Period: ${escapeHtml(report.startDateDisplay)} to ${escapeHtml(formatAmcEndDateDisplay(report.endDateDisplay, report.endDateComparable))}</p>
        ${reportPeriodLine}
        ${monthDropdownMarkup}
      </div>
      <div>
        <span class="pill ${report.amcStatus === "Expired" ? "expired" : modalReport.usageBand === "green" ? "active" : "warning"}">
          ${escapeHtml(report.amcStatus)}
        </span>
        <button id="clientPdfBtn" class="btn btn-primary" title="Export a PDF for the month currently selected in this popup.">Generate Individual Client PDF</button>
      </div>
    </div>

    <section class="detail-grid">
      <article class="detail-stat" title="The AMC hours agreed with this client.">
        <span>Allocated Hours</span>
        <strong>${escapeHtml(formatHours(report.allocatedHours))}</strong>
      </article>
      <article class="detail-stat" title="The hours already used by this client’s tasks.">
        <span>Consumed Hours</span>
        <strong>${escapeHtml(formatHours(modalReport.consumedHours))}</strong>
      </article>
      <article class="detail-stat" title="The hours still available in the AMC.">
        <span>Remaining Hours</span>
        <strong>${escapeHtml(formatHours(modalReport.remainingHours))}</strong>
      </article>
      <article class="detail-stat" title="How much of the AMC has already been used.">
        <span>Usage %</span>
        <strong>${escapeHtml(formatPercentage(modalReport.usagePct))}</strong>
      </article>
      <article class="detail-stat" title="The total task time counted in minutes.">
        <span>Total Minutes</span>
        <strong>${escapeHtml(formatMinutes(modalReport.consumedMinutes))}</strong>
      </article>
      <article class="detail-stat" title="The task category with the highest time for this client.">
        <span>Top Category</span>
        <strong>${escapeHtml(modalReport.topTaskCategory || "Other")}</strong>
      </article>
    </section>

    ${categorySummaryMarkup}

    <div class="table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th class="col-date">Date</th>
            <th>Task Description</th>
            <th class="col-category">Category</th>
            <th class="col-minutes">Minutes</th>
          </tr>
        </thead>
        <tbody>
          ${
            clientTasks.length
              ? [...clientTasks]
                  .sort(compareTasksByDateDescending)
                  .map(
                    (task) => `
                      <tr>
                        <td class="col-date">${escapeHtml(task.date)}</td>
                        <td class="task-description">${escapeHtml(getDisplayTaskDescription(task.description))}</td>
                        <td class="col-category">
                          <span class="category-chip">${escapeHtml(task.category || "Other")}</span>
                        </td>
                        <td class="col-minutes">${escapeHtml(formatMinutes(task.minutes))}</td>
                      </tr>
                    `,
                  )
                  .join("")
              : `
                <tr>
                  <td colspan="4">No task entries were found for this client in the selected month.</td>
                </tr>
              `
          }
        </tbody>
      </table>
    </div>

    <section class="totals-bar">
      <article class="detail-stat">
        <span>Total Minutes</span>
        <strong>${escapeHtml(formatMinutes(modalReport.consumedMinutes))}</strong>
      </article>
      <article class="detail-stat">
        <span>Total Hours</span>
        <strong>${escapeHtml(formatHours(modalReport.consumedHours))}</strong>
      </article>
      <article class="detail-stat">
        <span>Remaining Hours</span>
        <strong>${escapeHtml(formatHours(modalReport.remainingHours))}</strong>
      </article>
    </section>
  `;

  document.getElementById("clientMonthInput")?.addEventListener("change", (event) => {
    state.clientModalMonth = isValidReportMonth(event.target.value) ? event.target.value : "";
    renderClientModal(report);
  });

  document.getElementById("clientPdfBtn").addEventListener("click", () => generateClientPdf(report, getClientModalMonth(report)));
}

async function generateSummaryPdf() {
  if (!state.reports.length) {
    showMessage("Generate the report before exporting the summary PDF.", true);
    return;
  }

  if (!isPdfReady()) {
    showMessage("PDF library is not available yet. Please wait a moment and try again.", true);
    return;
  }

  const doc = createPdfDocument("landscape");
  const generatedDate = new Date().toLocaleDateString("en-GB");
  const reportPeriodLabel = state.reportMonth ? formatReportMonthLabel(state.reportMonth) : "All Months";

  const summaryHeaderBottom = await drawDocumentPdfHeader(doc, {
    title: "AMC Hours Utilization Report",
    subtitle: `Generated Date: ${generatedDate}`,
    metaLines: [`Report Period: ${reportPeriodLabel}`],
  });

  const totals = state.reports.reduce(
    (acc, report) => {
      acc.allocated += report.allocatedHours;
      acc.consumed += report.consumedHours;
      acc.remaining += report.remainingHours;
      return acc;
    },
    { allocated: 0, consumed: 0, remaining: 0 },
  );
  const overallTasks = state.reports.flatMap((report) => report.tasks || []);
  const overallCategorySummary = buildTaskCategorySummary(overallTasks.filter((task) => task.source !== "auto")).slice(0, 3);

  doc.setFontSize(10.5);
  doc.setTextColor(78, 90, 104);
  doc.text(
    `Summary: Allocated ${formatHours(totals.allocated)} | Consumed ${formatHours(totals.consumed)} | Remaining ${formatHours(totals.remaining)}`,
    14,
    summaryHeaderBottom + 5,
  );

  if (overallCategorySummary.length) {
    const categoryLine = overallCategorySummary
      .map((item) => `${item.category}: ${formatMinutes(item.minutes)} (${formatPercentage(item.percent)})`)
      .join(" | ");
    doc.setFontSize(9.4);
    doc.setTextColor(86, 99, 112);
    doc.text(`Top categories: ${categoryLine}`, 14, summaryHeaderBottom + 11.2);
  }

  doc.autoTable({
    startY: summaryHeaderBottom + (overallCategorySummary.length ? 18 : 13),
    head: [[
      "Client Name",
      "AMC Start Date",
      "AMC End Date",
      "Allocated Hours",
      "Consumed Hours",
      "Remaining Hours",
      "Usage %",
      "AMC Status",
    ]],
    body: state.reports.map((report) => [
      report.clientName,
      report.startDateDisplay,
      formatAmcEndDateDisplay(report.endDateDisplay, report.endDateComparable),
      formatHours(report.allocatedHours),
      formatHours(report.consumedHours),
      formatHours(report.remainingHours),
      formatPercentage(report.usagePct),
      report.amcStatus,
    ]),
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4.2, lineColor: [216, 221, 228], lineWidth: 0.1, textColor: [40, 50, 62] },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    didDrawPage: addPdfFooter,
  });

  const periodSlug = state.reportMonth ? `-${slugify(reportPeriodLabel)}` : "-all-months";
  doc.save(`amc-hours-summary${periodSlug}-${timestampSlug()}.pdf`);
}

async function generateClientPdf(report, month = "") {
  if (!isPdfReady()) {
    showMessage("PDF library is not available yet. Please wait a moment and try again.", true);
    return;
  }

  const doc = createPdfDocument("portrait");
  doc.__customClientFooter = true;
  const selectedMonth = isValidReportMonth(month) ? month : "";
  const scopedReport = buildClientModalReportView(report, selectedMonth);
  const overallReport = getOverallClientReport(report);
  const reportPeriodLabel = selectedMonth
    ? formatReportMonthLabel(selectedMonth)
    : state.reportMonth
      ? formatReportMonthLabel(state.reportMonth)
      : `${report.startDateDisplay} - ${formatAmcEndDateDisplay(report.endDateDisplay, report.endDateComparable)}`;
  const clientTasks = scopedReport.reportableTasks || [];
  const totalMinutes = scopedReport.consumedMinutes;
  const logoDataUrl = await getIkfLogoDataUrl();
  const clientHeaderBottom = await drawReferenceStyleClientPdfHeader(doc, scopedReport, {
    logoDataUrl,
    reportPeriodLabel: selectedMonth ? `Monthly Activity Summary | ${reportPeriodLabel}` : reportPeriodLabel,
  });

  doc.autoTable({
    startY: clientHeaderBottom + 4,
    head: [["DATE", "DESCRIPTION", "TYPE", "MIN"]],
    body: clientTasks.length
      ? [...clientTasks].sort(compareTasksByDateDescending).map((task) => [
          task.date,
          getDisplayTaskDescription(task.description),
          getTaskTypeLabel(task.description),
          formatMinutes(task.minutes),
        ])
    : [["-", "No task entries found for this client.", "-", "-"]],
    theme: "grid",
    styles: { fontSize: 8.15, cellPadding: 3.05, lineColor: [224, 229, 235], lineWidth: 0.1, valign: "top", textColor: [45, 56, 69], fillColor: [255, 255, 255] },
    headStyles: { fillColor: [31, 47, 66], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: [243, 247, 252] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 30, halign: "left", overflow: "hidden" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28, halign: "center" },
      3: { cellWidth: 18, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2 && data.cell.raw && data.cell.raw !== "-") {
        data.cell.text = [""];
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 2 || !data.cell.raw || data.cell.raw === "-") {
        return;
      }

      const label = String(data.cell.raw);
      const isUpdate = label.toLowerCase() === "update";
      const fill = isUpdate ? [247, 213, 168] : [217, 232, 251];
      const text = isUpdate ? [165, 101, 22] : [60, 113, 183];
      const pillWidth = Math.min(data.cell.width - 7, Math.max(14, label.length * 2.4 + 7));
      const pillHeight = 7.2;
      const pillX = data.cell.x + (data.cell.width - pillWidth) / 2;
      const pillY = data.cell.y + (data.cell.height - pillHeight) / 2;

      data.doc.setFillColor(...fill);
      data.doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 3.2, 3.2, "F");
      data.doc.setTextColor(...text);
      data.doc.setFont("helvetica", "bold");
      data.doc.setFontSize(7.3);
      data.doc.text(label, data.cell.x + data.cell.width / 2, pillY + 4.85, { align: "center" });
    },
    didDrawPage: addPdfFooter,
  });

  const lastPageNumber = doc.getNumberOfPages();
  doc.setPage(lastPageNumber);
  const lastPageHeight = doc.internal.pageSize.getHeight();
  drawClientPdfTotalsRow(doc, {
    totalMinutes,
    totalHours: totalMinutes / 60,
    remainingHours: overallReport.remainingHours,
    reportPeriodLabel,
  });

  const periodSlug = selectedMonth ? `-${slugify(reportPeriodLabel)}` : "-all-months";
  doc.save(`${slugify(report.clientName)}-amc-report${periodSlug}-${timestampSlug()}.pdf`);
}

function getOverallClientReport(report) {
  if (!report) {
    return report;
  }

  if (!state.amcRows.length || !state.taskEntries.length) {
    return report;
  }

  return buildClientReports(state.amcRows, state.taskEntries, "").find((item) => item.clientKey === report.clientKey) || report;
}

async function drawReferenceStyleClientPdfHeader(doc, report, { logoDataUrl = "", reportPeriodLabel = "" } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const bandHeight = 34;
  const detailsTop = bandHeight + 18;
  const lineColor = [219, 225, 232];
  const textDark = [34, 46, 58];
  const textMuted = [98, 111, 126];
  const bandColor = [27, 43, 62];
  const bandAccent = [214, 166, 76];

  doc.setFillColor(...bandColor);
  doc.rect(0, 0, pageWidth, bandHeight, "F");
  doc.setFillColor(...bandAccent);
  doc.rect(0, bandHeight - 1.2, pageWidth, 1.2, "F");

  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const ratio = props.width / props.height;
      const logoH = 14;
      const logoW = logoH * ratio;
      doc.addImage(logoDataUrl, "PNG", marginX, 9, Math.min(40, logoW), logoH, undefined, "FAST");
    } catch (error) {
      console.warn("Unable to draw IKF logo in client PDF header.", error);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("AMC Client Report", pageWidth / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.1);
  doc.setTextColor(240, 244, 248);
  doc.text(reportPeriodLabel || "Monthly Activity Summary", pageWidth / 2, 24, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.2);
  doc.setTextColor(...textDark);
  doc.text(report.clientName, pageWidth / 2, bandHeight + 11, { align: "center" });

  const detailItems = [
    ["CLIENT", [report.clientName]],
    ["AMC START", [report.startDateDisplay]],
    ["AMC END", [formatAmcEndDateDisplay(report.endDateDisplay, report.endDateComparable)]],
    ["PREPARED BY", ["I Knowledge Factory Pvt. Ltd.", "AMC Team"]],
  ];
  const sectionWidth = pageWidth - marginX * 2;
  const detailGap = 3;
  const columnWidth = (sectionWidth - detailGap * 3) / 4;
  const detailLabelColor = [110, 120, 132];
  const detailValueColor = [31, 43, 57];
  const detailLabelY = detailsTop + 6;
  const detailValueY = detailsTop + 13.5;
  const preparedByLines = doc.splitTextToSize("I Knowledge Factory Pvt. Ltd.", columnWidth - 6);
  const preparedByLineHeight = 4.2;
  const preparedByBlockHeight = preparedByLines.length * preparedByLineHeight + preparedByLineHeight + 3.2;
  const detailCardHeight = Math.max(21, 10 + preparedByBlockHeight);

  detailItems.forEach((item, index) => {
    const x = marginX + index * (columnWidth + detailGap);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...lineColor);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, detailsTop, columnWidth, detailCardHeight, 2.2, 2.2, "FD");
    doc.setFillColor(...bandAccent);
    doc.rect(x, detailsTop, columnWidth, 1.2, "F");

    doc.setTextColor(...detailLabelColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text(item[0], x + 3, detailLabelY);

    doc.setTextColor(...detailValueColor);
    doc.setFont("helvetica", "bold");
    if (index === 3) {
      doc.setFontSize(8.5);
      preparedByLines.forEach((line, lineIndex) => {
        doc.text(line, x + 3, detailValueY + lineIndex * preparedByLineHeight);
      });
      doc.text(item[1][1], x + 3, detailValueY + preparedByLines.length * preparedByLineHeight + 1.2);
    } else {
      doc.setFontSize(10.8);
      doc.text(item[1][0], x + 3, detailValueY);
    }
  });

  const activityTitleY = detailsTop + detailCardHeight + 8;
  const activitySubY = activityTitleY + 5.2;

  doc.setTextColor(40, 52, 66);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.2);
  doc.text("Activity Log", marginX, activityTitleY);

  return activitySubY + 4;
}

function drawClientPdfTotalsRow(doc, { totalMinutes = 0, totalHours = 0, remainingHours = 0, reportPeriodLabel = "" } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const gap = 4;
  const cardY = pageHeight - 34;
  const cardHeight = 18;
  const cardWidth = (pageWidth - marginX * 2 - gap * 2) / 3;
  const cards = [
    { label: "TOTAL MINUTES", value: formatMinutes(totalMinutes), fill: [31, 47, 66], text: [255, 255, 255], accent: [214, 166, 76] },
    { label: "TOTAL HOURS", value: formatHours(totalHours), fill: [255, 255, 255], text: [31, 47, 66], accent: [213, 219, 225] },
    { label: "REMAINING HOURS", value: formatHours(remainingHours), fill: [214, 166, 76], text: [31, 47, 66], accent: [31, 47, 66] },
  ];

  cards.forEach((card, index) => {
    const x = marginX + index * (cardWidth + gap);
    doc.setFillColor(...card.fill);
    doc.setDrawColor(205, 213, 223);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 2.2, 2.2, "FD");
    doc.setFillColor(...card.accent);
    doc.rect(x, cardY, index === 2 ? 1.4 : cardWidth, index === 2 ? cardHeight : 1.2, "F");

    doc.setTextColor(...card.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.1);
    doc.text(card.label, x + cardWidth / 2, cardY + 5.7, { align: "center" });
    doc.setFontSize(16);
    doc.text(card.value, x + cardWidth / 2, cardY + 14.2, { align: "center" });
  });

  doc.setTextColor(98, 111, 126);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  doc.text("I Knowledge Factory Pvt. Ltd.  |  craft | care | amplify", marginX, pageHeight - 4.8);
  doc.setFont("helvetica", "bold");
  doc.text(`AMC REPORT  |  ${reportPeriodLabel || ""}`, pageWidth - marginX, pageHeight - 4.8, { align: "right" });
}

function getCalendarDaysRemaining(endDateDisplay, endDateComparable) {
  const todayParts = getTodayDateParts();
  const endParts = parseCalendarDateParts(endDateDisplay) || parseComparableDateParts(endDateComparable);
  if (!endParts) {
    return null;
  }

  const todayComparable = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const endComparable = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.max(0, Math.round((endComparable - todayComparable) / 86400000));
}

function getTodayDateParts() {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

function parseComparableDateParts(comparableDate) {
  if (Number.isNaN(comparableDate)) {
    return null;
  }

  const date = new Date(comparableDate);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function parseCalendarDateParts(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const ddMmmYyyyMatch = text.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{4})$/);
  if (ddMmmYyyyMatch) {
    const [, day, monthText, year] = ddMmmYyyyMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      return { day: Number(day), month: monthIndex + 1, year: Number(year) };
    }
  }

  const ddMmmYyMatch = text.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{2})$/);
  if (ddMmmYyMatch) {
    const [, day, monthText, year] = ddMmmYyMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      const yearNumber = Number(year);
      const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
      return { day: Number(day), month: monthIndex + 1, year: fullYear };
    }
  }

  const ddMmYyyyMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    return { day: Number(day), month: Number(month), year: Number(year) };
  }

  const ddMmYyMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (ddMmYyMatch) {
    const [, day, month, year] = ddMmYyMatch;
    const yearNumber = Number(year);
    const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
    return { day: Number(day), month: Number(month), year: fullYear };
  }

  const ddSlashMmSlashYyyyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddSlashMmSlashYyyyMatch) {
    const [, day, month, year] = ddSlashMmSlashYyyyMatch;
    return { day: Number(day), month: Number(month), year: Number(year) };
  }

  const ddSlashMmSlashYyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ddSlashMmSlashYyMatch) {
    const [, day, month, year] = ddSlashMmSlashYyMatch;
    const yearNumber = Number(year);
    const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
    return { day: Number(day), month: Number(month), year: fullYear };
  }

  const yyyyMmDdMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyyMmDdMatch) {
    const [, year, month, day] = yyyyMmDdMatch;
    return { day: Number(day), month: Number(month), year: Number(year) };
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      day: parsed.getDate(),
      month: parsed.getMonth() + 1,
      year: parsed.getFullYear(),
    };
  }

  return null;
}

function getTaskTypeLabel(description) {
  const text = String(description ?? "").toLowerCase();
  if (text.includes("backup")) {
    return "Backup";
  }
  if (text.includes("update")) {
    return "Update";
  }
  if (text.includes("upload")) {
    return "Upload";
  }
  return "Task";
}

function getCoverageMonths(startComparable, endComparable) {
  const startDate = getComparableDate(startComparable);
  const endDate = getComparableDate(endComparable);
  if (!startDate || !endDate) {
    return 0;
  }

  const months = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - startDate.getUTCMonth()) + 1;
  return Math.max(0, months);
}

function createPdfDocument(orientation = "landscape") {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

function isPdfReady() {
  return Boolean(window.jspdf?.jsPDF);
}

async function drawDocumentPdfHeader(doc, { title, subtitle, metaLines = [], preparedByTitle = "Prepared by", preparedByLines = ["I Knowledge Factory Pvt. Ltd.", "AMC Team"] }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const isLandscape = pageWidth > 240;
  const logoDataUrl = await getIkfLogoDataUrl();
  const marginX = 14;
  const heroY = 0;
  const heroHeight = isLandscape ? 30 : 34;
  const detailTop = heroHeight;
  const detailHeight = isLandscape ? 40 : 48;
  const bandColor = [27, 43, 62];
  const bandAccent = [214, 166, 76];
  const detailFill = [248, 250, 252];
  const detailBorder = [221, 227, 235];
  const textLight = [247, 249, 251];
  const textMuted = [203, 213, 223];
  const logoBoxWidth = isLandscape ? 56 : 48;
  const logoBoxHeight = isLandscape ? 18 : 16;
  const logoX = marginX;
  const logoY = heroY + 6;
  const titleX = marginX + logoBoxWidth + 12;
  const titleY = heroY + 14;
  const subtitleY = titleY + 6.4;
  const leftColumnX = marginX;
  const leftColumnWidth = isLandscape ? 118 : 92;
  const rightColumnX = pageWidth * 0.62;
  const detailBottom = detailTop + detailHeight;
  const headerBottom = detailBottom + 4;

  doc.setFillColor(...bandColor);
  doc.rect(0, heroY, pageWidth, heroHeight, "F");
  doc.setFillColor(...bandAccent);
  doc.rect(0, heroY + heroHeight - 1.2, pageWidth, 1.2, "F");
  doc.setFillColor(...detailFill);
  doc.rect(0, detailTop, pageWidth, detailHeight, "F");
  doc.setDrawColor(...detailBorder);
  doc.setLineWidth(0.2);
  doc.line(marginX, detailTop, pageWidth - marginX, detailTop);
  doc.line(marginX, detailBottom, pageWidth - marginX, detailBottom);

  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const ratio = props.width / props.height;
      const boxRatio = logoBoxWidth / logoBoxHeight;
      let logoWidth = logoBoxWidth;
      let logoHeight = logoBoxHeight;
      if (ratio > boxRatio) {
        logoHeight = logoBoxWidth / ratio;
      } else {
        logoWidth = logoBoxHeight * ratio;
      }
      doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoWidth, logoHeight, undefined, "FAST");
    } catch (error) {
      console.warn("Unable to draw IKF logo in PDF header.", error);
    }
  }

  doc.setTextColor(...textLight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isLandscape ? 17 : 15.8);
  doc.text(title, titleX, titleY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...textMuted);
  doc.setFontSize(10.2);
  doc.text(subtitle, titleX, subtitleY);

  const valueStartY = detailTop + 14;
  let leftY = valueStartY;
  metaLines.forEach((line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex >= 0 && separatorIndex < line.length - 1) {
      const label = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      doc.setTextColor(90, 102, 115);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.2);
      doc.text(label.toUpperCase(), leftColumnX, leftY);
      doc.setTextColor(33, 45, 58);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.2);
      doc.text(value, leftColumnX, leftY + 5.1);
      leftY += 11.2;
      return;
    }

    doc.setTextColor(33, 45, 58);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.6);
    doc.text(line, leftColumnX, leftY);
    leftY += 8.6;
  });

  doc.setDrawColor(229, 234, 240);
  doc.setLineWidth(0.18);
  doc.line(rightColumnX - 6, detailTop + 10, rightColumnX - 6, detailBottom - 8);

  doc.setTextColor(102, 114, 126);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text(preparedByTitle.toUpperCase(), rightColumnX, detailTop + 14);

  doc.setTextColor(33, 45, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.8);
  preparedByLines.forEach((line, index) => {
    doc.text(line, rightColumnX, detailTop + 20 + index * 5.9);
  });

  return headerBottom;
}

async function getIkfLogoDataUrl() {
  if (cachedIkfLogoDataUrl) {
    return cachedIkfLogoDataUrl;
  }

  if (!cachedIkfLogoLoadPromise) {
    cachedIkfLogoLoadPromise = (async () => {
      for (const url of IKF_LOGO_URLS) {
        try {
          const dataUrl = await loadRemoteImageAsPngDataUrl(url);
          if (dataUrl) {
            cachedIkfLogoDataUrl = dataUrl;
            return dataUrl;
          }
        } catch (error) {
          console.warn(`IKF logo load failed for ${url}`, error);
        }
      }

      cachedIkfLogoDataUrl = "";
      return "";
    })();
  }

  return cachedIkfLogoLoadPromise;
}

async function loadRemoteImageAsPngDataUrl(url) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("svg") || url.toLowerCase().endsWith(".svg")) {
        const svgText = await response.text();
        const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText.trim())}`;
        return await rasterizeImageDataUrl(svgDataUrl);
      }
    }
  } catch (error) {
    console.warn("Falling back to direct image load for logo.", error);
  }

  return rasterizeImageDataUrl(url);
}

async function rasterizeImageDataUrl(imageSrc) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageSrc;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  const targetWidth = 520;
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 0.32;
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round(targetWidth * ratio));

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] > 245 && data[index + 1] > 245 && data[index + 2] > 245) {
      data[index + 3] = 0;
    } else {
      const pixelIndex = index / 4;
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  if (maxX >= minX && maxY >= minY) {
    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const cropped = document.createElement("canvas");
    cropped.width = cropWidth;
    cropped.height = cropHeight;
    const croppedCtx = cropped.getContext("2d");
    croppedCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return cropped.toDataURL("image/png");
  }

  return canvas.toDataURL("image/png");
}

function addPdfFooter(data) {
  if (data?.doc?.__customClientFooter) {
    return;
  }

  const pageSize = data.doc.internal.pageSize;
  const pageHeight = pageSize.height || pageSize.getHeight();
  const pageWidth = pageSize.width || pageSize.getWidth();
  const footerY = pageHeight - 11;
  const footerLogo = cachedIkfLogoDataUrl;

  data.doc.setDrawColor(213, 219, 225);
  data.doc.line(14, footerY, pageWidth - 14, footerY);

  if (footerLogo) {
    try {
      data.doc.addImage(footerLogo, "PNG", 14, footerY + 2.2, 6.5, 2.2, undefined, "FAST");
    } catch (error) {
      console.warn("Unable to draw footer logo in PDF.", error);
    }
  }

  data.doc.setFont("helvetica", "bold");
  data.doc.setFontSize(8.2);
  data.doc.setTextColor(92, 102, 113);
  data.doc.text("I Knowledge Factory Pvt. Ltd.", 22, footerY + 5.2);
  data.doc.setTextColor(53, 64, 77);
  data.doc.text("AMC REPORT", pageWidth - 14, footerY + 5.2, { align: "right" });
}

function normalizeClientKey(value) {
  let text = String(value ?? "").trim().toLowerCase();
  if (!text) {
    return "";
  }

  const urlMatch = text.match(/https?:\/\/([^\s/)\]]+)/i);
  if (urlMatch) {
    text = urlMatch[1];
  }

  text = text.replace(/[()]/g, " ");
  text = text.replace(/^https?:\/\//, "");
  text = text.replace(/^www\./, "");
  text = text.replace(/^m\./, "");
  text = text.replace(/\/.*$/, "");
  text = text.replace(/\?.*$/, "");

  const hostParts = text.split(".").filter(Boolean);
  if (hostParts.length > 1) {
    const baseHost = hostParts[0];
    const cleanBaseHost = baseHost.replace(/[^a-z0-9]/g, "");
    if (cleanBaseHost) {
      return cleanBaseHost;
    }
  }

  const alnum = text.replace(/[^a-z0-9]+/g, "");
  if (alnum) {
    return alnum;
  }

  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeDateComparable(value) {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return Number.NaN;
  }

  if (/^\d{4,6}$/.test(trimmed)) {
    const excelSerial = Number(trimmed);
    const parsedSerial = XLSX?.SSF?.parse_date_code?.(excelSerial);
    if (parsedSerial) {
      return Date.UTC(parsedSerial.y, parsedSerial.m - 1, parsedSerial.d);
    }
  }

  const ddMmYyyyMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const ddMmYyMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (ddMmYyMatch) {
    const [, day, month, year] = ddMmYyMatch;
    const yearNumber = Number(year);
    const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
    return Date.UTC(fullYear, Number(month) - 1, Number(day));
  }

  const ddMmmYyyyMatch = trimmed.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{4})$/);
  if (ddMmmYyyyMatch) {
    const [, day, monthText, year] = ddMmmYyyyMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      return Date.UTC(Number(year), monthIndex, Number(day));
    }
  }

  const ddMmmYyMatch = trimmed.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{2})$/);
  if (ddMmmYyMatch) {
    const [, day, monthText, year] = ddMmmYyMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      const yearNumber = Number(year);
      const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
      return Date.UTC(fullYear, monthIndex, Number(day));
    }
  }

  const ddMmmYyyySpaceMatch = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{4})$/);
  if (ddMmmYyyySpaceMatch) {
    const [, day, monthText, year] = ddMmmYyyySpaceMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      return Date.UTC(Number(year), monthIndex, Number(day));
    }
  }

  const ddMmmYySpaceMatch = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{2})$/);
  if (ddMmmYySpaceMatch) {
    const [, day, monthText, year] = ddMmmYySpaceMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      const yearNumber = Number(year);
      const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
      return Date.UTC(fullYear, monthIndex, Number(day));
    }
  }

  const ddSlashMmSlashYyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddSlashMmSlashYyyyMatch) {
    const [, day, month, year] = ddSlashMmSlashYyyyMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const ddSlashMmSlashYyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ddSlashMmSlashYyMatch) {
    const [, day, month, year] = ddSlashMmSlashYyMatch;
    const yearNumber = Number(year);
    const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
    return Date.UTC(fullYear, Number(month) - 1, Number(day));
  }

  const yyyyMmDdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyyMmDdMatch) {
    const [, year, month, day] = yyyyMmDdMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return Number.NaN;
}

function getMonthIndex(monthText) {
  const months = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  return months[String(monthText).trim().toLowerCase()] ?? -1;
}

function formatHours(value) {
  return Number(value).toFixed(2);
}

function formatMinutes(value) {
  return Number(value).toFixed(0);
}

function formatPercentage(value) {
  return `${Number(value).toFixed(2)}%`;
}

function timestampSlug() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];
  return parts.join("");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function showMessage(message, isError = false) {
  elements.messageBox.textContent = message;
  elements.messageBox.classList.toggle("error", isError);
}

function clearMessage() {
  showMessage("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";

  if (!isLocalhost) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js?v=20260514");
  } catch (error) {
    console.warn("Service worker registration skipped.", error);
  }
}

init();
