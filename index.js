/* index.js – Telegram "/clockin" bot in Node.js  */
require('dotenv').config();          // 1) load secrets

const { Telegraf } = require('telegraf');
const { chromium } = require('playwright');

const BOT_TOKEN = process.env.BOT_TOKEN;
const HR_USER   = process.env.HR_USER;
const HR_PASS   = process.env.HR_PASS;
const HR_URL    = process.env.HR_URL;

/* ---------- selectors for your HR site ---------- */
// Tweak only if your page uses different IDs/classes
const USERNAME_BOX = '#username';
const PASSWORD_BOX = '#password';
const LOGIN_BTN    = 'button[type=submit]';
const PUNCH_IN_BTN  = 'text=Sign In';   // button shown when NOT yet signed in
const PUNCH_OUT_BTN = 'text=Sign Out';  // button shown when already signed in
/* ------------------------------------------------ */

async function performHRAction(action = 'signin') {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);        // a little more generous

  try {
    console.log(`🚀 Starting ${action} process...`);
    console.log('🌐 Opening URL...');
    
    /* 1. Open login page */
    await page.goto(HR_URL);
    console.log('✅ URL opened');

    /* 2. Fill credentials and log in */
    await page.fill(USERNAME_BOX, HR_USER);
    console.log('✅ Username filled');
    
    await page.fill(PASSWORD_BOX, HR_PASS);
    console.log('✅ Password filled');
    
    await page.click(LOGIN_BTN);
    console.log('✅ Login button clicked');

    /* 3. Wait until the dashboard is quiet */
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    /* 4. Check current status */
    const isSignedIn = await page.$(PUNCH_OUT_BTN);
    const isSignedOut = await page.$(PUNCH_IN_BTN);

    console.log(`🔍 Signed In status: ${!!isSignedIn}`);
    console.log(`🔍 Signed Out status: ${!!isSignedOut}`);

    const currentTime = new Date().toLocaleTimeString();
    const currentDate = new Date().toLocaleDateString();

    if (action === 'signin') {
      /* ===== SIGN IN LOGIC ===== */
      if (isSignedIn) {
        console.log('ℹ️ User is already signed in');
        return `🟢 You are already signed in!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\n💡 Use /clockout to sign out.`;
      }

      if (!isSignedOut) {
        throw new Error('Could not find Sign In button. Page might have changed.');
      }

      console.log('👆 Clicking Sign In button...');
      await page.click(PUNCH_IN_BTN);

      /* Wait for confirmation (Sign Out button appears) */
      console.log('⏳ Waiting for sign in confirmation...');
      await page.waitForSelector(PUNCH_OUT_BTN, { timeout: 15_000 });

      console.log('✅ Sign in successful');
      return `✅ Successfully signed in!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}`;

    } else if (action === 'signout') {
      /* ===== SIGN OUT LOGIC ===== */
      if (isSignedOut) {
        console.log('ℹ️ User is already signed out');
        return `🔴 You are already signed out!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\n💡 Use /clockin to sign in.`;
      }

      if (!isSignedIn) {
        throw new Error('Could not find Sign Out button. You might not be signed in.');
      }

      console.log('👆 Clicking Sign Out button...');
      await page.click(PUNCH_OUT_BTN);

      /* Wait for confirmation (Sign In button appears) */
      console.log('⏳ Waiting for sign out confirmation...');
      await page.waitForSelector(PUNCH_IN_BTN, { timeout: 15_000 });

      console.log('✅ Sign out successful');
      return `✅ Successfully signed out!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}`;

    } else if (action === 'status') {
      /* ===== STATUS CHECK ===== */
      if (isSignedIn) {
        return `🟢 **Status: Signed In**\n\n📅 Date: ${currentDate}\n🕐 Checked at: ${currentTime}\n\n💡 Use /clockout to sign out.`;
      } else if (isSignedOut) {
        return `🔴 **Status: Signed Out**\n\n📅 Date: ${currentDate}\n🕐 Checked at: ${currentTime}\n\n💡 Use /clockin to sign in.`;
      } else {
        return `❓ **Status: Unknown**\n\nCould not determine sign in status.\n\n📅 Date: ${currentDate}\n🕐 Checked at: ${currentTime}`;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

// Wrapper functions for clarity
async function punchIn() {
  return await performHRAction('signin');
}

async function punchOut() {
  return await performHRAction('signout');
}

async function checkStatus() {
  return await performHRAction('status');
}

/* ---------- Telegram bot wiring ---------- */
if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Welcome message
bot.start(ctx => {
  const welcomeMessage = `🤖 **HR Attendance Bot**

Available commands:
• /clockin - Sign in to HR portal
• /clockout - Sign out from HR portal
• /status - Check current sign in status
• /help - Show this help message

Just send a command and I'll handle the rest! ⏰`;

  ctx.reply(welcomeMessage);
});

// Help command
bot.command('help', ctx => {
  const helpMessage = `🆘 **Help & Commands**

**Main Commands:**
• \`/clockin\` - Automatically sign in
• \`/clockout\` - Automatically sign out  
• \`/status\` - Check current status

**Features:**
✅ Detects if already signed in/out
✅ Shows date and time
✅ Prevents duplicate actions
✅ Clear status messages

**Troubleshooting:**
If commands fail, check:
1. HR portal is accessible
2. Credentials are correct in .env file
3. Internet connection is stable
4. Try again in a few seconds

**Need more help?** Contact your admin! 🛠️`;

  ctx.reply(helpMessage);
});

// Clock in command
bot.command('clockin', async ctx => {
  console.log(`📞 Clock in requested by ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  
  const waitMsg = await ctx.reply('⏳ Processing sign in...');
  
  try {
    const result = await punchIn();
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      result
    );
    console.log('✅ Clock in completed successfully');
  } catch (err) {
    console.error('❌ Clock in error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ Sign in failed: ${err.message}\n\nPlease try again or contact admin if issue persists.`
    );
  }
});

// Clock out command
bot.command('clockout', async ctx => {
  console.log(`📞 Clock out requested by ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  
  const waitMsg = await ctx.reply('⏳ Processing sign out...');
  
  try {
    const result = await punchOut();
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      result
    );
    console.log('✅ Clock out completed successfully');
  } catch (err) {
    console.error('❌ Clock out error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ Sign out failed: ${err.message}\n\nPlease try again or contact admin if issue persists.`
    );
  }
});

// Status check command
bot.command('status', async ctx => {
  console.log(`📞 Status check requested by ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  
  const waitMsg = await ctx.reply('⏳ Checking status...');
  
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
    console.error('❌ Status check error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      null,
      `❌ Status check failed: ${err.message}\n\nPlease try again.`
    );
  }
});

// Handle any other text messages
bot.on('text', ctx => {
  const text = ctx.message.text.toLowerCase();
  
  if (text.includes('sign in') || text.includes('clock in') || text.includes('punch in')) {
    ctx.reply('👋 Use /clockin to sign in automatically!');
  } else if (text.includes('sign out') || text.includes('clock out') || text.includes('punch out')) {
    ctx.reply('👋 Use /clockout to sign out automatically!');
  } else if (text.includes('status') || text.includes('check')) {
    ctx.reply('👋 Use /status to check your current status!');
  } else if (text.includes('help')) {
    ctx.reply('👋 Use /help to see all available commands!');
  } else {
    ctx.reply('🤖 I understand these commands:\n• /clockin\n• /clockout\n• /status\n• /help');
  }
});

// Handle errors
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
  ctx.reply('❌ Something went wrong. Please try again later.');
});

/* ---------- start the long-polling loop ---------- */
bot.launch();

console.log('🤖 Bot is running. Press Ctrl+C to stop.');
console.log('✅ Available commands: /clockin, /clockout, /status, /help');

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Bot stopping...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 Bot stopping...');
  bot.stop('SIGTERM');
});
