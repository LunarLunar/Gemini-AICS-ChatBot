# Caesar Bath AI Customer Service Chatbot

This project is a web-based AI customer service chatbot for a fictional company, "Caesar Bath". It uses Node.js and Express for the backend, and Google's Gemini Pro for its natural language processing capabilities.

## Features

-   **Keyword Detection**: Responds instantly to predefined keywords (e.g., "退貨", "安裝").
-   **AI-Powered Responses**: For more complex queries, it leverages the Gemini 1.5 Flash model to provide intelligent and conversational answers.
-   **Leave a Message**: Users can choose to leave a message, which is saved to a local log file (`customer_messages.log`) for human follow-up.
-   **Configurable Persona**: The AI's personality and rules are defined in an external `knowledge_base.json` file.

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd DEV_GeminAICS
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up the Environment Variable:**
    This project requires a Google Gemini API key. You must set it as an environment variable.

    **On Windows (Command Prompt):**
    ```cmd
    set GEMINI_API_KEY=YOUR_API_KEY
    ```

    **On Windows (PowerShell):**
    ```powershell
    $env:GEMINI_API_KEY="YOUR_API_KEY"
    ```

    **On macOS/Linux:**
    ```bash
    export GEMINI_API_KEY=YOUR_API_KEY
    ```
    *Replace `YOUR_API_KEY` with your actual Gemini API key.*

4.  **Run the server:**
    ```bash
    node server.js
    ```

5.  Open your browser and navigate to `http://localhost:3000`.
