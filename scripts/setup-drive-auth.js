/**
 * setup-drive-auth.js
 * ─────────────────────────────────────────────────────────────────
 * ONE-TIME script to authorize HumTum to access YOUR Google Drive.
 *
 * Run once:  node scripts/setup-drive-auth.js
 *
 * It will open a browser → you approve → the refresh token is
 * automatically saved to your .env file. Done!
 * ─────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { google } = require('googleapis');
const http       = require('http');
const url        = require('url');
const fs         = require('fs');
const path       = require('path');

const ENV_PATH   = path.join(__dirname, '../.env');
const PORT       = 3001;
const REDIRECT   = `http://localhost:${PORT}/oauth/callback`;

const CLIENT_ID     = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
❌  Missing OAuth credentials in .env

Please add these two lines to your .env file first:
  GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE
  GOOGLE_OAUTH_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE

How to get them:
  1. Go to https://console.cloud.google.com/apis/credentials (HumTum Backup project)
  2. Click "+ CREATE CREDENTIALS" → "OAuth client ID"
  3. If prompted, configure the consent screen first (External, add your email as test user)
  4. Application type: "Desktop app"  → Name: "HumTum Backup"  → CREATE
  5. Copy Client ID and Client Secret into .env
  6. Re-run: node scripts/setup-drive-auth.js
`);
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);

const authUrl = oauth2Client.generateAuthUrl({
  access_type : 'offline',
  prompt      : 'consent',     // forces refresh_token to be returned every time
  scope       : ['https://www.googleapis.com/auth/drive.file'],
});

console.log('\n🔐 HumTum Google Drive Authorization\n');
console.log('Opening your browser to authorize access to Google Drive...');
console.log('\nIf the browser does not open, visit this URL manually:\n');
console.log(authUrl);
console.log('\n⏳ Waiting for authorization...\n');

// Try to open browser automatically
const { exec } = require('child_process');
exec(`open "${authUrl}"`);

// Spin up a temporary local server to catch the OAuth callback
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname !== '/oauth/callback') {
    res.end('Not found');
    return;
  }

  const code  = parsed.query.code;
  const error = parsed.query.error;

  if (error) {
    res.writeHead(400);
    res.end(`<h2>❌ Authorization failed: ${error}</h2><p>Close this tab and try again.</p>`);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.writeHead(400);
      res.end('<h2>❌ No refresh token received. Try revoking access and re-running.</h2>');
      server.close();
      process.exit(1);
    }

    // Save refresh token to .env
    let envContent = fs.readFileSync(ENV_PATH, 'utf8');

    if (envContent.includes('GOOGLE_OAUTH_REFRESH_TOKEN=')) {
      // Replace existing
      envContent = envContent.replace(
        /GOOGLE_OAUTH_REFRESH_TOKEN=.*/,
        `GOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}`
      );
    } else {
      // Append
      envContent += `\nGOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}\n`;
    }

    fs.writeFileSync(ENV_PATH, envContent, 'utf8');

    console.log('✅ Authorization successful!');
    console.log('✅ Refresh token saved to .env');
    console.log('\n🚀 You can now run: npm run backup\n');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body style="font-family:sans-serif;max-width:500px;margin:60px auto;text-align:center">
        <h1>✅ Authorized!</h1>
        <p>HumTum now has access to your Google Drive.</p>
        <p><strong>Refresh token saved to .env</strong></p>
        <p>You can close this tab.</p>
        <p style="margin-top:30px;color:#888">Run <code>npm run backup</code> to test.</p>
      </body></html>
    `);

    server.close();
    process.exit(0);

  } catch (err) {
    console.error('❌ Token exchange failed:', err.message);
    res.writeHead(500);
    res.end(`<h2>❌ Error: ${err.message}</h2>`);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  // Server is ready, waiting for callback
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Stop the process using it and try again.`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});
