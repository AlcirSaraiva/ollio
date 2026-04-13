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

    // Fetch models from Ollama
    fetch("http://localhost:11434/api/tags")
        .then(res => res.json())
        .then(data => {
            const models = data.models; 
            modelOptionsDiv.innerHTML = ""; 

            models.forEach((model, index) => {
                const option = document.createElement("div");
                option.textContent = model.name;
                option.dataset.value = model.name;

                option.addEventListener("click", () => {
                    selectedModelDiv.textContent = model.name;
                    selectedModel = model.name;
                    localStorage.setItem("selectedModel", model.name);
                    modelOptionsDiv.classList.add("hidden");
                });

                modelOptionsDiv.appendChild(option);

                // Select first model if no model is saved in localStorage
                if (index === 0 && !localStorage.getItem("selectedModel")) {
                    selectedModelDiv.textContent = model.name;
                    selectedModel = model.name;
                    localStorage.setItem("selectedModel", model.name);
                }
                
                // Restore saved model from localStorage
                if (model.name === localStorage.getItem("selectedModel")) {
                    selectedModelDiv.textContent = model.name;
                    selectedModel = model.name;
                }
            });
        })
        .catch(err => {
            console.error("Failed to fetch models:", err);
            selectedModelDiv.textContent = "Error loading models";
        });

    selectedModelDiv.addEventListener("click", () => {
        modelOptionsDiv.classList.toggle("hidden");
    });

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
        let totalTokens = 0;
        
        if (conv.messages && conv.messages.length > 0) {
            const msg = conv.messages[0].content || "";
            const periodIndex = msg.indexOf(".");
            firstSentence = periodIndex !== -1 ?
                msg.slice(0, periodIndex + 1) :
                msg;
            if (firstSentence.length > 30) firstSentence = firstSentence.slice(0, 40) + "…";
            
            totalTokens = conv.messages.reduce((sum, message) => {
                return sum + estimateTokensFromMessage(message);
            }, 0);
        }

        const tokenInfo = `${totalTokens} total tokens in conversation`;
        textSpan.title = `${tokenInfo}`;
        textSpan.textContent = `${timestamp}\n${firstSentence}`;
        textSpan.style.whiteSpace = "pre";

        const downloadBtn = document.createElement("a");
        downloadBtn.textContent = "⇣";
        downloadBtn.classList.add("download-btn");
        downloadBtn.title = "Download conversation";

        downloadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            downloadConversation(conv.id);
        });

        const deleteBtn = document.createElement("a");
        deleteBtn.textContent = "X";
        deleteBtn.classList.add("delete-btn");
        deleteBtn.title = "Delete conversation";

        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });

        item.addEventListener("click", () => {
            loadConversation(conv.id);
            renderSavedList();
        });

        const buttonGroup = document.createElement("div");
        buttonGroup.classList.add("button-group");
        buttonGroup.appendChild(downloadBtn);
        buttonGroup.appendChild(deleteBtn);

        item.appendChild(textSpan);
        item.appendChild(buttonGroup);

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
    
    const normalized = text.trim();
    if (!normalized) return 0;
    
    const words = normalized.split(/\s+/);
    let tokenCount = 0;
    for (const word of words) {
        if (!word) continue;
        tokenCount += 1;
        // subword tokenization
        if (word.length > 4) {
            tokenCount += Math.ceil((word.length - 4) / 3);
        }
        
        const punctuation = word.match(/[^\w\s]/g);
        if (punctuation) {
            tokenCount += punctuation.length;
        }
        
        if (/\d/.test(word)) {
            tokenCount += 1;
        }
    }
    
    const newlines = (text.match(/\n/g) || []).length;
    tokenCount += newlines;
    
    // overhead for special tokens
    tokenCount += 2;
    
    return Math.ceil(tokenCount);
}

function estimateTokensFromMessage(msg) {
    let total = 0;

    total += estimateTokensFromText(msg.content);

    if (msg.images && Array.isArray(msg.images)) {
        for (const img of msg.images) {
            total += Math.ceil(img.length / 3);
        }
    }

    // overhead for message structure
    total += 5;

    return total;
}

