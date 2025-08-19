/* index.js – Telegram "/clockin" bot for GreytHR portal */
require('dotenv').config();

const { Telegraf } = require('telegraf');
const { chromium } = require('playwright');

const BOT_TOKEN = process.env.BOT_TOKEN;
const HR_USER   = process.env.HR_USER;
const HR_PASS   = process.env.HR_PASS;
const HR_URL    = process.env.HR_URL;

/* ---------- GreytHR specific selectors ---------- */
const USERNAME_BOX = '#username';
const PASSWORD_BOX = '#password';
const LOGIN_BTN    = 'button[type=submit]';
/* ------------------------------------------------ */

async function performHRAction(action = 'signin') {
  const browser = await chromium.launch({ 
    headless: false,  // Set to true after testing
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    console.log(`🚀 Starting ${action} process...`);
    
    /* 1. Open login page */
    console.log('🌐 Opening GreytHR portal...');
    await page.goto(HR_URL, { waitUntil: 'networkidle' });

    /* 2. Fill credentials and log in */
    console.log('👤 Filling username...');
    await page.fill(USERNAME_BOX, HR_USER);
    
    console.log('🔑 Filling password...');
    await page.fill(PASSWORD_BOX, HR_PASS);
    
    console.log('🚀 Clicking login...');
    await page.click(LOGIN_BTN);

    /* 3. Wait for dashboard to load */
    console.log('⏳ Waiting for dashboard...');
    await page.waitForLoadState('networkidle');
    
    // Wait for Angular app and components to fully load
    await page.waitForTimeout(8000);
    console.log('✅ Dashboard loaded');

    /* 4. Debug: Find all buttons and their properties */
    console.log('🔍 Analyzing page buttons...');
    
    const allButtons = await page.evaluate(() => {
      const buttons = [];
      
      // Find all regular buttons
      document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach((btn, index) => {
        buttons.push({
          type: 'regular',
          index: index,
          text: btn.textContent?.trim() || btn.value || '',
          visible: btn.offsetParent !== null,
          classes: btn.className || '',
          id: btn.id || '',
          tagName: btn.tagName
        });
      });
      
      // Find custom components (gt-button)
      document.querySelectorAll('gt-button').forEach((btn, index) => {
        buttons.push({
          type: 'custom',
          index: index,
          text: btn.textContent?.trim() || '',
          visible: btn.offsetParent !== null,
          classes: btn.className || '',
          shade: btn.getAttribute('shade') || '',
          name: btn.getAttribute('name') || '',
          tagName: btn.tagName
        });
      });
      
      // Look for attendance widget specifically
      const attendanceWidget = document.querySelector('gt-attendance-info');
      if (attendanceWidget) {
        const buttonsInWidget = attendanceWidget.querySelectorAll('gt-button');
        buttonsInWidget.forEach((btn, index) => {
          buttons.push({
            type: 'attendance-widget',
            index: index,
            text: btn.textContent?.trim() || '',
            visible: btn.offsetParent !== null,
            classes: btn.className || '',
            shade: btn.getAttribute('shade') || '',
            name: btn.getAttribute('name') || '',
            tagName: btn.tagName
          });
        });
      }
      
      return buttons;
    });

    console.log('🔘 Found buttons:');
    allButtons.forEach((btn, i) => {
      console.log(`   ${i + 1}. [${btn.type}] ${btn.tagName}: "${btn.text}" | Shade: ${btn.shade} | Name: ${btn.name} | Visible: ${btn.visible}`);
    });

    /* 5. Get current time and date info */
    const currentTime = new Date().toLocaleTimeString();
    const currentDate = new Date().toLocaleDateString();

    /* 6. Try different approaches to find and click punch button */
    console.log('🎯 Looking for punch buttons...');
    
    let punchSuccess = false;
    let currentStatus = 'unknown';
    
    // Method 1: Try clicking gt-button with shade="primary" using JavaScript
    try {
      console.log('📍 Method 1: Direct gt-button click...');
      
      const clickResult = await page.evaluate(() => {
        const attendanceWidget = document.querySelector('gt-attendance-info');
        if (!attendanceWidget) return { success: false, error: 'No attendance widget' };
        
        const primaryButton = attendanceWidget.querySelector('gt-button[shade="primary"]');
        if (!primaryButton) return { success: false, error: 'No primary button' };
        
        const buttonText = primaryButton.textContent?.trim() || '';
        
        // Simulate click event
        primaryButton.click();
        
        return { 
          success: true, 
          buttonText: buttonText,
          message: 'Button clicked via JavaScript'
        };
      });
      
      if (clickResult.success) {
        console.log(`✅ Method 1 successful: ${clickResult.message}`);
        console.log(`🔍 Button text was: "${clickResult.buttonText}"`);
        punchSuccess = true;
        
        // Wait for action to complete
        await page.waitForTimeout(5000);
        
        // Check if modal appeared for work location
        const modal = await page.$('gt-popup-modal[label="modal"]');
        if (modal) {
          console.log('📝 Work location modal detected, handling...');
          
          try {
            // Fill work location
            await page.evaluate(() => {
              const textArea = document.querySelector('gt-text-area');
              if (textArea) {
                // Try to find the actual textarea element
                const textarea = textArea.shadowRoot?.querySelector('textarea') || 
                               textArea.querySelector('textarea') ||
                               textArea.querySelector('input');
                               
                if (textarea) {
                  textarea.value = 'Office';
                  textarea.dispatchEvent(new Event('input', { bubbles: true }));
                  textarea.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            });
            
            // Click modal submit button
            await page.evaluate(() => {
              const modalSubmitBtn = document.querySelector('gt-popup-modal gt-button[shade="primary"]');
              if (modalSubmitBtn) {
                modalSubmitBtn.click();
              }
            });
            
            console.log('✅ Work location modal handled');
            await page.waitForTimeout(3000);
            
          } catch (modalError) {
            console.log('⚠️ Modal handling failed:', modalError.message);
          }
        }
        
        // Determine what action was performed
        if (clickResult.buttonText.toLowerCase().includes('sign') || 
            clickResult.buttonText.toLowerCase().includes('punch') ||
            clickResult.buttonText === '') {
          currentStatus = action === 'signin' ? 'signed_in' : 'signed_out';
        }
      } else {
        console.log(`❌ Method 1 failed: ${clickResult.error}`);
      }
    } catch (error) {
      console.log(`❌ Method 1 error: ${error.message}`);
    }
    
    // Method 2: Try finding button by coordinates if Method 1 failed
    if (!punchSuccess) {
      try {
        console.log('📍 Method 2: Button by coordinates...');
        
        const buttonInfo = await page.evaluate(() => {
          const attendanceWidget = document.querySelector('gt-attendance-info');
          if (!attendanceWidget) return null;
          
          const buttons = attendanceWidget.querySelectorAll('gt-button');
          for (let btn of buttons) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                text: btn.textContent?.trim() || '',
                shade: btn.getAttribute('shade') || ''
              };
            }
          }
          return null;
        });
        
        if (buttonInfo) {
          console.log(`🎯 Found button at (${buttonInfo.x}, ${buttonInfo.y}): "${buttonInfo.text}"`);
          await page.mouse.click(buttonInfo.x, buttonInfo.y);
          
          punchSuccess = true;
          console.log('✅ Method 2 successful: Clicked by coordinates');
          
          await page.waitForTimeout(5000);
          currentStatus = action === 'signin' ? 'signed_in' : 'signed_out';
        }
      } catch (error) {
        console.log(`❌ Method 2 error: ${error.message}`);
      }
    }
    
    // Method 3: Try pressing Enter or Space on focused element
    if (!punchSuccess) {
      try {
        console.log('📍 Method 3: Keyboard navigation...');
        
        await page.evaluate(() => {
          const attendanceWidget = document.querySelector('gt-attendance-info');
          if (attendanceWidget) {
            const button = attendanceWidget.querySelector('gt-button[shade="primary"]');
            if (button) {
              button.focus();
              button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
              button.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
              button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
            }
          }
        });
        
        await page.waitForTimeout(3000);
        
        // Check if anything changed
        const pageChanged = await page.evaluate(() => {
          return document.querySelector('gt-popup-modal') !== null;
        });
        
        if (pageChanged) {
          punchSuccess = true;
          console.log('✅ Method 3 successful: Keyboard activation');
          currentStatus = action === 'signin' ? 'signed_in' : 'signed_out';
        }
      } catch (error) {
        console.log(`❌ Method 3 error: ${error.message}`);
      }
    }

    // Return results based on what happened
    if (punchSuccess) {
      if (action === 'signin') {
        return `✅ Sign in successful!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\n🎯 Action completed using GreytHR automation.`;
      } else if (action === 'signout') {
        return `✅ Sign out successful!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\n🎯 Action completed using GreytHR automation.`;
      }
    }
    
    // Status check or if actions failed
    const hasViewSwipes = allButtons.some(btn => 
      btn.name && btn.name.toLowerCase().includes('view swipes')
    );
    
    const hasPrimaryButton = allButtons.some(btn => 
      btn.shade === 'primary' && btn.type.includes('attendance')
    );
    
    if (action === 'status') {
      const statusEmoji = hasViewSwipes ? '🟢' : '🔴';
      const statusText = hasViewSwipes ? 'Signed In' : 'Signed Out';
      
      return `${statusEmoji} **Status: ${statusText}**\n\n📅 Date: ${currentDate}\n🕐 Checked at: ${currentTime}\n\n🔘 Buttons found: ${allButtons.length}\n📊 Primary button: ${hasPrimaryButton ? 'Yes' : 'No'}\n👀 View Swipes: ${hasViewSwipes ? 'Yes' : 'No'}`;
    }
    
    // If we get here, the action failed
    return `❌ Could not complete ${action}.\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\n🔍 Found ${allButtons.length} buttons, but could not click the punch button.\n\n💡 Try /status to check current state or try again in a few minutes.`;

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Take screenshot for debugging
    try {
      await page.screenshot({ path: 'error-debug.png', fullPage: true });
      console.log('📸 Debug screenshot saved as error-debug.png');
    } catch (e) {
      // Screenshot failed
    }
    
    throw new Error(`GreytHR portal error: ${error.message}`);
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

// Wrapper functions
async function punchIn() {
  return await performHRAction('signin');
}

async function punchOut() {
  return await performHRAction('signout');
}

async function checkStatus() {
  return await performHRAction('status');
}

/* ---------- Telegram bot setup (same as before) ---------- */
if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Welcome message
bot.start(ctx => {
  const welcomeMessage = `🤖 **GreytHR Attendance Bot**

Available commands:
• /clockin - Sign in to GreytHR portal
• /clockout - Sign out from GreytHR portal
• /status - Check current attendance status
• /help - Show help message

🎯 Enhanced GreytHR automation with multiple click methods!`;

  ctx.reply(welcomeMessage);
});

// Help command
bot.command('help', ctx => {
  const helpMessage = `🆘 **GreytHR Bot Help**

**Commands:**
• \`/clockin\` - Automatically sign in
• \`/clockout\` - Automatically sign out  
• \`/status\` - Check current status

**Enhanced Features:**
✅ Multiple button detection methods
✅ JavaScript click fallback
✅ Coordinate-based clicking
✅ Keyboard navigation backup
✅ Work location auto-fill

**Troubleshooting:**
1. Use /status first to check current state
2. Wait 30 seconds between commands
3. Check error-debug.png if issues occur

Powered by advanced GreytHR automation! 🚀`;

  ctx.reply(helpMessage);
});

// Clock in command
bot.command('clockin', async ctx => {
  console.log(`📞 Clock in requested by ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  
  const waitMsg = await ctx.reply('⏳ Signing in to GreytHR... (this may take 30-60 seconds)');
  
  try {
    const result = await punchIn();
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      result
    );
    console.log('✅ Clock in completed');
  } catch (err) {
    console.error('❌ Clock in error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ Sign in failed: ${err.message}\n\nPlease check error-debug.png and try /status first.`
    );
  }
});

// Clock out command
bot.command('clockout', async ctx => {
  console.log(`📞 Clock out requested by ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  
  const waitMsg = await ctx.reply('⏳ Signing out from GreytHR... (this may take 30-60 seconds)');
  
  try {
    const result = await punchOut();
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      result
    );
    console.log('✅ Clock out completed');
  } catch (err) {
    console.error('❌ Clock out error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ Sign out failed: ${err.message}\n\nPlease try /status first or try again.`
    );
  }
});

