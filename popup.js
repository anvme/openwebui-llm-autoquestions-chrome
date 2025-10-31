document.addEventListener('DOMContentLoaded', async () => {
    const toggleBtn = document.getElementById('toggleBtn');
    const status = document.getElementById('status');
    
    // Don't check status on popup open to avoid interfering with page load
    status.textContent = 'Click to start';
    status.style.color = 'gray';
    
    toggleBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url || !tab.url.includes('ai.anvcore.io')) {
                status.textContent = 'Please navigate to ai.anvcore.io first';
                status.style.color = 'red';
                return;
            }
            
            status.textContent = 'Processing...';
            status.style.color = 'blue';
            
            try {
                // Try to send message first to see if already injected
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
                
                if (response && response.isRunning) {
                    status.textContent = '🟢 Running';
                    status.style.color = 'green';
                    toggleBtn.textContent = 'Stop Auto Ask';
                    
                    // Set green badge
                    chrome.action.setBadgeText({ text: '●', tabId: tab.id });
                    chrome.action.setBadgeBackgroundColor({ color: '#00FF00', tabId: tab.id });
                } else {
                    status.textContent = 'Stopped';
                    status.style.color = 'gray';
                    toggleBtn.textContent = 'Start Auto Ask';
                    
                    // Clear badge
                    chrome.action.setBadgeText({ text: '', tabId: tab.id });
                }
            } catch (error) {
                // Not injected yet, inject now
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    
                    status.textContent = 'Initializing (wait 3s)...';
                    
                    // Wait for script to initialize
                    setTimeout(async () => {
                        try {
                            const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
                            
                            if (response && response.isRunning) {
                                status.textContent = '🟢 Started successfully!';
                                status.style.color = 'green';
                                toggleBtn.textContent = 'Stop Auto Ask';
                                
                                // Set green badge
                                chrome.action.setBadgeText({ text: '●', tabId: tab.id });
                                chrome.action.setBadgeBackgroundColor({ color: '#00FF00', tabId: tab.id });
                            }
                        } catch (e) {
                            status.textContent = 'Started (no response)';
                            status.style.color = 'orange';
                        }
                    }, 3000);
                } catch (injectError) {
                    status.textContent = 'Injection failed: ' + injectError.message;
                    status.style.color = 'red';
                }
            }
        } catch (error) {
            status.textContent = 'Error: ' + error.message;
            status.style.color = 'red';
        }
    });
});