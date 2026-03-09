let messages = [];
let selectedModel;
let chatHistory;
let userInput;
let sendBtn;
let isDragging = false;
let attachedBase64 = null;
let streamToggle;
let currentController = null;
let MAX_TOKENS = 3072;
let conversations = JSON.parse(localStorage.getItem("conversations")) || {};
let currentConversationId = null;

// UI

function renderModelsList() {
    const selectedModelDiv = document.getElementById("selectedModel");
    const modelOptionsDiv = document.getElementById("modelOptions");

    // Fetch models from Ollama API
    fetch("http://localhost:11434/api/tags")
        .then(res => res.json())
        .then(data => {
            const models = data.models; // array of models
            modelOptionsDiv.innerHTML = ""; // clear existing options

            models.forEach((model, index) => {
                const option = document.createElement("div");
                option.textContent = model.name;
                option.dataset.value = model.name;

                // Click event
                option.addEventListener("click", () => {
                    selectedModelDiv.textContent = model.name;
                    selectedModel = model.name;
                    localStorage.setItem("selectedModel", model.name);
                    modelOptionsDiv.classList.add("hidden");
                });

                modelOptionsDiv.appendChild(option);

                // If it’s the first model OR matches saved selection, set as selected
                if (index === 0 && !localStorage.getItem("selectedModel")) {
                    selectedModelDiv.textContent = model.name;
                    selectedModel = model.name;
                    localStorage.setItem("selectedModel", model.name);
                } else if (model.name === localStorage.getItem("selectedModel")) {
                    selectedModelDiv.textContent = model.name;
                    selectedModel = model.name;
                }
            });
        })
        .catch(err => {
            console.error("Failed to fetch models:", err);
            selectedModelDiv.textContent = "Error loading models";
        });

    // Toggle dropdown visibility
    selectedModelDiv.addEventListener("click", () => {
        modelOptionsDiv.classList.toggle("hidden");
    });

    // Close dropdown if clicking outside
    document.addEventListener("click", (e) => {
        const modelDropdown = document.getElementById("modelDropdown");
        if (!modelDropdown.contains(e.target)) {
            modelOptionsDiv.classList.add("hidden");
        }
    });
}

function renderSavedList() {
    const savedList = document.querySelector(".saved-list");
    const savedTitle = document.querySelector(".saved-title");
    const newConversation = document.querySelector(".new-conversation");
    savedList.innerHTML = "";

    const convArray = Object.values(conversations)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (convArray.length === 0) {
        savedTitle.style.display = "none";
        newConversation.style.display = "none";
    } else {
        savedTitle.style.display = "block";
        newConversation.style.display = "block";
    }

    convArray.forEach(conv => {

        const item = document.createElement("div");
        item.classList.add("saved-item");

        if (conv.id === currentConversationId) {
            item.classList.add("active-conversation");
        }

        const textSpan = document.createElement("span");

        const date = new Date(conv.createdAt);
        const timestamp = `${String(date.getDate()).padStart(2,'0')}/` +
            `${String(date.getMonth()+1).padStart(2,'0')}/` +
            `${date.getFullYear()} ` +
            `${String(date.getHours()).padStart(2,'0')}:` +
            `${String(date.getMinutes()).padStart(2,'0')}`;

        let firstSentence = "";
        if (conv.messages && conv.messages.length > 0) {
            const msg = conv.messages[0].content || "";
            const periodIndex = msg.indexOf(".");
            firstSentence = periodIndex !== -1 ?
                msg.slice(0, periodIndex + 1) :
                msg;
            if (firstSentence.length > 30) firstSentence = firstSentence.slice(0, 40) + "…";
        }

        textSpan.textContent = `${timestamp}\n${firstSentence}`;
        textSpan.style.whiteSpace = "pre";

        // Right side: delete button
        const deleteBtn = document.createElement("a");
        deleteBtn.textContent = "×";
        deleteBtn.classList.add("delete-btn");

        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });

        item.addEventListener("click", () => {
            loadConversation(conv.id);
            renderSavedList();
        });

        item.appendChild(textSpan);
        item.appendChild(deleteBtn);

        savedList.appendChild(item);
    });
}

