// arduino-server.js - Bridge between Chrome Extension and Arduino
const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app = express();
const PORT = 3000;

// Enable CORS for Chrome extension
app.use(cors());
app.use(express.json());

// Arduino connection
let arduinoPort = null;
let parser = null;
let isConnected = false;

// ⚠️ CHANGE THIS TO YOUR ARDUINO PORT!
// Find your port in Arduino IDE: Tools → Port
// Windows: COM3, COM4, COM5, etc.
// Mac: /dev/cu.usbmodem14201 or /dev/cu.usbserial-XXXX
// Linux: /dev/ttyUSB0 or /dev/ttyACM0
const ARDUINO_PORT = '/dev/cu.usbmodem2101'; // <--- CHANGE THIS TO YOUR PORT!
const BAUD_RATE = 115200;

// Connect to Arduino
function connectArduino() {
  try {
    console.log(`🔌 Attempting to connect to ${ARDUINO_PORT}...`);
    
    arduinoPort = new SerialPort({
      path: ARDUINO_PORT,
      baudRate: BAUD_RATE,
    });

    parser = arduinoPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    arduinoPort.on('open', () => {
      console.log('✅ Arduino connected on', ARDUINO_PORT);
      console.log('📡 Ready to receive resistance data from Chrome extension');
      isConnected = true;
    });

    arduinoPort.on('error', (err) => {
      console.error('❌ Arduino connection error:', err.message);
      console.log('💡 Tip: Check if the port is correct and Arduino is plugged in');
      isConnected = false;
    });

    arduinoPort.on('close', () => {
      console.log('⚠️ Arduino disconnected');
      isConnected = false;
      
      // Try to reconnect after 5 seconds
      console.log('🔄 Will attempt to reconnect in 5 seconds...');
      setTimeout(connectArduino, 5000);
    });

    // Log Arduino messages
    parser.on('data', (data) => {
      console.log('📟 Arduino:', data.trim());
    });

  } catch (err) {
    console.error('❌ Failed to connect to Arduino:', err.message);
    console.log('🔄 Retrying in 5 seconds...');
    setTimeout(connectArduino, 5000);
  }
}

// Main endpoint - receives resistance data from Chrome extension
app.post('/update', (req, res) => {
  const { tokens, resistance } = req.body;
  
  // Calculate resistance percentage if not provided
  let resistancePercent;
  if (typeof resistance === 'number') {
    resistancePercent = Math.round(Math.max(0, Math.min(100, resistance)));
  } else {
    // Fallback: calculate from tokens (100 tokens = 10%, 1000 = 100%)
    resistancePercent = Math.round(Math.min(100, (tokens / 1000) * 100));
  }
  
  console.log(`📊 Received update: ${resistancePercent}% resistance (${tokens} tokens)`);
  
  if (isConnected && arduinoPort) {
    // Send resistance to Arduino in format: R:50
    const command = `R:${resistancePercent}\n`;
    
    arduinoPort.write(command, (err) => {
      if (err) {
        console.error('❌ Write error:', err.message);
        return res.status(500).json({ 
          success: false,
          error: 'Failed to write to Arduino' 
        });
      }
      
      console.log(`✅ Sent to Arduino: ${command.trim()}`);
      res.json({ 
        success: true, 
        resistance: resistancePercent,
        tokens: tokens,
        command: command.trim()
      });
    });
  } else {
    console.warn('⚠️ Arduino not connected - cannot send data');
    res.status(503).json({ 
      success: false,
      error: 'Arduino not connected',
      tip: 'Check if Arduino is plugged in and server restarted'
    });
  }
});

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    arduino: isConnected ? 'connected' : 'disconnected',
    port: ARDUINO_PORT,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint - send a test resistance value to Arduino
app.get('/test/:resistance', (req, res) => {
  const resistance = parseInt(req.params.resistance);
  
  if (isNaN(resistance) || resistance < 0 || resistance > 100) {
    return res.status(400).json({ error: 'Resistance must be between 0-100' });
  }
  
  if (isConnected && arduinoPort) {
    const command = `R:${resistance}\n`;
    arduinoPort.write(command);
    console.log(`🧪 Test: Sent ${command.trim()}`);
    res.json({ success: true, command: command.trim() });
  } else {
    res.status(503).json({ error: 'Arduino not connected' });
  }
});

// Ping Arduino
app.get('/ping', (req, res) => {
  if (isConnected && arduinoPort) {
    arduinoPort.write('PING\n');
    console.log('🏓 Sent PING to Arduino');
    res.json({ success: true, message: 'Ping sent' });
  } else {
    res.status(503).json({ error: 'Arduino not connected' });
  }
});

// List available serial ports (helpful for debugging)
app.get('/ports', async (req, res) => {
  try {
    const ports = await SerialPort.list();
    console.log('📋 Available ports:', ports);
    res.json({ 
      ports: ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Arduino Bridge Server Started!');
  console.log('='.repeat(60));
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔌 Target Arduino port: ${ARDUINO_PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   POST /update          - Receive resistance data`);
  console.log(`   GET  /status          - Check server status`);
  console.log(`   GET  /test/:resistance - Test with resistance (0-100)`);
  console.log(`   GET  /ports           - List available serial ports`);
  console.log(`   GET  /ping            - Ping Arduino`);
  console.log('='.repeat(60) + '\n');
  
  connectArduino();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  if (arduinoPort && isConnected) {
    console.log('🔌 Closing Arduino connection...');
    arduinoPort.close();
  }
  console.log('✅ Server stopped');
  process.exit(0);
});