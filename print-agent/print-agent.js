const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile } = require('child_process');
const https = require('https');
const http = require('http');

// Initialize paths
const execDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const logFile = path.join(execDir, 'print-agent.log');

// Setup logging
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(line.trim());
  try {
    fs.appendFileSync(logFile, line);
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

log('Starting print agent initialization...');

// Load config
let config = {
  port: 5001,
  authToken: '',
  allowedOrigin: '*'
};

let configPath = path.join(execDir, 'config.json');
if (!fs.existsSync(configPath)) {
  configPath = path.join(__dirname, 'config.json');
}

if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
    log(`Config loaded successfully from: ${configPath}`);
  } catch (err) {
    log(`Error reading config.json: ${err.message}. Using defaults.`);
  }
} else {
  log(`config.json not found. Using default configurations.`);
}

// Find MS Edge path on Windows
function getEdgePath() {
  const paths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// Find or download SumatraPDF.exe
const sumatraPath = path.join(execDir, 'SumatraPDF.exe');
const SUMATRA_URL = 'https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.exe';

function ensureSumatraPDF() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(sumatraPath)) {
      log(`SumatraPDF found at: ${sumatraPath}`);
      return resolve();
    }

    log(`SumatraPDF.exe not found. Attempting auto-download from: ${SUMATRA_URL}`);

    function download(url) {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (response) => {
        // Handle HTTP redirect (e.g. status code 301, 302, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, url).toString();
          log(`Redirected to: ${redirectUrl}`);
          return download(redirectUrl);
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed with status code ${response.statusCode}`));
        }

        const file = fs.createWriteStream(sumatraPath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          log('SumatraPDF downloaded successfully.');
          resolve();
        });
        file.on('error', (err) => {
          file.close();
          try { fs.unlinkSync(sumatraPath); } catch (e) { }
          reject(err);
        });
      }).on('error', (err) => {
        log(`SumatraPDF download error: ${err.message}`);
        reject(err);
      });
    }

    download(SUMATRA_URL);
  });
}

// Express server setup
const app = express();
app.use(express.json({ limit: '10mb' }));

// Custom secure CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (config.allowedOrigin === '*' || origin === config.allowedOrigin || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Authentication middleware
const authMiddleware = (req, res, next) => {
  // If no auth token is set in config, bypass security (for initial setup)
  if (!config.authToken || config.authToken === 'paste_your_print_agent_token_here') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const tokenQuery = req.query.token;
  const incomingToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : tokenQuery;

  if (!incomingToken || incomingToken !== config.authToken) {
    log(`Unauthorized access attempt from IP: ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid print agent token' });
  }
  next();
};

// Endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    edgeFound: !!getEdgePath(),
    sumatraFound: fs.existsSync(sumatraPath),
    allowedOrigin: config.allowedOrigin
  });
});