function setLoading(isLoading) {
    userInput.disabled = isLoading;
    sendBtn.disabled = false;
    sendBtn.textContent = isLoading ? "Cancel" : "Send";
}

// Memory

function estimateTokensFromText(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

function estimateTokensFromMessage(msg) {
    let total = 0;

    // text content
    total += estimateTokensFromText(msg.content);

    // image base64 (VERY heavy)
    if (msg.images && Array.isArray(msg.images)) {
        for (const img of msg.images) {
            total += Math.ceil(img.length / 4);
        }
    }

    return total;
}

function trimMemoryByTokens(maxTokens = MAX_TOKENS) {
    let total = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
        total += estimateTokensFromMessage(messages[i]);

        if (total > maxTokens) {
            const firstSystemIndex = messages.findIndex(m => m.role === "system");

            if (firstSystemIndex !== -1 && firstSystemIndex < i) {
                messages.splice(firstSystemIndex + 1, i - firstSystemIndex - 1);
            } else {
                messages.splice(0, i);
            }

            break;
        }
    }
}

// Message Handling

function loadConversation(id) {
    const conv = conversations[id];
    if (!conv) return;

    currentConversationId = id;
    messages = [...conv.messages];

    chatHistory.innerHTML = "";

    messages.forEach(msg => {
        addMessage(msg.role, msg.content, "", false, msg.model);
    });
}

function saveConversations() {
    localStorage.setItem("conversations", JSON.stringify(conversations));
}

function deleteConversation(id) {
    if (!confirm("Delete this conversation?")) return;
    delete conversations[id];

    if (id === currentConversationId) {
        messages = [];
        currentConversationId = null;
        chatHistory.innerHTML = "";
        userInput.value = "";
        attachedBase64 = null;
        document.getElementById("fileName").textContent = "";
        document.getElementById("fileName").style.display = "none";
        document.getElementById("fileInput").value = "";
    }

    saveConversations();
    renderSavedList();
}

function persistCurrentConversation() {
    if (!currentConversationId) return;
    conversations[currentConversationId].messages = [...messages];
    saveConversations();
}

function startNewConversation() {
    messages = [];
    chatHistory.innerHTML = "";
    currentConversationId = null;
    userInput.value = "";
    attachedBase64 = null;
    document.getElementById("fileName").textContent = "";
    document.getElementById("fileName").style.display = "none";
    document.getElementById("fileInput").value = "";

    renderSavedList();

    const savedList = document.querySelector(".saved-list");
    if (savedList) savedList.scrollTop = savedList.scrollHeight;
}

function cleanResponse(text) {
    let t = text.replace(/\r\n/g, "\n");
    t = t.replace(/\n{2,}/g, "\n\n");
    return t.trim();
}

function addMessage(role, text, className = "", isNew = false, modelUsed = null) {
    const div = document.createElement("div");
    div.className = `message ${role} ${className}`;

    if (role === "assistant") {
        const label = document.createElement("span");
        const modelName = modelUsed || selectedModel || document.getElementById("selectedModel").textContent || "AI";
        label.textContent = `${modelName}: `;
        label.className = "label";

        const content = document.createElement("div");
        content.className = "content";
        content.innerHTML = cleanResponse(DOMPurify.sanitize(marked.parse(text)));

        div.appendChild(label);
        div.appendChild(content);
    } else {
        div.textContent = "You: " + text;
    }

    const copy = document.createElement("div");
    copy.className = "copy";
    copy.textContent = "copy";
    copy.addEventListener("click", async () => {
        let textToCopy = "";

        if (role === "assistant") {
            const contentDiv = div.querySelector(".content");
            textToCopy = contentDiv ? contentDiv.innerText : "";
        } else {
            const textNode = [...div.childNodes]
                .find(node => node.nodeType === Node.TEXT_NODE);

            textToCopy = textNode ? textNode.textContent.replace(/^You:\s*/, "").trim() : "";
        }

        try {
            await navigator.clipboard.writeText(textToCopy);

            copy.textContent = "copied";
            copy.style.color = "var(--clr-info-a10)";

            setTimeout(() => {
                copy.textContent = "copy";
                copy.style.color = "";
            }, 3000);

        } catch (err) {
            console.error("Clipboard failed:", err);
        }
    });
    div.appendChild(copy);

    if (isNew) {
        const dateTimeDiv = document.createElement("div");
        dateTimeDiv.className = "date-time";

        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        dateTimeDiv.textContent = `${hours}:${minutes}:${seconds}`;
        div.appendChild(dateTimeDiv);
    }

    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return div;
}

