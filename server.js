const express = require('express');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;

// --- Global State ---
let developerMode = false;

// --- Utility Functions ---
function normalizeString(str) {
    if (typeof str !== 'string') return '';
    // NFKC normalization converts full-width characters to half-width and applies other compatibility compositions.
    return str.normalize('NFKC').toLowerCase();
}

// --- Load Knowledge Base ---
let knowledgeBase;
const knowledgeBasePath = path.join(__dirname, 'knowledge_base.json');

function loadKnowledgeBase() {
  try {
    const rawData = fs.readFileSync(knowledgeBasePath, 'utf8');
    knowledgeBase = JSON.parse(rawData);
    if (!knowledgeBase.keyword_groups) knowledgeBase.keyword_groups = [];
    if (!knowledgeBase.developer_prompt) knowledgeBase.developer_prompt = "You are a helpful AI assistant.";
    console.log('Knowledge base (Grouping Model) loaded successfully.');
  } catch (error) {
    console.error('Error loading knowledge_base.json:', error);
    process.exit(1);
  }
}

function saveKnowledgeBase() {
  try {
    fs.writeFileSync(knowledgeBasePath, JSON.stringify(knowledgeBase, null, 2), 'utf8');
    console.log('Knowledge base saved successfully.');
    return true;
  } catch (error) {
    console.error('Error writing to knowledge_base.json:', error);
    return false;
  }
}

loadKnowledgeBase(); // Initial load
// --------------------------

// --- Gemini AI Setup ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('ERROR: GEMINI_API_KEY environment variable not set.');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
// ------------------------

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// =================================================================
// --- V3.2 - Final Phase 1 Command Parser ---
// =================================================================

const COMMAND_LIST = `可用指令 (群組模型 v3.2)：
- /add <關鍵字> <回應>
- /delete <關鍵字>
- /replace <任一關鍵字> <新回應>
- /alias <任一關鍵字> += <新同義詞1>,<新同義詞2>...
- /list
- /help
- /小凱bye`;

function findKeyword(keyword) {
    const normalizedKeyword = normalizeString(keyword);
    for (let i = 0; i < knowledgeBase.keyword_groups.length; i++) {
        if (knowledgeBase.keyword_groups[i].synonyms.includes(normalizedKeyword)) {
            return { group: knowledgeBase.keyword_groups[i], groupIndex: i, keywordIndex: knowledgeBase.keyword_groups[i].synonyms.indexOf(normalizedKeyword) };
        }
    }
    return null;
}

