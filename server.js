const express = require('express');
const path = require('path');
const fs = require('fs'); // 引入檔案系統模組
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;

// --- Load Knowledge Base ---
let knowledgeBase;
try {
  // Use require to load the JSON file directly.
  // This allows bundlers like Vercel to include the file in the deployment.
  knowledgeBase = require('./knowledge_base.json');
  console.log('Knowledge base loaded successfully.');
} catch (error) {
  console.error('Error loading knowledge_base.json with require():', error);
  // If the knowledge base is critical, you might want to exit
  process.exit(1);
}
// --------------------------

// --- Gemini AI Setup ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('ERROR: GEMINI_API_KEY environment variable not set.');
  console.error('Please set it before running the server: set GEMINI_API_KEY=YOUR_API_KEY');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
// ------------------------

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    const userMessageLower = userMessage.toLowerCase(); // For case-insensitive matching
    console.log('Received message from client:', userMessage);

    // 1. Check for "leave a message" intent
    const leaveMessageKeywords = ['留言', '轉告', '專人'];
    if (leaveMessageKeywords.some(keyword => userMessageLower.includes(keyword))) {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] Customer Message: "${userMessage}"\n`;

      // Asynchronously append to the log file
      await fs.promises.appendFile('customer_messages.log', logEntry);

      console.log('Message logged to customer_messages.log');
      return res.json({ reply: '好的，您的留言我們已經記錄下來，客服人員將會盡快為您處理。' });
    }

    // 2. Check for keywords in the knowledge base
    for (const keyword in knowledgeBase.keywords) {
      if (userMessageLower.includes(keyword)) {
        const botResponse = knowledgeBase.keywords[keyword];
        console.log(`Responding with knowledge base rule: ${keyword}`);
        // We send the response and stop further processing
        return res.json({ reply: botResponse });
      }
    }

    // 3. If no keyword matches, send to Gemini AI with a system prompt
    console.log('No keyword rule matched, sending to Gemini AI...');
    const prompt = `${knowledgeBase.system_prompt}\n\n顧客問題：${userMessage}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const botResponse = response.text();

    console.log('Sending response from Gemini:', botResponse);
    res.json({ reply: botResponse });

  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ reply: "與 AI 客服通訊時發生錯誤。請檢查伺服器日誌。" });
  }
});

// Serve index.html for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log('Caesar Bath customer service AI is active.');
});