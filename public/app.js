// app.js - Client-side implementation for the web app
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const startButton = document.getElementById('start-button');
  const stopButton = document.getElementById('stop-button');
  const statusElement = document.getElementById('status');
  const sourceLanguageSelect = document.getElementById('source-language');
  const targetLanguageSelect = document.getElementById('target-language');
  const transcriptionOutput = document.getElementById('transcription-output');
  const translationOutput = document.getElementById('translation-output');
  const latencyElement = document.getElementById('latency');
  const audioQualityElement = document.getElementById('audio-quality');
  const visualizer = document.getElementById('audio-visualizer');
  
  // Global variables
  let mediaRecorder;
  let audioContext;
  let analyser;
  let websocket;
  let isRecording = false;
  let audioProcessor;
  let recordingStartTime;
  let visualizerContext = visualizer.getContext('2d');
  let languageList = [];
  
  // Configuration
  const CONFIG = {
    websocketUrl: window.location.hostname === 'localhost' 
      ? 'ws://localhost:3000'
      : `wss://${window.location.host}`,
    sampleRate: 16000,
    encoding: 'LINEAR16'
  };
  
  // Initialize the application
  async function initialize() {
    try {
      // Fetch supported languages
      await fetchLanguages();
      
      // Initialize visualizer
      initVisualizer();
      
      // Check browser compatibility
      checkBrowserCompatibility();
      
      // Set up event listeners
      setupEventListeners();
      
      console.log('Application initialized successfully');
      updateStatus('Ready to start', 'idle');
    } catch (error) {
      console.error('Initialization error:', error);
      updateStatus('Error initializing app: ' + error.message, 'error');
    }
  }
  
  // Fetch languages from the server
  async function fetchLanguages() {
    try {
      const response = await fetch('/api/languages');
      if (!response.ok) {
        throw new Error(`Failed to fetch languages: ${response.statusText}`);
      }
      
      const data = await response.json();
      languageList = data.languages || [];
      
      // Populate language dropdowns
      populateLanguageDropdowns();
    } catch (error) {
      console.error('Error fetching languages:', error);
      // Fall back to a minimal set of languages
      languageList = [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
        { code: 'ja', name: 'Japanese' },
        { code: 'zh-CN', name: 'Chinese (Simplified)' }
      ];
      populateLanguageDropdowns();
    }
  }
  
  // Populate language dropdowns
  function populateLanguageDropdowns() {
    // Clear existing options
    sourceLanguageSelect.innerHTML = '';
    targetLanguageSelect.innerHTML = '';
    
    // Add options for source language (speech-to-text)
    const sourceLanguages = [
      { code: 'ar-EG', name: 'Arabic (Egypt)' },
      { code: 'ar-SA', name: 'Arabic (Saudi Arabia)' },
      { code: 'bn-IN', name: 'Bengali (India)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'zh-TW', name: 'Chinese (Traditional)' },
      { code: 'nl-NL', name: 'Dutch (Netherlands)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'en-US', name: 'English (US)' },
      { code: 'fil-PH', name: 'Filipino (Philippines)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'de-DE', name: 'German (Germany)' },
      { code: 'hi-IN', name: 'Hindi (India)' },
      { code: 'id-ID', name: 'Indonesian (Indonesia)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'ja-JP', name: 'Japanese (Japan)' },
      { code: 'ko-KR', name: 'Korean (South Korea)' },
      { code: 'mr-IN', name: 'Marathi (India)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'pt-PT', name: 'Portuguese (Portugal)' },
      { code: 'ru-RU', name: 'Russian (Russia)' },
      { code: 'es-MX', name: 'Spanish (Mexico)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'th-TH', name: 'Thai (Thailand)' },
      { code: 'tr-TR', name: 'Turkish (Turkey)' },
      { code: 'uk-UA', name: 'Ukrainian (Ukraine)' },
      { code: 'ur-PK', name: 'Urdu (Pakistan)' },
      { code: 'vi-VN', name: 'Vietnamese (Vietnam)' }
    ];
    
    sourceLanguages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      sourceLanguageSelect.appendChild(option);
    });
    
    // Add options for target language (translation)
    languageList.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      targetLanguageSelect.appendChild(option);
    });
  }
  
  // Check browser compatibility
  function checkBrowserCompatibility() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateStatus('Your browser does not support audio recording. Please use a modern browser.', 'error');
      startButton.disabled = true;
      return false;
    }
    
    if (!window.WebSocket) {
      updateStatus('Your browser does not support WebSockets. Please use a modern browser.', 'error');
      startButton.disabled = true;
      return false;
    }
    
    return true;
  }
  
  // Set up event listeners
  function setupEventListeners() {
    startButton.addEventListener('click', startRecording);
    stopButton.addEventListener('click', stopRecording);
    
    // Reset outputs when language changes
    sourceLanguageSelect.addEventListener('change', () => {
      if (!isRecording) {
        transcriptionOutput.textContent = "Your transcribed text will appear here...";
        translationOutput.textContent = "Your translated text will appear here...";
      }
    });
    
    targetLanguageSelect.addEventListener('change', () => {
      if (!isRecording) {
        translationOutput.textContent = "Your translated text will appear here...";
      }
    });
    
    // Handle window resize for visualizer
    window.addEventListener('resize', () => {
      if (visualizer) {
        visualizer.width = visualizer.offsetWidth;
        visualizer.height = visualizer.offsetHeight;
      }
    });
  }
  
  // Initialize the audio visualizer
  function initVisualizer() {
    visualizer.width = visualizer.offsetWidth;
    visualizer.height = visualizer.offsetHeight;
    visualizerContext.fillStyle = '#f5f5f5';
    visualizerContext.fillRect(0, 0, visualizer.width, visualizer.height);
  }
  
  // Start recording function
  async function startRecording() {
    try {
      // Reset output areas
      transcriptionOutput.textContent = "";
      translationOutput.textContent = "";
      
      // Update UI
      updateStatus('Initializing...', 'initializing');
      startButton.disabled = true;
      recordingStartTime = Date.now();
      
      // Connect to WebSocket server
      await connectWebSocket();
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1,
          sampleRate: CONFIG.sampleRate
        } 
      });
      
      // Set up AudioContext for processing and visualization
      setupAudioProcessing(stream);
      
      // Update UI
      isRecording = true;
      stopButton.disabled = false;
      updateStatus('Recording...', 'recording');
      
      console.log('Recording started successfully');
    } catch (error) {
      console.error('Error starting recording:', error);
      updateStatus('Error: ' + error.message, 'error');
      startButton.disabled = false;
    }
  }
  
  // Connect to WebSocket server
  function connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        websocket = new WebSocket(CONFIG.websocketUrl);
        
        websocket.onopen = () => {
          console.log('WebSocket connection established');
          
          // Send start message with language preferences
          websocket.send(JSON.stringify({
            type: 'start',
            sourceLanguage: sourceLanguageSelect.value,
            targetLanguage: targetLanguageSelect.value
          }));
          
          resolve();
        };
        
        websocket.onmessage = (event) => {
          handleWebSocketMessage(event);
        };
        
        websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          updateStatus('Connection error', 'error');
          reject(new Error('WebSocket connection failed'));
        };
        
        websocket.onclose = () => {
          console.log('WebSocket connection closed');
          if (isRecording) {
            updateStatus('Connection lost. Try again.', 'error');
            stopRecording();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Set up audio processing
  function setupAudioProcessing(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: CONFIG.sampleRate
    });
    
    // Create analyzer for visualization
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Create source from microphone stream
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    // Create processor for sending audio data
    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
    
    // Process audio data
    audioProcessor.onaudioprocess = (e) => {
      if (!isRecording || !websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
      }
      
      // Get audio data
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert float32 to int16
      const int16Data = convertFloat32ToInt16(inputData);
      
      // Send audio data to server
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          type: 'audio',
          audio: arrayBufferToBase64(int16Data)
        }));
      }
      
      // Update visualization
      analyser.getByteFrequencyData(dataArray);
      drawVisualization(dataArray);
      
      // Update latency
      const currentTime = Date.now();
      const elapsedTime = currentTime - recordingStartTime;
      latencyElement.textContent = `${elapsedTime} ms`;
      
      // Update audio quality
      updateAudioQuality(dataArray);
    };
    
    // Start visualization loop
    function updateVisualization() {
      if (isRecording) {
        requestAnimationFrame(updateVisualization);
        analyser.getByteFrequencyData(dataArray);
        drawVisualization(dataArray);
      }
    }
    updateVisualization();
  }
  
  // Convert Float32Array to Int16Array (for LINEAR16 encoding)
  function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Convert float [-1.0, 1.0] to int16 [-32768, 32767]
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
  }
  
  // Convert ArrayBuffer to Base64 string
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
  
  // Draw visualization bars
  function drawVisualization(dataArray) {
    const bufferLength = dataArray.length;
    const barWidth = (visualizer.width / bufferLength) * 2.5;
    
    visualizerContext.fillStyle = '#f5f5f5';
    visualizerContext.fillRect(0, 0, visualizer.width, visualizer.height);
    
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = dataArray[i] / 255 * visualizer.height;
      
      visualizerContext.fillStyle = `rgb(${dataArray[i]}, 158, 232)`;
      visualizerContext.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
    }
  }
  
  // Handle WebSocket messages
  function handleWebSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'transcription':
          // Update transcription output
          if (message.data.isFinal) {
            transcriptionOutput.textContent = message.data.text;
          } else {
            // Show interim results in lighter color
            transcriptionOutput.innerHTML = `<span style="color: #666;">${message.data.text}</span>`;
          }
          break;
          
        case 'translation':
          // Update translation output
          translationOutput.textContent = message.data.text;
          break;
          
        case 'error':
          console.error('Server error:', message.data);
          updateStatus(`Error: ${message.data.message}`, 'error');
          break;
          
        case 'started':
          console.log('Session started:', message.data.sessionId);
          break;
          
        case 'stopped':
          console.log('Session stopped');
          break;
          
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }
  
  // Stop recording function
  function stopRecording() {
    isRecording = false;
    
    // Disconnect audio processor
    if (audioProcessor) {
      audioProcessor.disconnect();
      audioProcessor = null;
    }
    
    // Close audio context
    if (audioContext) {
      audioContext.close().catch(console.error);
    }
    
    // Send stop message to server
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: 'stop' }));
    }
    
    // Close WebSocket connection
    if (websocket) {
      websocket.close();
      websocket = null;
    }
    
    // Update UI
    startButton.disabled = false;
    stopButton.disabled = true;
    updateStatus('Ready to start', 'idle');
    
    // Clear visualization
    visualizerContext.fillStyle = '#f5f5f5';
    visualizerContext.fillRect(0, 0, visualizer.width, visualizer.height);
    
    console.log('Recording stopped');
  }
  
  // Update status message and class
  function updateStatus(message, className) {
    statusElement.textContent = message;
    statusElement.className = 'status';
    if (className) {
      statusElement.classList.add(className);
    }
  }
  
  // Update audio quality indicator
  function updateAudioQuality(dataArray) {
    if (!dataArray) return;
    
    // Calculate average volume
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const avg = sum / dataArray.length;
    
    // Determine quality based on average volume
    let quality;
    if (avg < 50) {
      quality = 'Low';
    } else if (avg < 100) {
      quality = 'Fair';
    } else if (avg < 150) {
      quality = 'Good';
    } else {
      quality = 'Excellent';
    }
    
    audioQualityElement.textContent = quality;
  }
  
  // Initialize the application
  initialize();
});