"use strict";

const CONFIG = {
  BASE_URL: "https://api.gapgpt.app/v1",
  API_KEY: "sk-afi4KuYNyE3v4PwK1RBdCqzFDzrU3v84SpDReCEAeOR7QOto",
  MODEL: "",
  MAX_HISTORY: 100,
  MAX_FILE_SIZE: 15 * 1024 * 1024
};

const STORAGE = {
  user: "berost_user_v2",
  chats: "berost_chats_v2",
  activeChat: "berost_active_chat_v2",
  theme: "berost_theme_v2",
  language: "berost_language_v2"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const elements = {
  sidebar: $("#sidebar"),
  sidebarBackdrop: $("#sidebarBackdrop"),
  openSidebar: $("#openSidebar"),
  closeSidebar: $("#closeSidebar"),
  newChat: $("#newChat"),
  homeButton: $("#homeButton"),
  historyButton: $("#historyButton"),
  historyList: $("#historyList"),
  historyCount: $("#historyCount"),
  userName: $("#userName"),
  userAvatar: $("#userAvatar"),
  renameButton: $("#renameButton"),
  languageButton: $("#languageButton"),
  themeButton: $("#themeButton"),
  chatViewport: $("#chatViewport"),
  welcomeScreen: $("#welcomeScreen"),
  messagesContainer: $("#messagesContainer"),
  typingIndicator: $("#typingIndicator"),
  messageInput: $("#messageInput"),
  sendButton: $("#sendButton"),
  attachButton: $("#attachButton"),
  voiceButton: $("#voiceButton"),
  fileInput: $("#fileInput"),
  attachmentPreview: $("#attachmentPreview"),
  nameModal: $("#nameModal"),
  nameForm: $("#nameForm"),
  nameInput: $("#nameInput"),
  toast: $("#toast")
};

let userName = "";
let chats = [];
let activeChatId = null;
let language = "fa";
let theme = "dark";
let pendingFiles = [];
let isGenerating = false;
let recognition = null;
let toastTimeout = null;

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return "chat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function loadStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showToast(tr("ذخیره‌سازی مرورگر در دسترس نیست.", "Browser storage is unavailable."));
    return false;
  }
}

function tr(fa, en) {
  return language === "fa" ? fa : en;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "fa" ? "rtl" : "ltr";

  $$("[data-fa][data-en]").forEach(node => {
    node.textContent = node.dataset[language];
  });

  elements.messageInput.placeholder =
    elements.messageInput.dataset["placeholder" + (language === "fa" ? "Fa" : "En")];

  elements.nameInput.placeholder = tr("نام شما", "Your name");
  elements.languageButton.textContent = language === "fa" ? "EN" : "فا";
  elements.themeButton.textContent = theme === "dark" ? "☼" : "☾";

  renderHistory();
  renderMessages();
  renderAttachmentPreview();
  saveStorage(STORAGE.language, language);
}

function applyTheme() {
  document.body.classList.toggle("light", theme === "light");
  elements.themeButton.textContent = theme === "dark" ? "☼" : "☾";

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", theme === "dark" ? "#090b12" : "#f5f6fb");
  }

  saveStorage(STORAGE.theme, theme);
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarBackdrop.classList.remove("visible");
}

function openSidebar() {
  elements.sidebar.classList.add("open");
  elements.sidebarBackdrop.classList.add("visible");
}

function getActiveChat() {
  return chats.find(chat => chat.id === activeChatId) || null;
}

function persistChats() {
  chats = chats.slice(0, CONFIG.MAX_HISTORY);
  saveStorage(STORAGE.chats, chats);
  saveStorage(STORAGE.activeChat, activeChatId);
  renderHistory();
}

