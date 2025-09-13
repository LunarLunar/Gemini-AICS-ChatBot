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
      console.log('"Leave message" intent detected. Instructing frontend to show modal.');
      // Instead of logging here, tell the frontend to open the modal
      return res.json({ action: 'show_modal', reply: '好的，請您填寫以下的留言表單。' });
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

// API endpoint for saving the message from the modal
app.post('/api/save-message', async (req, res) => {
  try {
    const { name, phone, message } = req.body;
    const timestamp = new Date().toISOString();

    // Format the log entry
    let logEntry = `[${timestamp}]\n`;
    logEntry += `  Name: ${name || 'N/A'}\n`;
    logEntry += `  Phone: ${phone || 'N/A'}\n`;
    logEntry += `  Message: "${message}"\n--------------------\n`;

    await fs.promises.appendFile('customer_messages.log', logEntry);

    console.log('Saved message from modal to customer_messages.log');
    res.json({ success: true, reply: '您的留言已成功送出，感謝您！' });
  } catch (error) {
    console.error("Error in /api/save-message:", error);
    res.status(500).json({ success: false, reply: '儲存留言時發生錯誤，請稍後再試。' });
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