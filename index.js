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
    headless: true,  // Set to true after testing
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ]
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

    /* 4. Wait specifically for attendance widget */
    console.log('🔍 Waiting for attendance widget...');
    await page.waitForSelector('gt-attendance-info', { timeout: 30000 });

    /* 5. Get current time and date info */
    const currentTime = new Date().toLocaleTimeString();
    const currentDate = new Date().toLocaleDateString();

    /* 6. Enhanced button detection for GreytHR */
    console.log('🎯 Detecting attendance status...');
    
    const attendanceStatus = await page.evaluate(() => {
      const attendanceWidget = document.querySelector('gt-attendance-info');
      if (!attendanceWidget) {
        return { error: 'No attendance widget found' };
      }

      // Look for all buttons in the attendance widget
      const allButtons = attendanceWidget.querySelectorAll('gt-button');
      const buttonDetails = Array.from(allButtons).map(btn => ({
        text: btn.textContent?.trim() || '',
        name: btn.getAttribute('name') || '',
        shade: btn.getAttribute('shade') || '',
        visible: btn.offsetParent !== null,
        className: btn.className || ''
      }));

      // Check for View Swipes button (indicates signed in)
      const viewSwipesButton = Array.from(allButtons).find(btn => 
        btn.getAttribute('name') === 'View Swipes' || 
        btn.textContent?.includes('View Swipes')
      );

      // Check for primary button
      const primaryButton = Array.from(allButtons).find(btn => 
        btn.getAttribute('shade') === 'primary'
      );

      // Look for modal that might indicate sign-in state
      const modal = document.querySelector('gt-popup-modal[label="modal"]');
      const modalText = modal ? modal.textContent : '';

      return {
        buttons: buttonDetails,
        hasViewSwipes: !!viewSwipesButton,
        hasPrimaryButton: !!primaryButton,
        primaryButtonText: primaryButton ? primaryButton.textContent?.trim() : '',
        modalPresent: !!modal,
        modalText: modalText,
        isSignedIn: !!viewSwipesButton,
        needsSignIn: modalText.includes('You are not signed in yet')
      };
    });

    console.log('📊 Attendance Status:', attendanceStatus);

    if (attendanceStatus.error) {
      return `❌ ${attendanceStatus.error}\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}`;
    }

    /* 7. Handle different actions based on current status */
    if (action === 'status') {
      const statusEmoji = attendanceStatus.isSignedIn ? '🟢' : '🔴';
      const statusText = attendanceStatus.isSignedIn ? 'Signed In' : 'Signed Out';
      
      let buttonInfo = '';
      if (attendanceStatus.buttons.length > 0) {
        buttonInfo = `\n\n🔘 Buttons found: ${attendanceStatus.buttons.length}`;
        attendanceStatus.buttons.forEach((btn, i) => {
          buttonInfo += `\n   ${i+1}. ${btn.shade} - "${btn.text}" ${btn.name ? `(${btn.name})` : ''}`;
        });
      }

      return `${statusEmoji} **Status: ${statusText}**\n\n📅 Date: ${currentDate}\n🕐 Checked at: ${currentTime}${buttonInfo}`;
    }

    if (action === 'signin') {
      if (attendanceStatus.isSignedIn) {
        return `🟢 You are already signed in!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\n💡 Use /clockout to sign out.`;
      }

      // Try to click primary button or handle modal
      let clickResult = false;

      if (attendanceStatus.needsSignIn) {
        console.log('📝 Handling sign-in modal...');
        
        clickResult = await page.evaluate(() => {
          // Fill work location in modal
          const textArea = document.querySelector('gt-text-area');
          if (textArea) {
            // Try to set the value
            const textarea = textArea.shadowRoot?.querySelector('textarea') || 
                           textArea.querySelector('textarea');
            if (textarea) {
              textarea.value = 'Office';
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          // Click submit button in modal
          const submitButton = document.querySelector('gt-popup-modal gt-button[shade="primary"]');
          if (submitButton) {
            submitButton.click();
            return true;
          }
          return false;
        });

        if (clickResult) {
          await page.waitForTimeout(5000);
          return `✅ Sign in completed!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}`;
        }
      } else if (attendanceStatus.hasPrimaryButton) {
        console.log('👆 Clicking primary button...');
        
        clickResult = await page.evaluate(() => {
          const attendanceWidget = document.querySelector('gt-attendance-info');
          const primaryButton = attendanceWidget?.querySelector('gt-button[shade="primary"]');
          if (primaryButton) {
            primaryButton.click();
            return true;
          }
          return false;
        });

        if (clickResult) {
          await page.waitForTimeout(5000);
          return `✅ Sign in action completed!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}`;
        }
      }

      return `❌ Could not complete sign in action.\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\nButtons found: ${attendanceStatus.buttons.length}`;
    }

    if (action === 'signout') {
      if (!attendanceStatus.isSignedIn) {
        return `🔴 You are already signed out!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}\n\n💡 Use /clockin to sign in.`;
      }

      // Try to click primary button for sign out
      const clickResult = await page.evaluate(() => {
        const attendanceWidget = document.querySelector('gt-attendance-info');
        const primaryButton = attendanceWidget?.querySelector('gt-button[shade="primary"]');
        if (primaryButton) {
          primaryButton.click();
          return true;
        }
        return false;
      });

      if (clickResult) {
        await page.waitForTimeout(5000);
        return `✅ Sign out completed!\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}`;
      }

      return `❌ Could not complete sign out action.\n\n📅 Date: ${currentDate}\n🕐 Time: ${currentTime}`;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}
