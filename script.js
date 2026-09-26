"use strict";

const STORAGE_KEYS = {
    theme: "vaulta.theme",
    history: "vaulta.passwordHistory"
};

const MAX_HISTORY = 10;

const CHARACTER_GROUPS = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.<>?"
};

const elements = {
    root: document.documentElement,
    themeToggle: document.getElementById("theme-toggle"),
    passwordOutput: document.getElementById("password-output"),
    copyButton: document.getElementById("copy-button"),
    strengthText: document.getElementById("strength-text"),
    strengthMeter: document.querySelector(".strength-meter"),
    lengthSlider: document.getElementById("length-slider"),
    lengthValue: document.getElementById("length-value"),
    generateButton: document.getElementById("generate-button"),
    formMessage: document.getElementById("form-message"),
    historyList: document.getElementById("history-list"),
    historyEmpty: document.getElementById("history-empty"),
    historyCount: document.getElementById("history-count"),
    clearHistoryButton: document.getElementById("clear-history-button"),
    toast: document.getElementById("toast"),
    currentYear: document.getElementById("current-year"),
    characterOptions: {
        uppercase: document.getElementById("include-uppercase"),
        lowercase: document.getElementById("include-lowercase"),
        numbers: document.getElementById("include-numbers"),
        symbols: document.getElementById("include-symbols")
    }
};

let history = loadHistory();
let toastTimeout;

function readStorage(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function removeStorage(key) {
    try {
        window.localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function loadHistory() {
    try {
        const saved = JSON.parse(readStorage(STORAGE_KEYS.history) || "[]");

        if (!Array.isArray(saved)) {
            return [];
        }

        return saved
            .filter((item) =>
                item &&
                typeof item.password === "string" &&
                item.password.length >= 4 &&
                item.password.length <= 50 &&
                Number.isFinite(item.createdAt)
            )
            .slice(0, MAX_HISTORY);
    } catch {
        return [];
    }
}

function saveHistory() {
    return writeStorage(STORAGE_KEYS.history, JSON.stringify(history));
}

function getSelectedGroups() {
    return Object.entries(elements.characterOptions)
        .filter(([, checkbox]) => checkbox.checked)
        .map(([name]) => CHARACTER_GROUPS[name]);
}

function randomInt(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1) {
        throw new RangeError("The random range must be a positive integer.");
    }

    const range = 0x100000000;
    const acceptedLimit = Math.floor(range / maxExclusive) * maxExclusive;
    const value = new Uint32Array(1);

    do {
        window.crypto.getRandomValues(value);
    } while (value[0] >= acceptedLimit);

    return value[0] % maxExclusive;
}

function secureShuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(index + 1);
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }

    return items;
}

function generateSecurePassword(length, groups) {
    if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
        throw new Error("This browser does not support secure password generation.");
    }

    if (groups.length === 0) {
        throw new Error("Select at least one character type.");
    }

    if (length < groups.length) {
        throw new Error("Password length is too short for the selected character types.");
    }

    const alphabet = groups.join("");
    const characters = groups.map((group) => group[randomInt(group.length)]);

    while (characters.length < length) {
        characters.push(alphabet[randomInt(alphabet.length)]);
    }

    return secureShuffle(characters).join("");
}

function getStrength(length, groups) {
    const alphabetSize = groups.join("").length;
    const entropyBits = length * Math.log2(alphabetSize);

    if (entropyBits >= 80) {
        return { label: "Strong", level: "strong" };
    }

    if (entropyBits >= 55) {
        return { label: "Medium", level: "medium" };
    }

    return { label: "Weak", level: "weak" };
}

function updateStrength(passwordLength = 0) {
    if (!passwordLength) {
        elements.strengthText.textContent = "Not generated";
        elements.strengthText.className = "strength-value";
        elements.strengthMeter.removeAttribute("data-level");
        return;
    }

    const groups = getSelectedGroups();
    const strength = getStrength(passwordLength, groups);

    elements.strengthText.textContent = strength.label;
    elements.strengthText.className = `strength-value strength-${strength.level}`;
    elements.strengthMeter.dataset.level = strength.level;
}

function updateSlider() {
    const min = Number(elements.lengthSlider.min);
    const max = Number(elements.lengthSlider.max);
    const value = Number(elements.lengthSlider.value);
    const progress = ((value - min) / (max - min)) * 100;

    elements.lengthValue.value = String(value);
    elements.lengthValue.textContent = String(value);
    elements.lengthSlider.style.setProperty("--range-progress", `${progress}%`);

    if (elements.passwordOutput.value) {
        updateStrength(elements.passwordOutput.value.length);
    }
}

function setPassword(password) {
    elements.passwordOutput.value = password;
    elements.copyButton.disabled = password.length === 0;
    updateStrength(password.length);
}

