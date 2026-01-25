// arduino-server.js - Local server to bridge browser and Arduino
const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');

const app = express();
const PORT = 3000;

// Enable CORS for Chrome extension
app.use(cors());
app.use(express.json());

// Configure your Arduino's serial port
// On Windows: 'COM3', 'COM4', etc.
// On Mac/Linux: '/dev/ttyUSB0', '/dev/ttyACM0', '/dev/cu.usbmodem14101', etc.
const ARDUINO_PORT = '/dev/ttyACM0'; // Change this to your port
const BAUD_RATE = 9600;

let serialPort;

// Initialize serial connection
try {
  serialPort = new SerialPort({
    path: ARDUINO_PORT,
    baudRate: BAUD_RATE
  });

  serialPort.on('open', () => {
    console.log('✅ Arduino connected on', ARDUINO_PORT);
  });

  serialPort.on('error', (err) => {
    console.error('❌ Serial port error:', err.message);
  });

  serialPort.on('data', (data) => {
    console.log('📥 Arduino says:', data.toString());
  });
} catch (error) {
  console.error('❌ Failed to connect to Arduino:', error);
}

// Endpoint to receive token updates
app.post('/update', (req, res) => {
  const { tokens, pwmValue, timestamp } = req.body;
  
  console.log(`📊 Received: ${tokens} tokens (PWM: ${pwmValue})`);
  
  if (serialPort && serialPort.isOpen) {
    // Send PWM value to Arduino (0-255)
    const command = `PWM:${pwmValue}\n`;
    
    serialPort.write(command, (err) => {
      if (err) {
        console.error('❌ Write error:', err.message);
        return res.status(500).json({ 
          success: false, 
          error: err.message 
        });
      }
      
      console.log(`✅ Sent to Arduino: ${command.trim()}`);
      res.json({ 
        success: true, 
        tokens, 
        pwmValue,
        timestamp 
      });
    });
  } else {
    res.status(503).json({ 
      success: false, 
      error: 'Arduino not connected' 
    });
  }
});

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    arduino: serialPort && serialPort.isOpen ? 'connected' : 'disconnected',
    port: ARDUINO_PORT
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Arduino bridge server running on http://localhost:${PORT}`);
  console.log(`📡 Waiting for Arduino on ${ARDUINO_PORT}...`);
});