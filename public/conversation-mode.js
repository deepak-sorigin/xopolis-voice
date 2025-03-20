// Complete updated conversation-mode.js with improved language dropdown population

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing clean conversation mode...');
    
    // Mode switching elements
    const singleModeBtn = document.getElementById('single-mode-btn');
    const conversationModeBtn = document.getElementById('conversation-mode-btn');
    const singleMode = document.getElementById('single-mode');
    const conversationMode = document.getElementById('conversation-mode');
    
    // Speaker elements
    const speaker1Toggle = document.getElementById('speaker1-toggle');
    const speaker2Toggle = document.getElementById('speaker2-toggle');
    const speaker1Panel = document.getElementById('speaker1-panel');
    const speaker2Panel = document.getElementById('speaker2-panel');
    const speaker1Status = document.getElementById('speaker1-status');
    const speaker2Status = document.getElementById('speaker2-status');
    const speaker1Language = document.getElementById('speaker1-language');
    const speaker2Language = document.getElementById('speaker2-language');
    const speaker1Visualizer = document.getElementById('speaker1-visualizer');
    const speaker2Visualizer = document.getElementById('speaker2-visualizer');
    const speaker1Transcription = document.getElementById('speaker1-transcription');
    const speaker2Transcription = document.getElementById('speaker2-transcription');
    const speaker1Translation = document.getElementById('speaker1-translation');
    const speaker2Translation = document.getElementById('speaker2-translation');
    
    // WebSocket connection
    let websocket = null;
    
    // Audio handling variables
    let activeSpeaker = null;
    let audioStream = null;
    let audioContext = null;
    let audioProcessor = null;
    let audioAnalyser = null;
    
    // Initialize visualization canvases
    function initializeVisualizers() {
        speaker1Visualizer.width = speaker1Visualizer.offsetWidth;
        speaker1Visualizer.height = speaker1Visualizer.offsetHeight;
        speaker2Visualizer.width = speaker2Visualizer.offsetWidth;
        speaker2Visualizer.height = speaker2Visualizer.offsetHeight;
        
        const ctx1 = speaker1Visualizer.getContext('2d');
        const ctx2 = speaker2Visualizer.getContext('2d');
        
        ctx1.fillStyle = '#f5f5f5';
        ctx1.fillRect(0, 0, speaker1Visualizer.width, speaker1Visualizer.height);
        ctx2.fillStyle = '#f5f5f5';
        ctx2.fillRect(0, 0, speaker2Visualizer.width, speaker2Visualizer.height);
    }
    
    // Populate language dropdowns using the same list as the main app
    function populateLanguageDropdowns() {
        // Get language options from the main app's dropdowns
        const sourceLanguageElem = document.getElementById('source-language');
        if (!sourceLanguageElem) {
            console.error('Could not find source-language element');
            return; // Safety check
        }
        
        console.log('Populating language dropdowns');
        
        // Get all options from the source-language dropdown
        const sourceLanguages = Array.from(sourceLanguageElem.options)
            .map(option => ({ code: option.value, name: option.textContent }));
        
        console.log('Found', sourceLanguages.length, 'languages in source dropdown');
        
        // Clear and populate speaker language dropdowns
        speaker1Language.innerHTML = '';
        speaker2Language.innerHTML = '';
        
        sourceLanguages.forEach(lang => {
            const option1 = document.createElement('option');
            option1.value = lang.code;
            option1.textContent = lang.name;
            speaker1Language.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = lang.code;
            option2.textContent = lang.name;
            speaker2Language.appendChild(option2);
        });
        
        // Set default languages (optionally keep previous selections)
        const previousSpeaker1Lang = speaker1Language.value;
        const previousSpeaker2Lang = speaker2Language.value;
        
        if (previousSpeaker1Lang && sourceLanguages.some(lang => lang.code === previousSpeaker1Lang)) {
            speaker1Language.value = previousSpeaker1Lang;
        } else {
            speaker1Language.value = 'en-US'; // Default to English
        }
        
        if (previousSpeaker2Lang && sourceLanguages.some(lang => lang.code === previousSpeaker2Lang)) {
            speaker2Language.value = previousSpeaker2Lang;
        } else {
            speaker2Language.value = 'es-ES'; // Default to Spanish
        }
        
        console.log('Language dropdowns populated successfully');
    }
    
    // Connect to WebSocket server
    function connectWebSocket() {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('Using existing WebSocket connection');
            return websocket;
        }
        
        const wsUrl = window.location.hostname === 'localhost' 
            ? 'ws://localhost:3000'
            : `wss://${window.location.host}`;
        
        console.log('Connecting to WebSocket server at', wsUrl);
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = () => {
            console.log('WebSocket connection established');
        };
        
        websocket.onmessage = (event) => {
            handleWebSocketMessage(event);
        };
        
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        websocket.onclose = () => {
            console.log('WebSocket connection closed');
        };
        
        return websocket;
    }
    
    // Handle WebSocket messages
    function handleWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message);
            
            // Handle transcription results
            if (message.type === 'transcription') {
                if (!activeSpeaker) return;
                
                const transcriptionElem = activeSpeaker === 1 ? 
                    speaker1Transcription : speaker2Transcription;
                
                // Update transcription text
                if (message.data && message.data.text) {
                    transcriptionElem.textContent = message.data.text;
                    console.log('Updated transcription for speaker', activeSpeaker);
                }
                
                // If final result, update status
                if (message.data && message.data.isFinal) {
                    const statusElem = activeSpeaker === 1 ? speaker1Status : speaker2Status;
                    statusElem.textContent = 'Processing...';
                    statusElem.className = 'status-indicator processing';
                }
            }
            
            // Handle translation results
            if (message.type === 'translation') {
                if (!activeSpeaker) return;
                
                // Translation goes to the OTHER speaker's panel
                const translationElem = activeSpeaker === 1 ? 
                    speaker2Translation : speaker1Translation;
                
                // Update translation text
                if (message.data && message.data.text) {
                    translationElem.textContent = message.data.text;
                    console.log('Updated translation for other speaker');
                }
                
                // Reset status
                const statusElem = activeSpeaker === 1 ? speaker1Status : speaker2Status;
                statusElem.textContent = 'Listening...';
                statusElem.className = 'status-indicator listening';
            }
            
            // Handle errors
            if (message.type === 'error') {
                console.error('Server error:', message.data);
                
                // Special handling for timeout errors
                if (message.data && message.data.code === 'AUDIO_TIMEOUT') {
                    console.log('Audio timeout occurred, stopping recording automatically');
                    
                    // Reset UI state and stop recording
                    stopSpeaking();
                    
                    // Show a notification to the user
                    const notification = document.createElement('div');
                    notification.className = 'timeout-notification';
                    notification.style.position = 'fixed';
                    notification.style.bottom = '20px';
                    notification.style.left = '50%';
                    notification.style.transform = 'translateX(-50%)';
                    notification.style.backgroundColor = '#fff3e0';
                    notification.style.color = '#e65100';
                    notification.style.padding = '10px 20px';
                    notification.style.borderRadius = '4px';
                    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
                    notification.style.zIndex = '1000';
                    notification.textContent = 'Recording automatically stopped due to silence';
                    
                    document.body.appendChild(notification);
                    
                    // Remove after 5 seconds
                    setTimeout(() => {
                        document.body.removeChild(notification);
                    }, 5000);
                } else {
                    // For other errors
                    alert('Server error: ' + (message.data && message.data.message ? message.data.message : 'Unknown error'));
                    stopSpeaking();
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }
    
    // Stop active speaker
    function stopSpeaking() {
        if (!activeSpeaker) return;
        
        const speakerToggle = activeSpeaker === 1 ? speaker1Toggle : speaker2Toggle;
        const speakerPanel = activeSpeaker === 1 ? speaker1Panel : speaker2Panel;
        const speakerStatus = activeSpeaker === 1 ? speaker1Status : speaker2Status;
        const otherToggle = activeSpeaker === 1 ? speaker2Toggle : speaker1Toggle;
        
        // Reset UI
        speakerToggle.classList.remove('stop');
        speakerToggle.classList.add('start');
        speakerToggle.innerHTML = `
            <svg class="microphone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            Start Speaking
        `;
        speakerPanel.classList.remove('active-speaker', 'pulsing');
        speakerStatus.textContent = 'Ready';
        speakerStatus.className = 'status-indicator idle';
        
        // Enable other speaker
        otherToggle.disabled = false;
        
        // Stop recording
        stopRecording();
        
        // Clear active speaker
        activeSpeaker = null;
    }
    
    // Start recording
    async function startRecording(speakerId) {
        try {
            // Connect to WebSocket server
            connectWebSocket();
            
            // Wait for connection to establish
            if (websocket.readyState !== WebSocket.OPEN) {
                await new Promise((resolve, reject) => {
                    const checkConnection = () => {
                        if (websocket.readyState === WebSocket.OPEN) {
                            resolve();
                        } else if (websocket.readyState === WebSocket.CLOSED || 
                                  websocket.readyState === WebSocket.CLOSING) {
                            reject(new Error('WebSocket connection failed'));
                        } else {
                            setTimeout(checkConnection, 100);
                        }
                    };
                    checkConnection();
                });
            }
            
            // Get language settings
            const sourceLanguage = speakerId === 1 ? 
                speaker1Language.value : speaker2Language.value;
            const targetLanguage = speakerId === 1 ? 
                speaker2Language.value.split('-')[0] : 
                speaker1Language.value.split('-')[0];
            
            console.log('Starting recording with source language:', sourceLanguage, 
                        'and target language:', targetLanguage);
            
            // Send start message to server
            websocket.send(JSON.stringify({
                type: 'start',
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage
            }));
            
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    channelCount: 1,
                    sampleRate: 16000
                } 
            });
            
            // Store the stream
            audioStream = stream;
            
            // Set up audio processing
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            
            // Create analyzer for visualization
            audioAnalyser = audioContext.createAnalyser();
            audioAnalyser.fftSize = 256;
            
            // Create source from stream
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(audioAnalyser);
            
            // Create processor for sending audio data
            audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
            source.connect(audioProcessor);
            audioProcessor.connect(audioContext.destination);
            
            // Process audio data
            audioProcessor.onaudioprocess = (e) => {
                if (!websocket || websocket.readyState !== WebSocket.OPEN) {
                    return;
                }
                
                // Get input data
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Convert to Int16 for Google Speech API
                const int16Data = convertFloat32ToInt16(inputData);
                
                // Send to server
                websocket.send(JSON.stringify({
                    type: 'audio',
                    audio: arrayBufferToBase64(int16Data)
                }));
            };
            
            // Start visualization
            updateVisualization(speakerId);
            
            console.log('Recording started successfully');
            return true;
        } catch (error) {
            console.error('Error starting recording:', error);
            if (error.name === 'NotAllowedError') {
                alert('Microphone access denied. Please allow microphone access and try again.');
            } else {
                alert('Error starting recording: ' + error.message);
            }
            return false;
        }
    }
    
    // Stop recording
    function stopRecording() {
        console.log('Stopping recording');
        
        // Stop audio tracks
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        
        // Clean up audio context
        if (audioProcessor) {
            audioProcessor.disconnect();
            audioProcessor = null;
        }
        
        if (audioContext) {
            audioContext.close().catch(console.error);
            audioContext = null;
        }
        
        audioAnalyser = null;
        
        // Send stop message to server
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'stop' }));
        }
        
        // Clear visualizers
        clearVisualizer(1);
        clearVisualizer(2);
    }
    
    // Clear a specific visualizer
    function clearVisualizer(speakerId) {
        const canvas = speakerId === 1 ? speaker1Visualizer : speaker2Visualizer;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Update visualization
    function updateVisualization(speakerId) {
        if (!audioAnalyser) return;
        
        const canvas = speakerId === 1 ? speaker1Visualizer : speaker2Visualizer;
        const ctx = canvas.getContext('2d');
        const bufferLength = audioAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function draw() {
            if (!audioAnalyser) return; // Stop if not recording anymore
            
            requestAnimationFrame(draw);
            
            // Get frequency data
            audioAnalyser.getByteFrequencyData(dataArray);
            
            // Clear canvas
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw visualization bars
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                
                ctx.fillStyle = `rgb(${Math.min(dataArray[i] + 50, 255)}, 158, 232)`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        }
        
        draw();
    }
    
    // Toggle speaking for a speaker
    async function toggleSpeaking(speakerId) {
        const isFirstSpeaker = speakerId === 1;
        const speakerToggle = isFirstSpeaker ? speaker1Toggle : speaker2Toggle;
        const otherToggle = isFirstSpeaker ? speaker2Toggle : speaker1Toggle;
        const speakerPanel = isFirstSpeaker ? speaker1Panel : speaker2Panel;
        const speakerStatus = isFirstSpeaker ? speaker1Status : speaker2Status;
        
        // Check if the button visually indicates it's in "stop" mode
        const isSpeaking = speakerToggle.classList.contains('stop');
        
        console.log('Toggle speaking for speaker', speakerId, 'currently speaking:', isSpeaking);
        
        if (isSpeaking) {
            // Stop speaking
            console.log('Stopping speaking for speaker', speakerId);
            
            // Update button to "Start Speaking"
            speakerToggle.classList.remove('stop');
            speakerToggle.classList.add('start');
            speakerToggle.innerHTML = `
                <svg class="microphone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                Start Speaking
            `;
            speakerPanel.classList.remove('active-speaker', 'pulsing');
            speakerStatus.textContent = 'Ready';
            speakerStatus.className = 'status-indicator idle';
            
            // Enable the other speaker's button
            otherToggle.disabled = false;
            
            // Stop recording
            stopRecording();
            
            // Clear active speaker
            activeSpeaker = null;
        } else {
            // Start speaking
            console.log('Starting speaking for speaker', speakerId);
            
            // First, make sure any active speaker is stopped
            if (activeSpeaker) {
                const currentActiveToggle = activeSpeaker === 1 ? speaker1Toggle : speaker2Toggle;
                console.log('Another speaker is active, stopping them first');
                
                // Force stop the current active speaker
                if (currentActiveToggle.classList.contains('stop')) {
                    // Manually update UI without triggering toggle
                    currentActiveToggle.classList.remove('stop');
                    currentActiveToggle.classList.add('start');
                    currentActiveToggle.innerHTML = `
                        <svg class="microphone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                        </svg>
                        Start Speaking
                    `;
                    
                    const currentActivePanel = activeSpeaker === 1 ? speaker1Panel : speaker2Panel;
                    const currentActiveStatus = activeSpeaker === 1 ? speaker1Status : speaker2Status;
                    
                    currentActivePanel.classList.remove('active-speaker', 'pulsing');
                    currentActiveStatus.textContent = 'Ready';
                    currentActiveStatus.className = 'status-indicator idle';
                }
                
                // Stop the recording
                stopRecording();
            }
            
            // Update button to "Stop Speaking"
            speakerToggle.classList.remove('start');
            speakerToggle.classList.add('stop');
            speakerToggle.innerHTML = `
                <svg class="microphone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                Stop Speaking
            `;
            speakerPanel.classList.add('active-speaker', 'pulsing');
            speakerStatus.textContent = 'Listening...';
            speakerStatus.className = 'status-indicator listening';
            
            // Disable the other speaker's button
            otherToggle.disabled = true;
            
            // Set active speaker
            activeSpeaker = speakerId;
            
            // Clear existing content
            const transcriptionElem = isFirstSpeaker ? 
                speaker1Transcription : speaker2Transcription;
            const translationElem = isFirstSpeaker ? 
                speaker2Translation : speaker1Translation;
                
            transcriptionElem.textContent = '';
            translationElem.textContent = '';
            
            // Start recording
            const success = await startRecording(speakerId);
            
            // If recording failed, reset UI
            if (!success) {
                console.error('Failed to start recording');
                
                speakerToggle.classList.remove('stop');
                speakerToggle.classList.add('start');
                speakerToggle.innerHTML = `
                    <svg class="microphone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                    Start Speaking
                `;
                speakerPanel.classList.remove('active-speaker', 'pulsing');
                speakerStatus.textContent = 'Ready';
                speakerStatus.className = 'status-indicator idle';
                otherToggle.disabled = false;
                activeSpeaker = null;
            }
        }
    }
    
    // Utility: Convert Float32Array to Int16Array
    function convertFloat32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array.buffer;
    }
    
    // Utility: Convert ArrayBuffer to Base64
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
    
    // Setup UI event listeners
    function setupEventListeners() {
        console.log('Setting up event listeners');
        
        // Mode switching
        singleModeBtn.addEventListener('click', function() {
            console.log('Switching to single mode');
            
            // Stop any active recordings
            if (activeSpeaker) {
                stopSpeaking();
            }
            
            singleModeBtn.classList.add('active');
            conversationModeBtn.classList.remove('active');
            singleMode.classList.add('show');
            conversationMode.classList.remove('show');
        });
        
        conversationModeBtn.addEventListener('click', function() {
            console.log('Switching to conversation mode');
            
            conversationModeBtn.classList.add('active');
            singleModeBtn.classList.remove('active');
            conversationMode.classList.add('show');
            singleMode.classList.remove('show');
            
            // Initialize conversation mode
            initializeVisualizers();
            populateLanguageDropdowns();
            
            // Reset conversation UI state with empty content
            speaker1Status.textContent = 'Ready';
            speaker1Status.className = 'status-indicator idle';
            speaker2Status.textContent = 'Ready';
            speaker2Status.className = 'status-indicator idle';
            
            // Clear all text content
            speaker1Transcription.textContent = '';
            speaker2Transcription.textContent = '';
            speaker1Translation.textContent = '';
            speaker2Translation.textContent = '';
        });
        
        // Speaker toggle buttons
        speaker1Toggle.addEventListener('click', function() {
            console.log('Speaker 1 toggle clicked');
            toggleSpeaking(1);
        });
        
        speaker2Toggle.addEventListener('click', function() {
            console.log('Speaker 2 toggle clicked');
            toggleSpeaking(2);
        });
        
        // Language change handlers
        speaker1Language.addEventListener('change', function() {
            if (activeSpeaker !== 1) {
                // Only allow changing language when not speaking
                speaker1Transcription.textContent = '';
            }
        });
        
        speaker2Language.addEventListener('change', function() {
            if (activeSpeaker !== 2) {
                // Only allow changing language when not speaking
                speaker2Transcription.textContent = '';
            }
        });
    }
    
    // Initialize conversation mode
    function initialize() {
        // Set up event listeners
        setupEventListeners();
        
        // If conversation mode is already visible at load time, initialize it
        if (conversationMode.classList.contains('show')) {
            initializeVisualizers();
            populateLanguageDropdowns();
        }
        
        console.log('Clean conversation mode initialization complete');
    }
    
    // Initialize on page load
    initialize();
});