function createChat() {
  const chat = {
    id: createId(),
    title: tr("گفتگوی جدید", "New conversation"),
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  chats.unshift(chat);
  activeChatId = chat.id;
  persistChats();
  renderMessages();
  closeSidebar();
  elements.messageInput.focus();
  return chat;
}

function selectChat(id) {
  const chat = chats.find(item => item.id === id);
  if (!chat) return;

  activeChatId = id;
  saveStorage(STORAGE.activeChat, activeChatId);
  renderHistory();
  renderMessages();
  closeSidebar();
}

function deleteChat(id) {
  const chat = chats.find(item => item.id === id);
  if (!chat) return;

  const confirmed = window.confirm(
    tr("این گفتگو حذف شود؟", "Delete this conversation?")
  );

  if (!confirmed) return;

  chats = chats.filter(item => item.id !== id);

  if (activeChatId === id) {
    activeChatId = chats[0]?.id || null;
  }

  persistChats();

  if (!activeChatId) {
    elements.welcomeScreen.classList.remove("hidden");
    elements.messagesContainer.innerHTML = "";
  } else {
    renderMessages();
  }
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  elements.historyCount.textContent = String(chats.length);

  if (!chats.length) {
    const empty = document.createElement("div");
    empty.className = "empty-history";
    empty.textContent = tr(
      "گفتگوی قبلی وجود ندارد. یک گفتگوی جدید شروع کن.",
      "No conversations yet. Start a new chat."
    );
    elements.historyList.appendChild(empty);
    return;
  }

  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = "history-item" + (chat.id === activeChatId ? " selected" : "");
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");

    const icon = document.createElement("span");
    icon.textContent = "◷";

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = chat.title || tr("گفتگوی جدید", "New conversation");

    const remove = document.createElement("button");
    remove.className = "delete-chat";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", tr("حذف گفتگو", "Delete conversation"));

    item.append(icon, title, remove);

    item.addEventListener("click", event => {
      if (event.target.closest(".delete-chat")) return;
      selectChat(chat.id);
    });

    item.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectChat(chat.id);
      }
    });

    remove.addEventListener("click", event => {
      event.stopPropagation();
      deleteChat(chat.id);
    });

    elements.historyList.appendChild(item);
  });
}

function renderMessages() {
  const chat = getActiveChat();
  elements.messagesContainer.innerHTML = "";

  if (!chat || !chat.messages.length) {
    elements.welcomeScreen.classList.remove("hidden");
    scrollToBottom();
    return;
  }

  elements.welcomeScreen.classList.add("hidden");

  chat.messages.forEach(message => {
    elements.messagesContainer.appendChild(createMessageElement(message));
  });

  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    elements.chatViewport.scrollTop = elements.chatViewport.scrollHeight;
  });
}