async function sendMessage() {
    if (currentController) {
        currentController.abort();
        return;
    }

    const text = userInput.value.trim();
    if (!text) return;

    let messageContent = text;

    addMessage("user", messageContent, "", true);

    const userMessage = {
        role: "user",
        content: messageContent
    };
    if (attachedBase64) {
        userMessage.images = [attachedBase64];
    }

    // If no conversation yet, create one
    if (!currentConversationId) {
        currentConversationId = "conv_" + Date.now();

        conversations[currentConversationId] = {
            id: currentConversationId,
            createdAt: new Date().toISOString(),
            messages: []
        };
    }

    messages.push(userMessage);
    trimMemoryByTokens();
    persistCurrentConversation();

    renderSavedList();

    userInput.value = "";
    userInput.style.height = "auto";
    attachedBase64 = null;
    document.getElementById("fileName").textContent = "";
    document.getElementById("fileName").style.display = "none";
    document.getElementById("fileInput").value = "";

    const isStreaming = streamToggle.checked;
    let typingMessage;

    const modelAtRequest = selectedModel; // capture model before sending
    if (isStreaming) {
        typingMessage = addMessage("assistant", "Thinking…", "typing", false, modelAtRequest);
    } else {
        typingMessage = addMessage("assistant", "Typing…", "typing", false, modelAtRequest);
    }

    setLoading(true);

    currentController = new AbortController();

    selectedModel = document.getElementById("selectedModel").textContent;

    try {
        const response = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                stream: isStreaming
            }),
            signal: currentController.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        if (isStreaming) {
            // streaming mode
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const {
                    value,
                    done
                } = await reader.read();
                if (currentController.signal.aborted) break;
                if (done) break;

                buffer += decoder.decode(value, {
                    stream: true
                });
                const lines = buffer.split("\n");
                buffer = lines.pop(); // incomplete line

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        const textChunk = chunk?.message?.content;
                        if (textChunk) {
                            const currentRaw = typingMessage.dataset.raw || "";
                            const updatedRaw = currentRaw + textChunk;

                            typingMessage.dataset.raw = updatedRaw;
                            const contentDiv = typingMessage.querySelector(".content");

                            contentDiv.innerHTML = cleanResponse(
                                DOMPurify.sanitize(marked.parse(updatedRaw.trimStart()))
                            );
                        }
                    } catch (err) {
                        console.warn("Skipping invalid chunk:", line);
                    }
                }
            }

            // save final text to memory
            const finalText = typingMessage.dataset.raw || "";
            if (!currentController?.signal.aborted) {

                // remove placeholder typing div
                if (typingMessage.parentNode === chatHistory) {
                    chatHistory.removeChild(typingMessage);
                }

                // add new AI message with timestamp
                addMessage("assistant", finalText, "", true, modelAtRequest);

                messages.push({
                    role: "assistant",
                    content: finalText,
                    model: selectedModel
                });
                trimMemoryByTokens();
                persistCurrentConversation();
            }

        } else {
            // non-streaming
            const data = await response.json();
            const aiMessage = data?.message?.content ?? "No response.";

            // remove the old typing placeholder
            if (typingMessage.parentNode === chatHistory) {
                chatHistory.removeChild(typingMessage);
            }

            // add new AI message with timestamp
            addMessage("assistant", aiMessage, "", true);

            messages.push({
                role: "assistant",
                content: aiMessage,
                model: selectedModel
            });
            trimMemoryByTokens();
            persistCurrentConversation();
        }
    } catch (err) {
        if (err.name === "AbortError") {
            typingMessage.classList.remove("typing");
            typingMessage.querySelector(".content").innerHTML +=
                "\n\n*Response cancelled.*";
        } else {
            typingMessage.textContent = `AI: ⚠️ Error: ${err.message}`;
            console.error("Request failed:", err);
        }
    } finally {
        currentController = null;
        typingMessage.classList.remove("typing");
        setLoading(false);
        userInput.focus();
    }
}