// Status command
bot.command('status', async ctx => {
  console.log(`📞 Status check requested by ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  
  const waitMsg = await ctx.reply('⏳ Checking GreytHR status...');
  
  try {
    const result = await checkStatus();
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      result
    );
    console.log('✅ Status check completed');
  } catch (err) {
    console.error('❌ Status error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ Status check failed: ${err.message}`
    );
  }
});

// Handle text messages
bot.on('text', ctx => {
  const text = ctx.message.text.toLowerCase();
  
  if (text.includes('sign in') || text.includes('clock in') || text.includes('punch in')) {
    ctx.reply('👋 Use /clockin to sign in to GreytHR!');
  } else if (text.includes('sign out') || text.includes('clock out') || text.includes('punch out')) {
    ctx.reply('👋 Use /clockout to sign out from GreytHR!');
  } else if (text.includes('status') || text.includes('check')) {
    ctx.reply('👋 Use /status to check your GreytHR attendance status!');
  } else {
    ctx.reply('🤖 GreytHR Bot Commands:\n• /clockin\n• /clockout\n• /status\n• /help');
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
  ctx.reply('❌ Something went wrong with GreytHR automation. Please try /status first.');
});

/* ---------- Start bot ---------- */
bot.launch();

console.log('🤖 Enhanced GreytHR Bot is running!');
console.log('✅ Commands: /clockin, /clockout, /status, /help');
console.log('🔧 Debug mode: Browser visible, screenshots enabled');

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 GreytHR Bot stopping...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 GreytHR Bot stopping...');
  bot.stop('SIGTERM');
});
