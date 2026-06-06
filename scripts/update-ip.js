const fs = require('fs');
const path = require('path');
const os = require('os');

function getLocalIp() {
  const networkInterfaces = os.networkInterfaces();
  const candidates = [];

  for (const interfaceName of Object.keys(networkInterfaces)) {
    const interfaces = networkInterfaces[interfaceName];
    for (const net of interfaces) {
      // Look for non-internal IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        const isWireless = /wi-fi|wlan|wireless/i.test(interfaceName);
        candidates.push({
          address: net.address,
          isWireless,
          name: interfaceName
        });
      }
    }
  }

  // Sort: wireless interfaces first, as these are typically what Expo/phone will connect to
  candidates.sort((a, b) => (b.isWireless ? 1 : 0) - (a.isWireless ? 1 : 0));

  if (candidates.length > 0) {
    return candidates[0];
  }
  return { address: 'localhost', name: 'loopback' };
}

const activeInterface = getLocalIp();
const localIp = activeInterface.address;

console.log(`[IP Auto-Config] Detected active local IP: ${localIp} (via interface: "${activeInterface.name}")`);

const envPath = path.join(__dirname, '..', '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

const key = 'EXPO_PUBLIC_API_IP';
const newline = `${key}=${localIp}`;

if (envContent.includes(key)) {
  // Regex to replace the specific line
  const regex = new RegExp(`^${key}=.*`, 'm');
  envContent = envContent.replace(regex, newline);
} else {
  // Append to the end of file
  if (envContent && !envContent.endsWith('\n')) {
    envContent += '\n';
  }
  envContent += newline + '\n';
}

fs.writeFileSync(envPath, envContent, 'utf8');
console.log(`[IP Auto-Config] Successfully updated ${envPath} with ${newline}`);
