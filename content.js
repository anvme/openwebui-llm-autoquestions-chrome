let QUESTIONS = [];
let isRunning = false;
let timeoutId = null;
let askedQuestionIds = new Set(); // Questions asked today
let allAskedQuestionIds = new Set(); // All questions ever asked
const MAX_QUESTIONS_PER_DAY = 5;
const DELAY_BETWEEN_QUESTIONS = 180000; // 3 minutes
const RANDOM_ORDER = false; // Set to true for random question order
const PERIODIC_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes - check for date changes and auto-start
const WORKING_HOURS_START = 10; // Start hour (24-hour format)
const WORKING_HOURS_END = 17; // End hour (24-hour format)
const ENABLED_DAYS = [1, 2, 3, 4, 5]; // Days to send messages: 0=Sunday, 1=Monday, ..., 6=Saturday
const EXCLUDED_DATES = [
  // Новогодние каникулы
  '01-01', // January 1
  '01-02', // January 2
  '01-03', // January 3
  '01-04', // January 4
  '01-05', // January 5
  '01-06', // January 6
  '01-08', // January 8
  '01-07', // January 7 - Рождество Христово
  '02-23', // February 23 - День защитника Отечества
  '03-08', // March 8 - Международный женский день
  '03-09', // March 9 - Дополнительный выходной
  '05-01', // May 1 - Праздник Весны и Труда
  '05-09', // May 9 - День Победы
  '05-11', // May 11 - Дополнительный выходной
  '06-12', // June 12 - День России
  '11-04', // November 4 - День народного единства
  '12-30', // December 30 - Новый год
  '12-31', // December 31 - Новый год
  // Add more dates in 'MM-DD' format
];

// Load questions from extension resources
async function loadQuestions() {
  try {
    // Load from extension's q.json file
    const url = chrome.runtime.getURL('q.json');
    const response = await fetch(url);
    if (response.ok) {
      QUESTIONS = await response.json();
      console.log(`📚 Loaded ${QUESTIONS.length} questions from q.json`);
      return;
    }
  } catch (error) {
    console.error('❌ Failed to load questions from q.json:', error);
  }
  
  QUESTIONS = [];
  console.log('❌ No questions loaded - q.json failed to load');
}

// Check if current time is within working hours and enabled days
function isWorkingHours() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Check if today is in excluded dates (holidays)
  const monthDay = String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(now.getDate()).padStart(2, '0');
  if (EXCLUDED_DATES.includes(monthDay)) {
    return false;
  }
  
  // Check if current day is in enabled days
  if (!ENABLED_DAYS.includes(dayOfWeek)) {
    return false;
  }
  
  // Check if it's within working hours
  return hour >= WORKING_HOURS_START && hour < WORKING_HOURS_END;
}

// Get today's date as a string
function getTodayDateString() {
  const today = new Date();
  return today.getFullYear() + '-' + 
         String(today.getMonth() + 1).padStart(2, '0') + '-' + 
         String(today.getDate()).padStart(2, '0');
}

// Load asked question IDs from Chrome storage
async function loadAskedQuestions() {
  const today = getTodayDateString();
  const storageKey = `askedQuestions_${today}`;
  
  try {
    const result = await chrome.storage.local.get([storageKey, 'allAskedQuestions']);
    
    // Load today's asked questions
    if (result[storageKey]) {
      askedQuestionIds = new Set(result[storageKey]);
    } else {
      askedQuestionIds = new Set();
    }
    
    // Load all-time asked questions
    if (result.allAskedQuestions) {
      allAskedQuestionIds = new Set(result.allAskedQuestions);
    } else {
      allAskedQuestionIds = new Set();
    }
    
    console.log(`📋 Loaded ${askedQuestionIds.size} asked question IDs for today, ${allAskedQuestionIds.size} total ever asked`);
  } catch (error) {
    console.error('❌ Failed to load asked questions from storage:', error);
    askedQuestionIds = new Set();
    allAskedQuestionIds = new Set();
  }
}

// Save asked question IDs to Chrome storage
async function saveAskedQuestions() {
  const today = getTodayDateString();
  const storageKey = `askedQuestions_${today}`;
  
  try {
    await chrome.storage.local.set({
      [storageKey]: [...askedQuestionIds],
      'allAskedQuestions': [...allAskedQuestionIds]
    });
  } catch (error) {
    console.error('❌ Failed to save asked questions to storage:', error);
  }
}

// Check if we already asked questions today and reached the limit
function hasReachedDailyLimit() {
  return askedQuestionIds.size >= MAX_QUESTIONS_PER_DAY;
}