function addToHistory(password) {
    history = [
        { password, createdAt: Date.now() },
        ...history.filter((item) => item.password !== password)
    ].slice(0, MAX_HISTORY);

    const stored = saveHistory();
    renderHistory();

    if (!stored) {
        showToast("Password created, but browser storage is unavailable.");
    }
}

function renderHistory() {
    elements.historyList.replaceChildren();
    elements.historyCount.textContent = String(history.length);
    elements.historyEmpty.hidden = history.length > 0;
    elements.clearHistoryButton.disabled = history.length === 0;

    history.forEach((item) => {
        const row = document.createElement("div");
        row.className = "history-item";

        const main = document.createElement("div");
        main.className = "history-item-main";

        const masked = document.createElement("span");
        masked.className = "history-masked";
        masked.textContent = "•".repeat(Math.min(item.password.length, 18));
        masked.setAttribute("aria-label", "Saved password hidden");

        const meta = document.createElement("span");
        meta.className = "history-meta";
        meta.textContent = `${item.password.length} characters · ${formatTime(item.createdAt)}`;

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const useButton = createHistoryButton(
            "Use password",
            '<path d="M5 12h14M13 6l6 6-6 6" />'
        );
        useButton.addEventListener("click", () => {
            setPassword(item.password);
            showToast("Password loaded into the generator.");
            elements.passwordOutput.focus();
        });

        const copyButton = createHistoryButton(
            "Copy saved password",
            '<rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />'
        );
        copyButton.addEventListener("click", async () => {
            await copyText(item.password);
        });

        main.append(masked, meta);
        actions.append(useButton, copyButton);
        row.append(main, actions);
        elements.historyList.append(row);
    });
}

function createHistoryButton(label, svgContent) {
    const button = document.createElement("button");
    button.className = "history-action";
    button.type = "button";
    button.setAttribute("aria-label", label);

    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");

    // SVG markup is constant application content, not user-provided data.
    svg.innerHTML = svgContent;
    button.append(svg);

    return button;
}

function formatTime(timestamp) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (elapsedSeconds < 60) {
        return "just now";
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    if (elapsedMinutes < 60) {
        return `${elapsedMinutes}m ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);

    if (elapsedHours < 24) {
        return `${elapsedHours}h ago`;
    }

    return new Date(timestamp).toLocaleDateString();
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");

    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
        elements.toast.classList.remove("is-visible");
    }, 2400);
}

async function copyText(text) {
    if (!text) {
        showToast("Generate a password before copying.");
        return;
    }

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            copyWithFallback(text);
        }

        showToast("Password copied to clipboard.");
    } catch {
        showToast("Could not copy password. Please copy it manually.");
    }
}

function copyWithFallback(text) {
    const temporaryInput = document.createElement("textarea");
    temporaryInput.value = text;
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    temporaryInput.style.pointerEvents = "none";
    document.body.append(temporaryInput);
    temporaryInput.select();

    const copied = document.execCommand("copy");
    temporaryInput.remove();

    if (!copied) {
        throw new Error("Clipboard copy failed.");
    }
}

function setTheme(theme) {
    const selectedTheme = theme === "light" ? "light" : "dark";

    elements.root.dataset.theme = selectedTheme;
    elements.themeToggle.setAttribute(
        "aria-pressed",
        String(selectedTheme === "dark")
    );
    elements.themeToggle.setAttribute(
        "aria-label",
        selectedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );

    writeStorage(STORAGE_KEYS.theme, selectedTheme);
}

function handleGenerate() {
    const groups = getSelectedGroups();
    const length = Number(elements.lengthSlider.value);

    elements.formMessage.textContent = "";

    if (groups.length === 0) {
        elements.formMessage.textContent = "Choose at least one character type.";
        return;
    }

    try {
        const password = generateSecurePassword(length, groups);
        setPassword(password);
        addToHistory(password);
    } catch (error) {
        elements.formMessage.textContent = error.message;
    }
}

elements.themeToggle.addEventListener("click", () => {
    const nextTheme = elements.root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
});

elements.lengthSlider.addEventListener("input", updateSlider);

Object.values(elements.characterOptions).forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
        elements.formMessage.textContent = "";

        if (elements.passwordOutput.value) {
            updateStrength(elements.passwordOutput.value.length);
        }
    });
});

elements.generateButton.addEventListener("click", handleGenerate);

elements.copyButton.addEventListener("click", async () => {
    await copyText(elements.passwordOutput.value);
});

elements.clearHistoryButton.addEventListener("click", () => {
    history = [];
    removeStorage(STORAGE_KEYS.history);
    renderHistory();
    showToast("Password history cleared.");
});

elements.currentYear.textContent = String(new Date().getFullYear());

const savedTheme = readStorage(STORAGE_KEYS.theme);
setTheme(savedTheme === "light" ? "light" : "dark");
updateSlider();
renderHistory();
