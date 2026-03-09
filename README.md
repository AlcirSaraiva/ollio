# Ollio - UI for Ollama

A clean, modern web interface for interacting with [Ollama](https://ollama.ai/) - a tool for running large language models locally.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Ollama](https://img.shields.io/badge/Ollama-API-green.svg)

## Features

- 💬 **Chat Interface** - Clean, responsive chat UI for conversing with AI models
- 🔄 **Streaming Support** - Toggle real-time streaming responses on/off
- 🎯 **Model Selection** - Choose from all available Ollama models installed locally
- 📁 **Conversation Management** - Save, load, and delete conversations with localStorage persistence
- 🖼️ **Image Support** - Attach and send images for multimodal model interactions
- 🎨 **Dark Theme** - Beautiful dark mode interface with custom color palette
- ⚡ **Token Management** - Configure max tokens (1K-8K) to control context window
- 📝 **Markdown Rendering** - Formatted responses with syntax highlighting using Marked.js
- 🛡️ **XSS Protection** - Sanitized output with DOMPurify

## Project Structure

```
ollio/
├── index.html          # Main HTML structure
├── ollio.png
├── ollioimg.png
├── favicon.png
├── css/
│   └── style.css       # Custom dark theme styles
│   └── cascadia-code   # Font used
├── js/
│   └── script.js       # Application logic and Ollama API integration
└── README.md           # This file
```

## Prerequisites

1. **Ollama installed** - Download from [ollama.ai](https://ollama.ai)
2. **At least one model** - Pull a model using `ollama pull <model-name>`
   - Example: `ollama pull llama3.2` or `ollama pull mistral`
3. **Ollama running** - Start Ollama server with `ollama serve`

## Installation

1. Clone or download this repository
2. Start a local web server (required to avoid CORS errors):

   **Option A: Python HTTP Server**
   ```bash
   # Navigate to the project directory
   cd ollio
   
   # Start Python HTTP server on port 8000
   python3 -m http.server 8000
   ```

   **Option B: Create a Shell Script and make it run on boot** (that's what I use)

   Create a file named `start.sh`:
   ```bash
   #!/bin/bash
   cd /path/to/ollio/ || exit
   python3 -m http.server 8000
   ```
   
   Make it executable: `chmod +x start.sh`
   
   Run with: `./start.sh` (you can set it to run on machine start)

   **Option C: Other Servers**
   - Node.js: `npx http-server -p 8000`
   - PHP: `php -S localhost:8000`
   - VS Code: Use "Live Server" extension

3. Open your browser and navigate to `http://localhost:8000`
4. The interface will automatically connect to your Ollama `http://localhost:11434`

> **Note**: A local web server is required due to browser CORS security policies when making API requests to Ollama.

## Usage

### Basic Chat
1. Select a model from the dropdown menu
2. Type your message in the input area
3. Click **Send** or press Enter
4. View the AI's response in the chat history

### Conversation Management
- **New Conversation**: Click the "New" button to start a fresh chat
- **Saved Conversations**: Previous chats are automatically saved and listed on the left
- **Load Conversation**: Click any saved conversation to resume
- **Delete**: Hover over a saved conversation and click the × button to delete

### Settings
- **Stream Toggle**: Enable/disable streaming responses in real-time
- **Tokens**: Select context window size (1024-8192 tokens)
- **Model**: Choose which Ollama model to use

### Image Attachments
1. Click the **+** button next to the input field
2. Select an image file
3. Send your message with the attached image
4. Works with multimodal models like LLaVA or llama3.2-vision

## Technologies Used

- **HTML5** - Semantic markup structure
- **CSS3** - Custom dark theme with CSS variables
- **Vanilla JavaScript** - No frameworks, pure ES6+
- **Marked.js** - Markdown parsing and rendering
- **DOMPurify** - HTML sanitization for security
- **localStorage** - Persistent conversation storage

## Security Notes

- All data is stored locally in browser localStorage
- No data is sent to external servers (only to your local Ollama instance)
- DOMPurify sanitizes all markdown output to prevent XSS attacks
- Image attachments are converted to base64 and stored locally

## Troubleshooting

**Models not loading?**
- Ensure Ollama is running: `ollama serve`
- Verify Ollama API is accessible at `http://localhost:11434`

**Conversations not saving?**
- Check if localStorage is enabled in your browser
- Ensure you're not in incognito/private mode

**Images not working?**
- Use a multimodal model (e.g., `llava`, `llama3.2-vision`)
- Check file size limits in Ollama configuration

## License

MIT License - feel free to use, modify, and distribute.

## Acknowledgments

- [Ollama](https://ollama.ai) - Local LLM runtime
- [Marked.js](https://marked.js.org/) - Markdown parser
- [DOMPurify](https://github.com/cure53/DOMPurify) - HTML sanitizer

---

**Enjoy chatting with your local AI models! 🚀**