// Clean up old Chrome storage entries (keep only today's)
async function cleanupOldEntries() {
  const today = getTodayDateString();
  
  try {
    const allKeys = await chrome.storage.local.get(null);
    const keysToRemove = [];
    
    for (const key in allKeys) {
      if (key.startsWith('askedQuestions_') && !key.endsWith(today)) {
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`🧹 Cleaned up ${keysToRemove.length} old storage entries`);
    }
  } catch (error) {
    console.error('❌ Failed to cleanup old storage entries:', error);
  }
}

// Wait for page to be fully loaded and Open WebUI to be ready
function waitForOpenWebUI() {
  return new Promise((resolve) => {
    const checkForChatInput = () => {
      const chatInput = document.getElementById('chat-input');
      if (chatInput && chatInput.querySelector('p')) {
        console.log('🎯 Open WebUI chat interface detected');
        resolve();
      } else {
        setTimeout(checkForChatInput, 1000);
      }
    };
    checkForChatInput();
  });
}

// Initialize the extension
async function initializeExtension() {
  try {
    // Wait for Open WebUI to be fully loaded
    await waitForOpenWebUI();
    
    await loadQuestions();
    await loadAskedQuestions();
    await cleanupOldEntries();
    console.log('✅ Extension initialized successfully');
    
    // Check if we should auto-start
    await checkAutoStart();
    
    // Start periodic check for new day (every hour)
    startPeriodicCheck();
  } catch (error) {
    console.error('❌ Extension initialization failed:', error);
  }
}

// Periodic check for new day and auto-start (for 24/7 open pages)
let periodicCheckInterval = null;
let lastCheckedDate = getTodayDateString();

function startPeriodicCheck() {
  // Check periodically if date changed or if we should auto-start
  periodicCheckInterval = setInterval(async () => {
    const currentDate = getTodayDateString();
    
    // Detect if date changed (new day)
    if (currentDate !== lastCheckedDate) {
      console.log(`📅 Date changed from ${lastCheckedDate} to ${currentDate}`);
      lastCheckedDate = currentDate;
      
      // Reload asked questions for new day
      await loadAskedQuestions();
      await cleanupOldEntries();
      
      // Check if we should auto-start
      const result = await chrome.storage.local.get(['autoStartEnabled']);
      if (result.autoStartEnabled && !isRunning && isWorkingHours() && !hasReachedDailyLimit()) {
        console.log('🚀 Auto-starting (new day detected via date change)');
        await startAsking();
      }
      return;
    }
    
    // Regular check if not running
    if (!isRunning) {
      const result = await chrome.storage.local.get(['autoStartEnabled']);
      
      if (result.autoStartEnabled) {
        // Reload asked questions to check for manual resets
        await loadAskedQuestions();
        
        if (isWorkingHours() && !hasReachedDailyLimit()) {
          console.log('🚀 Auto-starting (periodic check - questions available)');
          await startAsking();
        }
      }
    }
  }, PERIODIC_CHECK_INTERVAL);
}

// Check if extension should auto-start
async function checkAutoStart() {
  try {
    const result = await chrome.storage.local.get(['autoStartEnabled']);
    
    if (result.autoStartEnabled && isWorkingHours() && !hasReachedDailyLimit()) {
      console.log('🚀 Auto-starting (initialization check)');
      startAsking();
    }
  } catch (error) {
    console.error('❌ Failed to check auto-start:', error);
  }
}

// Initialize only when first message is received (lazy initialization)
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    initialized = true;
    await initializeExtension();
  }
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // Handle messages after ensuring initialization
  (async () => {
    await ensureInitialized();
    
    if (req.action === 'toggle') {
      if (isRunning) {
        stopAsking();
      } else {
        await startAsking();
      }
      sendResponse({ isRunning: isRunning });
    }
    
    if (req.action === 'getStatus') {
      sendResponse({ isRunning: isRunning });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Listen for storage changes to detect manual resets or day changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local') {
    const today = getTodayDateString();
    const todayKey = `askedQuestions_${today}`;
    
    // Check if today's storage was modified or deleted
    if (changes[todayKey]) {
      console.log('📝 Storage changed, reloading asked questions...');
      await loadAskedQuestions();
      
      // If extension was stopped due to limit but now there's room, restart
      if (!isRunning && !hasReachedDailyLimit()) {
        const result = await chrome.storage.local.get(['autoStartEnabled']);
        if (result.autoStartEnabled && isWorkingHours()) {
          console.log('🚀 Auto-restarting after storage change (questions reset detected)');
          await startAsking();
        }
      }
    }
  }
});

