let messages = JSON.parse(localStorage.getItem("chatMemory")) || [];
let attachBtn;
let selectedModel;
let chatHistory;
let userInput;
let sendBtn;
let clearBtn;
let isDragging = false;
let attachedBase64 = null;
let streamToggle;
let currentController = null;
let MAX_TOKENS = 3072;

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

function saveMemory() {
    localStorage.setItem("chatMemory", JSON.stringify(messages));
}

function clearChat() {
    messages.length = 0;
    localStorage.removeItem("chatMemory");
    chatHistory.innerHTML = "";
    const msgDiv = addMessage("assistant", "Context cleared. New conversation started.");
    userInput.focus();
    setTimeout(() => {
        if (msgDiv.parentNode) {
            msgDiv.parentNode.removeChild(msgDiv);
        }
    }, 3000);
}

function cleanResponse(text) {
    let t = text.replace(/\r\n/g, "\n");
    t = t.replace(/\n{2,}/g, "\n\n");
    return t.trim();
}

function addMessage(role, text, className = "", isNew = false) {
    const div = document.createElement("div");
    div.className = `message ${role} ${className}`;

    if (role === "assistant") {
        const label = document.createElement("span");
        label.textContent = "AI: ";
        label.className = "label";

        const content = document.createElement("div");
        content.className = "content";
        content.innerHTML = cleanResponse(
            DOMPurify.sanitize(marked.parse(text))
        );

        div.appendChild(label);
        div.appendChild(content);
    } else {
        div.textContent = "You: " + text;
    }

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

function setLoading(isLoading) {
    userInput.disabled = isLoading;
    sendBtn.disabled = false;
    sendBtn.textContent = isLoading ? "Cancel" : "Send";
    clearBtn.disabled = isLoading;
    clearBtn.style.color = isLoading ? "var(--clr-surface-tonal-a20)" : "var(--clr-dark-a0)";
    clearBtn.style.pointerEvents = isLoading ? "none" : "auto";
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
    messages.push(userMessage);

    trimMemoryByTokens();
    saveMemory();

    userInput.value = "";
    attachedBase64 = null;
    document.getElementById("fileName").textContent = "";
    document.getElementById("fileName").style.display = "none";
    document.getElementById("fileInput").value = "";

    const isStreaming = streamToggle.checked;
    let typingMessage;

    if (isStreaming) {
        // start empty for streaming
        typingMessage = addMessage("assistant", "", "typing");
    } else {
        // normal placeholder
        typingMessage = addMessage("assistant", "AI is typing…", "typing");
    }

    setLoading(true);

    currentController = new AbortController();

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
                chatHistory.removeChild(typingMessage);

                // add new AI message with timestamp
                addMessage("assistant", finalText, "", true);


                messages.push({
                    role: "assistant",
                    content: finalText
                });
                trimMemoryByTokens();
                saveMemory();
            }

        } else {
            // non-streaming
            const data = await response.json();
            const aiMessage = data?.message?.content ?? "No response.";

            // remove the old typing placeholder
            chatHistory.removeChild(typingMessage);

            // add new AI message with timestamp
            addMessage("assistant", aiMessage, "", true);

            messages.push({
                role: "assistant",
                content: aiMessage
            });
            trimMemoryByTokens();
            saveMemory();
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
    clearBtn = document.getElementById("clearBtn");
    attachBtn = document.getElementById('attachBtn');
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

    const selectedModelDiv = document.getElementById("selectedModel");
    const modelOptionsDiv = document.getElementById("modelOptions");
    const modelDropdown = document.getElementById("modelDropdown");

    selectedModel = localStorage.getItem("selectedModel") || "llama3.2:3b";
    let selectedModelLabel = [...modelOptionsDiv.children]
        .find(opt => opt.dataset.value === selectedModel)?.textContent;

    if (selectedModelLabel) {
        selectedModelDiv.textContent = selectedModelLabel;
    }

    selectedModelDiv.addEventListener("click", () => {
        modelOptionsDiv.classList.toggle("hidden");
    });

    modelOptionsDiv.querySelectorAll("div").forEach(option => {
        option.addEventListener("click", () => {
            selectedModel = option.dataset.value;
            selectedModelDiv.textContent = option.textContent;
            localStorage.setItem("selectedModel", selectedModel);
            modelOptionsDiv.classList.add("hidden");
        });
    });

    document.addEventListener("click", (e) => {
        if (!modelDropdown.contains(e.target)) {
            modelOptionsDiv.classList.add("hidden");
        }
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
            saveMemory();
            tokensOptionsDiv.classList.add("hidden");
        });
    });

    document.addEventListener("click", (e) => {
        if (!tokensDropdown.contains(e.target)) {
            tokensOptionsDiv.classList.add("hidden");
        }
    });

    messages.forEach(msg => {
        addMessage(msg.role, msg.content);
    });

    sendBtn.addEventListener("click", sendMessage);
    clearBtn.addEventListener("click", clearChat);

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
        const chatHistory = document.getElementById("chatHistory");
        chatHistory.scrollTop = chatHistory.scrollHeight;
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
}

window.addEventListener('load', init);