app.get('/printers', authMiddleware, (req, res) => {
  log('Fetching Windows printer list...');

  // Try Get-Printer (modern cmdlet, works best for user-profile Bluetooth printers)
  exec('powershell -Command "Get-Printer | Select-Object Name | ConvertTo-Json"', (err, stdout, stderr) => {
    if (!err && stdout.trim()) {
      try {
        const parsed = JSON.parse(stdout);
        let printers = [];
        if (Array.isArray(parsed)) {
          printers = parsed.map(p => p.Name).filter(Boolean);
        } else if (parsed && parsed.Name) {
          printers = [parsed.Name];
        }
        if (printers.length > 0) {
          log(`Successfully found ${printers.length} printer(s) via Get-Printer`);
          return res.json({ printers });
        }
      } catch (parseErr) { }
    }

    log('Get-Printer failed or empty. Trying Get-CimInstance...');
    // Fallback 1: Get-CimInstance
    exec('powershell -Command "Get-CimInstance Win32_Printer | Select-Object Name | ConvertTo-Json"', (cimErr, cimStdout, cimStderr) => {
      if (!cimErr && cimStdout.trim()) {
        try {
          const parsed = JSON.parse(cimStdout);
          let printers = [];
          if (Array.isArray(parsed)) {
            printers = parsed.map(p => p.Name).filter(Boolean);
          } else if (parsed && parsed.Name) {
            printers = [parsed.Name];
          }
          if (printers.length > 0) {
            log(`Successfully found ${printers.length} printer(s) via Get-CimInstance`);
            return res.json({ printers });
          }
        } catch (parseErr) { }
      }

      log('CimInstance failed or empty. Trying Get-WmiObject...');
      // Fallback 2: Get-WmiObject
      exec('powershell -Command "Get-WmiObject Win32_Printer | Select-Object Name | ConvertTo-Json"', (wmiErr, wmiStdout, wmiStderr) => {
        if (!wmiErr && wmiStdout.trim()) {
          try {
            const parsed = JSON.parse(wmiStdout);
            let printers = [];
            if (Array.isArray(parsed)) {
              printers = parsed.map(p => p.Name).filter(Boolean);
            } else if (parsed && parsed.Name) {
              printers = [parsed.Name];
            }
            if (printers.length > 0) {
              log(`Successfully found ${printers.length} printer(s) via Get-WmiObject`);
              return res.json({ printers });
            }
          } catch (parseErr) { }
        }

        log('Get-WmiObject failed or empty. Trying wmic...');
        // Fallback 3: wmic
        exec('wmic printer get name', (wmicErr, wmicStdout, wmicStderr) => {
          if (!wmicErr && wmicStdout.trim()) {
            const lines = wmicStdout.split('\r\n')
              .map(l => l.trim())
              .filter(l => l && l.toLowerCase() !== 'name');
            if (lines.length > 0) {
              log(`Successfully found ${lines.length} printer(s) via wmic`);
              return res.json({ printers: lines });
            }
          }

          log('All printer detection commands failed or returned 0 printers.');
          return res.json({ printers: [] });
        });
      });
    });
  });
});


// Print Queue implementation
const printQueue = [];
let queueRunning = false;