function buildLimitedContext(messagesArray = messages, maxTokens = MAX_TOKENS) {
    const calculateTotalTokens = (msgArray) => {
        return msgArray.reduce((sum, msg) => sum + estimateTokensFromMessage(msg), 0);
    };

    const limitedContext = [...messagesArray];
    let totalTokens = calculateTotalTokens(limitedContext);

    if (totalTokens <= maxTokens) {
        return limitedContext;
    }

    const systemIndex = limitedContext.findIndex(m => m.role === "system");
    const startTrimIndex = systemIndex !== -1 ? systemIndex + 1 : 0;

    while (totalTokens > maxTokens && limitedContext.length > startTrimIndex) {
        const removedMsg = limitedContext.splice(startTrimIndex, 1)[0];
        const removedTokens = estimateTokensFromMessage(removedMsg);
        totalTokens -= removedTokens;
    }

    return limitedContext;
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

function downloadConversation(id) {
    const conv = conversations[id];
    if (!conv) return;

    const downloadDate = new Date();
    const timestamp = downloadDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }) + ' ' + downloadDate.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
    });

    const markdownContent = `## Conversation - ${timestamp}\n\n${conv.messages.map(msg => {
        const role = msg.role === 'assistant' && msg.model ? msg.model : msg.role;
        return `**${role}**:\n\n${msg.content}\n\n`;
    }).join('---\n\n')}`;
    
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${id}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

    const modelAtRequest = selectedModel;
    if (isStreaming) {
        typingMessage = addMessage("assistant", "Thinking…", "typing", false, modelAtRequest);
    } else {
        typingMessage = addMessage("assistant", "Typing…", "typing", false, modelAtRequest);
    }

    setLoading(true);

    currentController = new AbortController();

    selectedModel = document.getElementById("selectedModel").textContent;

    try {
        const limitedContext = buildLimitedContext();
        const tokensSent = limitedContext.reduce((sum, msg) => sum + estimateTokensFromMessage(msg), 0);
        console.log(`Sending ${tokensSent} tokens to API (${limitedContext.length} messages)`);
        
        const response = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: limitedContext,
                stream: isStreaming
            }),
            signal: currentController.signal
        });

        if (!response.ok) {
            const statusMessages = {
                400: "Bad Request: Invalid parameters or malformed JSON",
                404: "Not Found: The requested model does not exist",
                429: "Too Many Requests: Rate limit exceeded",
                500: "Internal Server Error: Ollama server encountered an error",
                502: "Bad Gateway: Unable to reach the model service"
            };
            
            const defaultMessage = `Server Error: HTTP ${response.status}`;
            const errorMessage = statusMessages[response.status] || defaultMessage;
            
            console.error(`API Error ${response.status}:`, errorMessage);
            throw new Error(errorMessage);
        }

        if (isStreaming) {
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
                buffer = lines.pop();

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
                if (typingMessage.parentNode === chatHistory) {
                    chatHistory.removeChild(typingMessage);
                }

                addMessage("assistant", finalText, "", true, modelAtRequest);

                messages.push({
                    role: "assistant",
                    content: finalText,
                    model: selectedModel
                });
                persistCurrentConversation();
                renderSavedList();
            }

        } else {
            // non-streaming
            const data = await response.json();
            const aiMessage = data?.message?.content ?? "No response.";

            if (typingMessage.parentNode === chatHistory) {
                chatHistory.removeChild(typingMessage);
            }

            addMessage("assistant", aiMessage, "", true);

            messages.push({
                role: "assistant",
                content: aiMessage,
                model: selectedModel
            });
            persistCurrentConversation();
            renderSavedList();
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
    attachBtn.title = "Attach an image (model must offer support)";

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
    } else {
        streamToggle.checked = true;
    }

    streamToggle.addEventListener("change", () => {
        localStorage.setItem("streamEnabled", streamToggle.checked);
    });

    marked.setOptions({
        breaks: true
    });

    const newBtn = document.querySelector(".new-conversation");
    newBtn.title = "Start a new conversation";
    if (newBtn) {
        newBtn.addEventListener("click", startNewConversation);
    }

    startNewConversation();
    renderSavedList();
    renderModelsList();
}

window.addEventListener('load', init);