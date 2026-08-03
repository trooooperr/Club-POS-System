// WhatsApp integration temporarily disabled to minimize server load and network bandwidth.
// All endpoints/handlers safely return DISCONNECTED without performing external network requests.

let connectionStatus = 'DISCONNECTED';
let qrCodeDataURL = null;
let connectedUser = null;

async function init(io) {
  // Disabled
}

async function connectToWhatsApp() {
  console.log('[WhatsApp] Service disabled to save server resources.');
}

async function disconnectFromWhatsApp() {
  connectionStatus = 'DISCONNECTED';
  qrCodeDataURL = null;
  connectedUser = null;
}

function getStatus() {
  return {
    status: 'DISCONNECTED',
    qr: null,
    user: null
  };
}

async function sendWhatsAppMessage() {
  return null;
}

async function sendThankYouMessage() {
  return null;
}

function setSocketIo() {
  // No-op
}

module.exports = {
  init,
  connect: connectToWhatsApp,
  disconnect: disconnectFromWhatsApp,
  getStatus,
  sendWhatsAppMessage,
  sendThankYouMessage,
  setSocketIo
};