async function startAsking() {
  if (!isWorkingHours()) {
    console.log('⏰ Outside working hours (10 AM - 5 PM). Auto-asking disabled.');
    return;
  }
  
  if (hasReachedDailyLimit()) {
    console.log(`📊 Daily limit of ${MAX_QUESTIONS_PER_DAY} questions already reached for today.`);
    return;
  }
  
  if (QUESTIONS.length === 0) {
    console.log('❌ No questions available. Failed to load questions.');
    return;
  }
  
  isRunning = true;
  console.log('🤖 Auto-asking started!');
  
  // Enable auto-start for next day
  try {
    await chrome.storage.local.set({ autoStartEnabled: true });
    console.log('✅ Auto-start enabled for next day');
  } catch (err) {
    console.error('Failed to save auto-start setting:', err);
  }
  
  askNextQuestion();
}

function stopAsking() {
  isRunning = false;
  if (timeoutId) clearTimeout(timeoutId);
  console.log('⏸️ Auto-asking stopped!');
  
  // Disable auto-start when manually stopped
  chrome.storage.local.set({ autoStartEnabled: false }).catch(err => {
    console.error('Failed to save auto-start setting:', err);
  });
}

async function askNextQuestion() {
  if (!isRunning) {
    console.log('✅ Stopping: Manually stopped!');
    return;
  }
  
  // Reload asked questions from storage to handle manual resets and day changes
  await loadAskedQuestions();
  
  if (hasReachedDailyLimit()) {
    console.log('✅ Stopping: Daily limit reached!');
    isRunning = false;
    return;
  }
  
  if (!isWorkingHours()) {
    console.log('⏰ Outside working hours. Stopping auto-asking.');
    isRunning = false;
    return;
  }
  
  let questionIndex;
  let question;
  
  if (RANDOM_ORDER) {
    // Random order: Get available question IDs (never asked before)
    const availableIndices = [];
    for (let i = 0; i < QUESTIONS.length; i++) {
      if (!allAskedQuestionIds.has(i)) {
        availableIndices.push(i);
      }
    }
    
    if (availableIndices.length === 0) {
      console.log('📝 All questions have been asked already!');
      isRunning = false;
      return;
    }
    
    // Pick a random question from available ones
    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    questionIndex = availableIndices[randomIndex];
  } else {
    // Sequential order: Find the first unasked question (never asked before)
    questionIndex = -1;
    for (let i = 0; i < QUESTIONS.length; i++) {
      if (!allAskedQuestionIds.has(i)) {
        questionIndex = i;
        break;
      }
    }
    
    if (questionIndex === -1) {
      console.log('📝 All questions have been asked already!');
      isRunning = false;
      return;
    }
  }
  
  question = QUESTIONS[questionIndex];
  
  // Mark question ID as asked (both for today and all-time)
  askedQuestionIds.add(questionIndex);
  allAskedQuestionIds.add(questionIndex);
  await saveAskedQuestions();
  
  sendQuestion(question);
  
  console.log(`📤 Sent question ${askedQuestionIds.size}/${MAX_QUESTIONS_PER_DAY} today (ID: ${questionIndex}, Total asked: ${allAskedQuestionIds.size}/${QUESTIONS.length}): ${question}`);
  console.log(`⏱️ Next question in ${DELAY_BETWEEN_QUESTIONS/1000}s`);
  
  timeoutId = setTimeout(() => askNextQuestion(), DELAY_BETWEEN_QUESTIONS);
}

function sendQuestion(text) {
  const input = document.getElementById('chat-input');
  
  if (!input) {
    console.error('❌ Chat input not found');
    return;
  }
  
  // Try multiple approaches to set the text
  const p = input.querySelector('p');
  
  if (p) {
    // Method 1: Clear completely and wait
    p.innerHTML = '';
    p.textContent = '';
    
    // Wait a bit then set new text
    setTimeout(() => {
      // Create a new text node
      const textNode = document.createTextNode(text);
      p.appendChild(textNode);
      
      // Remove empty classes
      p.classList.remove('is-empty', 'is-editor-empty');
      input.classList.remove('is-empty', 'is-editor-empty');
      
      // Trigger input events
      input.dispatchEvent(new Event('input', { bubbles: true }));
      p.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Wait before sending
      setTimeout(() => {
        // Focus
        p.focus();
        
        // Try clicking the send button instead of keyboard event
        const sendButton = document.querySelector('button[type="submit"]') || 
                          document.querySelector('button[aria-label*="Send"]') ||
                          document.querySelector('button.absolute.bottom-0.right-0');
        
        if (sendButton) {
          console.log('📤 Clicking send button');
          sendButton.click();
        } else {
          // Fallback to keyboard event
          console.log('📤 Using keyboard event');
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          
          p.dispatchEvent(enterEvent);
          input.dispatchEvent(enterEvent);
        }
        
        console.log('📤 Sent:', text);
      }, 800);
    }, 200);
  }
}