function init() {
    chatHistory = document.getElementById("chatHistory");
    userInput = document.getElementById("userInput");
    sendBtn = document.getElementById("sendBtn");
    const attachBtn = document.getElementById('attachBtn');
    attachBtn.textContent = "+";

    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');
    attachBtn.addEventListener('click', () => {
        if (attachedBase64) {
            attachedBase64 = null;
            fileInput.value = "";
            fileNameDisplay.textContent = "";
            fileNameDisplay.style.display = "none";
            attachBtn.textContent = "+";
            return;
        }
        fileInput.click();
    });
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        fileNameDisplay.textContent = file.name;
        fileNameDisplay.style.display = "block";
        fileNameDisplay.style.marginRight = "0.7vw";
        const reader = new FileReader();
        reader.onload = () => {
            attachedBase64 = reader.result.split(',')[1];
            attachBtn.textContent = "×";
        };

        reader.readAsDataURL(file);
    });

    const selectedTokensDiv = document.getElementById("selectedTokens");
    const tokensOptionsDiv = document.getElementById("tokensOptions");
    const tokensDropdown = document.getElementById("tokensDropdown");

    MAX_TOKENS = parseInt(localStorage.getItem("MAX_TOKENS"), 10) || 3072;

    const selectedOption = [...tokensOptionsDiv.children]
        .find(opt => parseInt(opt.dataset.value, 10) === MAX_TOKENS);

    if (selectedOption) {
        selectedTokensDiv.textContent = selectedOption.textContent.trim();
    } else {
        selectedTokensDiv.textContent = "3K"; // fallback
    }

    selectedTokensDiv.addEventListener("click", () => {
        tokensOptionsDiv.classList.toggle("hidden");
    });

    tokensOptionsDiv.querySelectorAll("div").forEach(option => {
        option.addEventListener("click", () => {
            MAX_TOKENS = parseInt(option.dataset.value, 10);
            selectedTokensDiv.textContent = option.textContent;
            localStorage.setItem("MAX_TOKENS", MAX_TOKENS);
            trimMemoryByTokens();
            persistCurrentConversation();
            tokensOptionsDiv.classList.add("hidden");
        });
    });

    document.addEventListener("click", (e) => {
        if (!tokensDropdown.contains(e.target)) {
            tokensOptionsDiv.classList.add("hidden");
        }
    });

    sendBtn.addEventListener("click", sendMessage);

    userInput.addEventListener("input", () => {
        userInput.style.height = "auto";
        userInput.style.height = Math.min(userInput.scrollHeight - 19, 400) + "px";
    });

    userInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    const dragHandle = document.getElementById("dragHandle");
    const chatHistoryDiv = document.getElementById("chatHistory");
    const inputArea = document.querySelector(".input-area");

    dragHandle.addEventListener("mousedown", () => {
        isDragging = true;
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
        //const chatHistory = document.getElementById("chatHistory");
        //chatHistory.scrollTop = chatHistory.scrollHeight;
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const containerRect = document
            .querySelector(".chat-container")
            .getBoundingClientRect();

        const offsetY = e.clientY - containerRect.top;

        const minTop = 100;
        const minBottom = 80;

        if (
            offsetY > minTop &&
            offsetY < containerRect.height - minBottom
        ) {
            chatHistoryDiv.style.height = offsetY + "px";
        }
    });

    streamToggle = document.getElementById("streamToggle");

    const savedStream = localStorage.getItem("streamEnabled");
    if (savedStream !== null) {
        streamToggle.checked = savedStream === "true";
    }

    streamToggle.addEventListener("change", () => {
        localStorage.setItem("streamEnabled", streamToggle.checked);
    });

    marked.setOptions({
        breaks: true
    });

    const newBtn = document.querySelector(".new-conversation");
    if (newBtn) {
        newBtn.addEventListener("click", startNewConversation);
    }

    startNewConversation();
    renderSavedList();
    renderModelsList();
}

window.addEventListener('load', init);