function enqueuePrintJob(job) {
  printQueue.push(job);
  processQueue();
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;

  while (printQueue.length > 0) {
    const job = printQueue[0];
    let success = false;
    let attempts = 0;

    log(`Starting print job: ${job.id} for printer: ${job.printerName}`);

    while (attempts < 3 && !success) {
      attempts++;
      try {
        await executePrintJob(job);
        success = true;
        log(`Print job ${job.id} successfully printed.`);
      } catch (err) {
        log(`Print job ${job.id} failed on attempt ${attempts}/3: ${err.message}`);
        if (attempts < 3) {
          log('Waiting 3 seconds before retrying...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    if (!success) {
      log(`Print job ${job.id} permanently failed after 3 attempts.`);
    }
    printQueue.shift(); // Remove from queue
  }

  queueRunning = false;
}

// Low level print execution
function executePrintJob(job) {
  return new Promise((resolve, reject) => {
    const edgePath = getEdgePath();
    if (!edgePath) {
      return reject(new Error('Microsoft Edge or Chrome browser not found on this system'));
    }

    if (!fs.existsSync(sumatraPath)) {
      return reject(new Error('SumatraPDF.exe utility not found. Auto-download may have failed or was blocked.'));
    }

    const tempHtmlFile = path.join(os.tmpdir(), `kot_bill_${job.id}.html`);
    const tempPdfFile = path.join(os.tmpdir(), `kot_bill_${job.id}.pdf`);

    log(`Writing temp HTML file: ${tempHtmlFile}`);
    fs.writeFileSync(tempHtmlFile, job.html, 'utf8');

    // Step 1: Render HTML to PDF using MS Edge (headless)
    log(`Converting HTML to PDF via Edge...`);
    execFile(edgePath, [
      '--headless',
      '--disable-gpu',
      `--print-to-pdf=${tempPdfFile}`,
      '--no-pdf-header-footer',
      tempHtmlFile
    ], (edgeErr) => {
      if (edgeErr) {
        cleanupFiles(tempHtmlFile, tempPdfFile);
        return reject(new Error(`Failed to convert HTML to PDF: ${edgeErr.message}`));
      }

      // Wait up to 1.5 seconds for the PDF file to be completely written to disk
      let checks = 0;
      const checkInterval = setInterval(() => {
        checks++;

        let fileExists = false;
        try {
          if (fs.existsSync(tempPdfFile)) {
            const stats = fs.statSync(tempPdfFile);
            if (stats.size > 0) {
              fileExists = true;
            }
          }
        } catch (e) { }

        if (fileExists) {
          clearInterval(checkInterval);
          log(`PDF generated. Sending to printer: "${job.printerName}" via SumatraPDF...`);

          // Step 2: Send PDF to printer using SumatraPDF
          const sumatraArgs = [
            '-print-to', job.printerName,
            '-print-settings', 'portrait,noscale,noprompt',
            tempPdfFile
          ];

          execFile(sumatraPath, sumatraArgs, (sumatraErr) => {
            cleanupFiles(tempHtmlFile, tempPdfFile);
            if (sumatraErr) {
              return reject(new Error(`SumatraPDF failed to print: ${sumatraErr.message}`));
            }
            resolve();
          });
        } else if (checks >= 15) { // 1.5 seconds timeout
          clearInterval(checkInterval);
          cleanupFiles(tempHtmlFile, tempPdfFile);
          return reject(new Error('PDF conversion succeeded but target file was not generated or was empty'));
        }
      }, 100);
    });
  });
}

function cleanupFiles(html, pdf) {
  try {
    if (fs.existsSync(html)) fs.unlinkSync(html);
    if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
    log('Cleaned up temporary HTML and PDF files');
  } catch (e) {
    log(`Warning during files cleanup: ${e.message}`);
  }
}

app.post('/print', authMiddleware, (req, res) => {
  const { html, printerName } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Missing HTML content' });
  }
  if (!printerName) {
    return res.status(400).json({ error: 'Missing printerName' });
  }

  const jobId = Math.random().toString(36).substring(2, 10);
  log(`Enqueuing print job ${jobId} targeting: ${printerName}`);

  enqueuePrintJob({
    id: jobId,
    html,
    printerName
  });

  res.json({ success: true, jobId, message: 'Print job enqueued successfully' });
});

app.post('/test-print', authMiddleware, (req, res) => {
  const { printerName } = req.body;
  if (!printerName) {
    return res.status(400).json({ error: 'Missing printerName' });
  }

  const testHtml = `
    <html>
      <head>
        <style>
          @page { size: 80mm auto; margin: 5mm; }
          body { font-family: monospace; font-size: 14px; text-align: center; }
          .bold { font-weight: bold; font-size: 16px; }
          .divider { border-top: 1px dashed black; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="bold">HUMTUM Billing System</div>
        <div>Print Agent Test</div>
        <div class="divider"></div>
        <div>Printer: ${printerName}</div>
        <div>Status: Working Successfully</div>
        <div>Time: ${new Date().toLocaleString()}</div>
        <div class="divider"></div>
        <div>Thank you!</div>
      </body>
    </html>
  `;

  const jobId = 'test_' + Math.random().toString(36).substring(2, 6);
  log(`Enqueuing test print job ${jobId} for: ${printerName}`);

  enqueuePrintJob({
    id: jobId,
    html: testHtml,
    printerName
  });

  res.json({ success: true, jobId, message: 'Test print enqueued successfully' });
});

// Start the print agent after verifying SumatraPDF is ready
ensureSumatraPDF()
  .then(() => {
    const port = config.port || 5001;
    app.listen(port, () => {
      log(`====================================================`);
      log(`HumTum Print Agent running on http://localhost:${port}`);
      log(`Authentication Token: ${config.authToken || 'NONE (Bypassed)'}`);
      log(`Allowed Origin: ${config.allowedOrigin}`);
      log(`====================================================`);
    });
  })
  .catch((err) => {
    log(`FATAL: Failed to initialize Print Agent: ${err.message}`);
    log('Please place SumatraPDF.exe manually in this directory and restart the agent.');

    // Still start Express on fallback so frontend can read health check state
    const port = config.port || 5001;
    app.listen(port, () => {
      log(`Print Agent started in ERROR STATE on http://localhost:${port}`);
    });
  });
