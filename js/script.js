let messages = JSON.parse(localStorage.getItem("chatMemory")) || [];
const MAX_MESSAGES = 50;
let selectedModel;
let chatHistory;
let userInput;
let sendBtn;
let clearBtn;
let isDragging = false;

function trimMemory() {
    if (messages.length > MAX_MESSAGES) {
        messages.splice(0, messages.length - MAX_MESSAGES);
    }
}

function saveMemory() {
    localStorage.setItem("chatMemory", JSON.stringify(messages));
}

function clearChat() {
    messages.length = 0;
    localStorage.removeItem("chatMemory");
    chatHistory.innerHTML = "";
    addMessage("assistant", "Context cleared. New conversation started.");
}

function cleanResponse(text) {
    let t = text.replace(/\r\n/g, "\n");
    t = t.replace(/\n{2,}/g, "\n\n");
    return t.trim();
}

function addMessage(role, text, className = "") {
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

    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return div;
}

function setLoading(isLoading) {
    userInput.disabled = isLoading;
    sendBtn.disabled = isLoading;
    sendBtn.textContent = isLoading ? "…" : "Send";
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    let messageContent = text;

    addMessage("user", messageContent);

    messages.push({
        role: "user",
        content: messageContent
    });
    trimMemory();
    saveMemory();

    userInput.value = "";

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
            })
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
            messages.push({
                role: "assistant",
                content: finalText
            });
            trimMemory();
            saveMemory();

        } else {
            // non-streaming
            const data = await response.json();
            const aiMessage = data?.message?.content ?? "No response.";
            typingMessage.dataset.raw = aiMessage;
            const contentDiv = typingMessage.querySelector(".content");

            contentDiv.innerHTML = cleanResponse(
                DOMPurify.sanitize(marked.parse(aiMessage.trimStart()))
            );
            messages.push({
                role: "assistant",
                content: aiMessage
            });
            trimMemory();
            saveMemory();
        }

    } catch (err) {
        typingMessage.textContent = `AI: ⚠️ Error: ${err.message}`;
        console.error("Request failed:", err);
    } finally {
        typingMessage.classList.remove("typing");
        setLoading(false);
    }
}

function init() {
    chatHistory = document.getElementById("chatHistory");
    userInput = document.getElementById("userInput");
    sendBtn = document.getElementById("sendBtn");
    clearBtn = document.getElementById("clearBtn");

    const selectedModelDiv = document.getElementById("selectedModel");
    const optionsDiv = document.getElementById("modelOptions");
    const dropdown = document.getElementById("modelDropdown");

    selectedModel = localStorage.getItem("selectedModel") || "llama3.2:3b";
    let selectedLabel = [...optionsDiv.children]
        .find(opt => opt.dataset.value === selectedModel)?.textContent;

    if (selectedLabel) {
        selectedModelDiv.textContent = selectedLabel;
    }

    selectedModelDiv.addEventListener("click", () => {
        optionsDiv.classList.toggle("hidden");
    });

    optionsDiv.querySelectorAll("div").forEach(option => {
        option.addEventListener("click", () => {
            selectedModel = option.dataset.value;
            selectedModelDiv.textContent = option.textContent;
            localStorage.setItem("selectedModel", selectedModel);
            optionsDiv.classList.add("hidden");
        });
    });

    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target)) {
            optionsDiv.classList.add("hidden");
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

    const streamToggle = document.getElementById("streamToggle");

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