function handleCommand(rawMessage) {
    const message = normalizeString(rawMessage);
    const parts = message.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
        case '/help':
            return COMMAND_LIST;

        case '/add': {
            if (args.length < 2) return '格式錯誤。用法：/add <關鍵字> <回應內容>';
            const keyword = args[0];
            const response = parts.slice(2).join(' '); // Re-join from original parts to preserve case in response
            if (findKeyword(keyword)) {
                return `新增失敗：「${keyword}」已存在於某個群組中。`;
            }
            knowledgeBase.keyword_groups.push({ synonyms: [keyword], response: response });
            return saveKnowledgeBase() ? `已建立新的關鍵字群組：「${keyword}」。` : '儲存知識庫失敗。';
        }

        case '/delete': {
            if (args.length !== 1) return '格式錯誤。用法：/delete <關鍵字>';
            const keyword = args[0];
            const found = findKeyword(keyword);
            if (!found) return `刪除失敗：關鍵字「${keyword}」不存在。`;
            found.group.synonyms.splice(found.keywordIndex, 1);
            if (found.group.synonyms.length === 0) {
                knowledgeBase.keyword_groups.splice(found.groupIndex, 1);
                return saveKnowledgeBase() ? `已刪除關鍵字「${keyword}」並移除了其空的群組。` : '儲存知識庫失敗。';
            }
            return saveKnowledgeBase() ? `已從群組中刪除關鍵字：「${keyword}」。` : '儲存知識庫失敗。';
        }

        case '/replace': {
            if (args.length < 2) return '格式錯誤。用法：/replace <任一關鍵字> <新的回應內容>';
            const keyword = args[0];
            const response = parts.slice(2).join(' ');
            const found = findKeyword(keyword);
            if (!found) return `替換失敗：關鍵字「${keyword}」不存在。`;
            found.group.response = response;
            return saveKnowledgeBase() ? `已更新「${found.group.synonyms.join(', ')}」群組的回應。` : '儲存知識庫失敗。';
        }

        case '/alias': {
            const addOperatorIndex = args.indexOf('+=');
            if (addOperatorIndex < 0) return "格式錯誤。用法：/alias <任一關鍵字> += <新同義詞1>...";
            const existingKeyword = args.slice(0, addOperatorIndex).join(' ');
            const aliasesToAddRaw = args.slice(addOperatorIndex + 1).join(' ');
            const found = findKeyword(existingKeyword);
            if (!found) return `新增同義詞失敗：關鍵字「${existingKeyword}」不存在。`;
            const aliasesToAdd = aliasesToAddRaw.split(/[,，]/).map(a => normalizeString(a.trim())).filter(a => a);
            if (aliasesToAdd.length === 0) return '格式錯誤：請提供要新增的同義詞。';
            let added = [], skipped = [];
            for (const alias of aliasesToAdd) {
                if (findKeyword(alias)) { skipped.push(alias); }
                else { found.group.synonyms.push(alias); added.push(alias); }
            }
            let response = added.length > 0 ? `已新增同義詞：${added.join(', ')} 至「${found.group.synonyms[0]}」群組。` : '';
            if (skipped.length > 0) response += `\n已跳過（重複）：${skipped.join(', ')}。`;
            if (added.length > 0) saveKnowledgeBase();
            return response || '沒有可新增的同義詞。';
        }

        case '/list': {
            let list = '--- 知識庫列表 (群組模型) ---\n';
            knowledgeBase.keyword_groups.forEach((group, index) => {
                list += `\n[群組 ${index + 1}]\n  關鍵字: ${group.synonyms.join(', ')}\n  回應: ${group.response}\n`;
            });
            return list;
        }

        default:
            return `未知指令：${command}。請輸入 /help 查看可用指令。`;
    }
}

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const rawUserMessage = req.body.message;
    const normalizedUserMessage = normalizeString(rawUserMessage);
    console.log(`\n--- New Request: "${rawUserMessage}" (Normalized: "${normalizedUserMessage}") ---`);

    if (normalizedUserMessage === '/呼叫小凱') {
      developerMode = true;
      console.log('Developer Mode ACTIVATED.');
      return res.json({ reply: `小凱在，開發者模式已經開啟。\n\n${COMMAND_LIST}` });
    }
    if (normalizedUserMessage === '/小凱bye') {
      developerMode = false;
      console.log('Developer Mode DEACTIVATED.');
      return res.json({ reply: '開發者模式已關閉。小凱下次見！' });
    }

    if (normalizedUserMessage.startsWith('/')) {
      if (developerMode) {
        const reply = handleCommand(rawUserMessage); // Pass raw message to handle case-sensitive responses
        return res.json({ reply });
      }
      return res.json({ reply: '權限不足。請先呼叫小凱啟用開發者模式。' });
    }

    const foundGroup = knowledgeBase.keyword_groups.find(g => g.synonyms.includes(normalizedUserMessage));

    if (foundGroup) {
        console.log(`Responding with GROUP match: "${normalizedUserMessage}" -> [${foundGroup.synonyms.join(', ')}]`);
        return res.json({ reply: foundGroup.response });
    }

    // Fallback to General AI
    console.log('No group match found. Sending to General AI...');
    const prompt = developerMode ? knowledgeBase.developer_prompt : knowledgeBase.system_prompt;
    const fullPrompt = `${prompt}\n\n顧客問題：${rawUserMessage}`;
    const result = await model.generateContent(fullPrompt);
    res.json({ reply: result.response.text() });

  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ reply: "與 AI 客服通訊時發生錯誤。" });
  }
});

// API endpoint for saving the message from the modal
app.post('/api/save-message', async (req, res) => {
  try {
    const { name, phone, message } = req.body;
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}]\n  Name: ${name || 'N/A'}\n  Phone: ${phone || 'N/A'}\n  Message: "${message}"\n--------------------\n`;
    await fs.promises.appendFile('customer_messages.log', logEntry);
    console.log('Saved message to customer_messages.log');
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