function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat(language === "fa" ? "fa-IR" : "en-US", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function createMessageElement(message) {
  const row = document.createElement("div");
  row.className = "message-row" + (message.role === "user" ? " user-row" : "");

  const avatar = document.createElement("div");
  avatar.className = message.role === "user" ? "user-message-avatar" : "assistant-avatar";
  avatar.textContent = message.role === "user"
    ? (userName.trim().charAt(0) || "U")
    : "B.";

  if (message.role !== "user") {
    const dot = document.createElement("span");
    dot.textContent = ".";
    avatar.textContent = "B";
    avatar.appendChild(dot);
  }

  const main = document.createElement("div");
  main.className = "message-main";

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = message.role === "user"
    ? userName
    : "Berost AI";

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(message.timestamp || Date.now());

  meta.append(author, time);
  main.appendChild(meta);

  if (message.role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "user-bubble message-text";
    bubble.textContent = message.content || "";
    main.appendChild(bubble);
  } else {
    const body = document.createElement("div");
    body.className = "message-text";
    body.appendChild(renderMarkdown(message.content || ""));
    main.appendChild(body);
    main.appendChild(createMessageActions(message.content || ""));
  }

  if (message.attachments && message.attachments.length) {
    const attachments = document.createElement("div");
    attachments.className = "message-attachments";

    message.attachments.forEach(file => {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      chip.textContent = "📎 " + file.name;
      attachments.appendChild(chip);
    });

    main.appendChild(attachments);
  }

  row.append(avatar, main);
  return row;
}

function createMessageActions(content) {
  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "message-action";
  copyButton.textContent = tr("▢ کپی پاسخ", "▢ Copy response");
  copyButton.addEventListener("click", () => copyText(content));

  const speakButton = document.createElement("button");
  speakButton.type = "button";
  speakButton.className = "message-action";
  speakButton.textContent = tr("♩ خواندن", "♩ Read aloud");
  speakButton.addEventListener("click", () => speakText(content));

  actions.append(copyButton, speakButton);
  return actions;
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderMarkdown(markdown) {
  const fragment = document.createDocumentFragment();
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");

  let paragraph = [];
  let list = null;
  let codeLines = null;
  let codeLanguage = "";

  function inlineMarkdown(text) {
    let output = escapeHTML(text);

    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    output = output.replace(/~~(.+?)~~/g, "<del>$1</del>");
    output = output.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    return output;
  }

  function flushParagraph() {
    if (!paragraph.length) return;

    const p = document.createElement("p");
    p.innerHTML = paragraph.map(inlineMarkdown).join("<br>");
    fragment.appendChild(p);
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    fragment.appendChild(list);
    list = null;
  }

  function addCodeBlock() {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-header";

    const label = document.createElement("span");
    label.textContent = codeLanguage || tr("کد", "Code");

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "code-copy";
    copy.textContent = tr("کپی کد", "Copy code");

    const code = codeLines.join("\n");
    copy.addEventListener("click", () => copyText(code));

    header.append(label, copy);

    const pre = document.createElement("pre");
    const codeElement = document.createElement("code");
    codeElement.textContent = code;
    pre.appendChild(codeElement);

    wrapper.append(header, pre);
    fragment.appendChild(wrapper);
  }

  for (const line of lines) {
    const fence = line.match(/^```([\w#+.-]*)\s*$/);

    if (fence && codeLines === null) {
      flushParagraph();
      flushList();
      codeLines = [];
      codeLanguage = fence[1] || "";
      continue;
    }

    if (fence && codeLines !== null) {
      addCodeBlock();
      codeLines = null;
      codeLanguage = "";
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();

      const level = heading[1].length;
      const element = document.createElement("h" + level);
      element.innerHTML = inlineMarkdown(heading[2]);
      fragment.appendChild(element);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();

      const element = document.createElement("blockquote");
      element.innerHTML = inlineMarkdown(quote[1]);
      fragment.appendChild(element);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (unordered || ordered) {
      flushParagraph();

      const type = unordered ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== type) {
        flushList();
        list = document.createElement(type);
      }

      const li = document.createElement("li");
      li.innerHTML = inlineMarkdown((unordered || ordered)[1]);
      list.appendChild(li);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (codeLines !== null) {
    addCodeBlock();
  }

  flushParagraph();
  flushList();

  return fragment;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      const successful = document.execCommand("copy");
      textarea.remove();

      if (!successful) throw new Error("Copy failed");
    }

    showToast(tr("کپی شد.", "Copied."));
  } catch {
    showToast(tr("کپی انجام نشد.", "Could not copy."));
  }
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    showToast(tr("خواندن صوتی در این مرورگر پشتیبانی نمی‌شود.", "Speech is not supported by this browser."));
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(
    String(text).replace(/```[\s\S]*?```/g, " ").slice(0, 5000)
  );

  utterance.lang = language === "fa" ? "fa-IR" : "en-US";
  window.speechSynthesis.speak(utterance);
}

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[؟?!.,،؛:()\[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function getLocalAnswer(userText) {
  const text = normalizeText(userText);

  /*
   * پاسخ‌های ثابت مربوط به هویت، مالک یا سازنده عمداً تعریف نشده‌اند.
   * این پرسش‌ها مانند سایر پیام‌ها به مدل API فرستاده می‌شوند.
   */

  if (matchesAny(text, [
    /^(سلام|درود|hi|hello|hey)\b/,
    /^(سلام علیکم|صبح بخیر|شب بخیر)/
  ])) {
    return tr(
      "سلام! خوش اومدی. چطور می‌تونم کمکت کنم؟",
      "Hello! Welcome. How can I help you?"
    );
  }

  return null;
}

function updateChatTitle(chat, text) {
  if (!chat || chat.messages.length > 2) return;

  const title = String(text).replace(/\s+/g, " ").trim();
  chat.title = title.length > 34 ? title.slice(0, 34) + "…" : title;
  chat.updatedAt = Date.now();
}

function getApiMessages(chat) {
  const messages = [{
    role: "system",
    content: language === "fa"
      ? "You are Berost AI, a helpful and capable AI assistant. Respond naturally in the user's language. Do not invent facts about your identity, ownership, creator, or organization. If asked about these topics, answer only with information actually available to you; otherwise state that you do not have verified information. Follow the user's request and be clear and useful."
      : "You are Berost AI, a helpful and capable AI assistant. Respond naturally in the user's language. Do not invent facts about your identity, ownership, creator, or organization. If asked about these topics, answer only with information actually available to you; otherwise state that you do not have verified information. Follow the user's request and be clear and useful."
  }];

  chat.messages.forEach(message => {
    if (message.role !== "user" && message.role !== "assistant") return;

    messages.push({
      role: message.role,
      content: message.content || ""
    });
  });

  return messages;
}

async function requestAI(chat) {
  if (!CONFIG.API_KEY || CONFIG.API_KEY === "PASTE_YOUR_NEW_API_KEY_HERE") {
    throw new Error(tr(
      "ابتدا کلید API خود را در فایل app.js وارد کن.",
      "Add your API key in app.js first."
    ));
  }

  const payload = {
    messages: getApiMessages(chat),
    stream: false
  };

  if (CONFIG.MODEL.trim()) {
    payload.model = CONFIG.MODEL.trim();
  }

  const response = await fetch(CONFIG.BASE_URL.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + CONFIG.API_KEY
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      tr("پاسخ سرور قابل خواندن نیست.", "The server returned an unreadable response.")
    );
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || "";
    throw new Error(
      detail || tr(
        "ارتباط با سرویس هوش مصنوعی ناموفق بود. تنظیمات API را بررسی کن.",
        "The AI service request failed. Check the API configuration."
      )
    );
  }

  const answer = data?.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error(
      tr("پاسخ معتبری از سرویس دریافت نشد.", "The service returned no valid answer.")
    );
  }

  return answer.trim();
}

function setGenerating(value) {
  isGenerating = value;
  elements.sendButton.disabled = value;
  elements.typingIndicator.classList.toggle("hidden", !value);

  if (value) {
    elements.sendButton.querySelector("span").textContent = "…";
  } else {
    elements.sendButton.querySelector("span").textContent = "↑";
  }

  scrollToBottom();
}

async function sendMessage(prefilledText = "") {
  if (isGenerating) return;

  const text = String(prefilledText || elements.messageInput.value).trim();

  if (!text && !pendingFiles.length) return;

  let chat = getActiveChat();
  if (!chat) chat = createChat();

  const attachments = pendingFiles.map(file => ({
    name: file.name,
    type: file.type,
    size: file.size
  }));

  let finalText = text;

  if (pendingFiles.length) {
    const descriptions = pendingFiles.map(file => {
      if (file.type.startsWith("image/")) {
        return tr(
          "[تصویر پیوست‌شده: " + file.name + "]",
          "[Attached image: " + file.name + "]"
        );
      }

      if (file.textContent) {
        return tr(
          "\n\nمحتوای فایل " + file.name + ":\n" + file.textContent,
          "\n\nContent of file " + file.name + ":\n" + file.textContent
        );
      }

      return tr(
        "[فایل پیوست‌شده: " + file.name + "؛ محتوای این نوع فایل در این نسخه مستقیماً خوانده نمی‌شود.]",
        "[Attached file: " + file.name + "; this version cannot directly read this file type.]"
      );
    });

    finalText = [text, ...descriptions].filter(Boolean).join("\n\n");
  }

  const userMessage = {
    role: "user",
    content: finalText || tr("فایل پیوست‌شده را بررسی کن.", "Please review the attached file."),
    attachments,
    timestamp: Date.now()
  };

  chat.messages.push(userMessage);
  updateChatTitle(chat, text || attachments[0]?.name || tr("فایل پیوست‌شده", "Attached file"));

  elements.messageInput.value = "";
  resizeTextarea();
  pendingFiles = [];
  renderAttachmentPreview();

  persistChats();
  renderMessages();
  setGenerating(true);

  try {
    const localAnswer = getLocalAnswer(text);

    const answer = localAnswer || await requestAI(chat);

    chat.messages.push({
      role: "assistant",
      content: answer,
      timestamp: Date.now()
    });
  } catch (error) {
    chat.messages.push({
      role: "assistant",
      content: tr(
        "در دریافت پاسخ مشکلی پیش آمد.\n\n" + (error?.message || "خطای نامشخص"),
        "There was a problem getting a response.\n\n" + (error?.message || "Unknown error")
      ),
      timestamp: Date.now()
    });
  } finally {
    chat.updatedAt = Date.now();
    persistChats();
    renderMessages();
    setGenerating(false);
    elements.messageInput.focus();
  }
}

function resizeTextarea() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height =
    Math.min(elements.messageInput.scrollHeight, 140) + "px";
}

function renderAttachmentPreview() {
  elements.attachmentPreview.innerHTML = "";
  elements.attachmentPreview.classList.toggle("hidden", !pendingFiles.length);

  pendingFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    if (file.type.startsWith("image/") && file.previewUrl) {
      const image = document.createElement("img");
      image.src = file.previewUrl;
      image.alt = file.name;
      item.appendChild(image);
    } else {
      const icon = document.createElement("span");
      icon.textContent = "📎";
      item.appendChild(icon);
    }

    const name = document.createElement("span");
    name.className = "preview-name";
    name.textContent = file.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-file";
    remove.textContent = "×";
    remove.setAttribute("aria-label", tr("حذف فایل", "Remove file"));

    remove.addEventListener("click", () => {
      const removed = pendingFiles.splice(index, 1)[0];

      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      renderAttachmentPreview();
    });

    item.append(name, remove);
    elements.attachmentPreview.appendChild(item);
  });
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);

  for (const file of files) {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      showToast(tr(
        "حجم هر فایل باید کمتر از ۱۵ مگابایت باشد.",
        "Each file must be smaller than 15 MB."
      ));
      continue;
    }

    if (pendingFiles.some(existing =>
      existing.name === file.name &&
      existing.size === file.size &&
      existing.lastModified === file.lastModified
    )) {
      continue;
    }

    const item = file;

    if (file.type.startsWith("image/")) {
      item.previewUrl = URL.createObjectURL(file);
    }

    const readableTextTypes = [
      "text/",
      "application/json"
    ];

    const isTextFile =
      readableTextTypes.some(type => file.type.startsWith(type)) ||
      /\.(txt|md|json|csv|html|css|js|py|xml|log)$/i.test(file.name);

    if (isTextFile) {
      try {
        item.textContent = await file.text();

        if (item.textContent.length > 60000) {
          item.textContent = item.textContent.slice(0, 60000) +
            "\n[File content truncated]";
        }
      } catch {
        item.textContent = "";
      }
    }

    pendingFiles.push(item);
  }

  renderAttachmentPreview();
  elements.fileInput.value = "";
}

function startVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast(tr(
      "ورودی صوتی در این مرورگر پشتیبانی نمی‌شود.",
      "Voice input is not supported in this browser."
    ));
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    elements.voiceButton.classList.remove("listening");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = language === "fa" ? "fa-IR" : "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  elements.voiceButton.classList.add("listening");

  recognition.onresult = event => {
    let transcript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    elements.messageInput.value = transcript;
    resizeTextarea();
  };

  recognition.onerror = () => {
    showToast(tr(
      "دریافت صدا ناموفق بود.",
      "Voice recognition failed."
    ));
  };

  recognition.onend = () => {
    recognition = null;
    elements.voiceButton.classList.remove("listening");
  };

  try {
    recognition.start();
  } catch {
    recognition = null;
    elements.voiceButton.classList.remove("listening");
    showToast(tr("شروع ورودی صوتی ناموفق بود.", "Could not start voice input."));
  }
}

function updateUser(name) {
  userName = String(name).trim().slice(0, 40) || "کاربر";
  elements.userName.textContent = userName;
  elements.userAvatar.textContent = userName.charAt(0).toUpperCase();
  saveStorage(STORAGE.user, userName);
}

function showNameModal(rename = false) {
  elements.nameModal.classList.remove("hidden");
  elements.nameInput.value = rename ? userName : "";
  elements.nameInput.placeholder = tr("نام شما", "Your name");

  requestAnimationFrame(() => elements.nameInput.focus());
}

function hideNameModal() {
  elements.nameModal.classList.add("hidden");
}

function init() {
  userName = loadStorage(STORAGE.user, "");
  chats = loadStorage(STORAGE.chats, []);
  activeChatId = loadStorage(STORAGE.activeChat, null);
  language = loadStorage(STORAGE.language, "fa");
  theme = loadStorage(STORAGE.theme, "dark");

  if (!Array.isArray(chats)) chats = [];

  chats = chats.filter(chat =>
    chat &&
    typeof chat.id === "string" &&
    Array.isArray(chat.messages)
  );

  if (!chats.some(chat => chat.id === activeChatId)) {
    activeChatId = chats[0]?.id || null;
  }

  if (language !== "fa" && language !== "en") language = "fa";
  if (theme !== "dark" && theme !== "light") theme = "dark";

  applyTheme();
  applyLanguage();

  if (userName) {
    updateUser(userName);
  } else {
    showNameModal(false);
  }

  renderHistory();
  renderMessages();
  resizeTextarea();
}

elements.newChat.addEventListener("click", createChat);

elements.homeButton.addEventListener("click", () => {
  if (!getActiveChat()) createChat();
  else renderMessages();

  closeSidebar();
});

elements.historyButton.addEventListener("click", () => {
  openSidebar();
  elements.historyList.scrollTop = 0;
});

elements.openSidebar.addEventListener("click", openSidebar);
elements.closeSidebar.addEventListener("click", closeSidebar);
elements.sidebarBackdrop.addEventListener("click", closeSidebar);

elements.renameButton.addEventListener("click", () => {
  showNameModal(true);
});

elements.nameForm.addEventListener("submit", event => {
  event.preventDefault();

  const name = elements.nameInput.value.trim();
  if (!name) {
    elements.nameInput.focus();
    return;
  }

  updateUser(name);
  hideNameModal();

  if (!getActiveChat()) createChat();

  showToast(tr(
    "خوش آمدی " + userName,
    "Welcome, " + userName
  ));
});

elements.languageButton.addEventListener("click", () => {
  language = language === "fa" ? "en" : "fa";
  applyLanguage();
});

elements.themeButton.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme();
});

elements.sendButton.addEventListener("click", () => {
  sendMessage();
});

elements.messageInput.addEventListener("input", resizeTextarea);

elements.messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

elements.attachButton.addEventListener("click", () => {
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", event => {
  handleFiles(event.target.files);
});

elements.voiceButton.addEventListener("click", startVoiceInput);

$$(".suggestion-card").forEach(button => {
  button.addEventListener("click", () => {
    const prompt = button.dataset.prompt || "";
    elements.messageInput.value = prompt;
    resizeTextarea();
    sendMessage(prompt);
  });
});

document.addEventListener("keydown", event => {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const modifier = isMac ? event.metaKey : event.ctrlKey;

  if (modifier && event.key.toLowerCase() === "k") {
    event.preventDefault();
    createChat();
  }

  if (event.key === "Escape") {
    closeSidebar();

    if (!elements.nameModal.classList.contains("hidden") && userName) {
      hideNameModal();
    }
  }
});

window.addEventListener("pagehide", () => {
  if (recognition) {
    try {
      recognition.stop();
    } catch {}
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

init();