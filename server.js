// server.js - Node.js server for handling the Google Cloud API integration
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const { Translate } = require('@google-cloud/translate').v2;
const speech = require('@google-cloud/speech');
const conversations = new Map();

// Initialize the app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Google Cloud clients
// Note: This assumes the GOOGLE_APPLICATION_CREDENTIALS environment variable 
// points to your JSON key file, or you've set credentials explicitly
const speechClient = new speech.SpeechClient();
const translate = new Translate();

// Store active sessions
const sessions = new Map();

// Error handling function for streaming errors
const handleStreamingError = (error, sessionId, recognizeStream, ws, sessions) => {
  console.error(`Transcription error for session ${sessionId}:`, error);
  
  // Check if it's a timeout error
  if (error.message && error.message.includes('Audio Timeout Error')) {
    console.log(`Audio timeout detected for session ${sessionId}, handling gracefully`);
    
    // Send a friendly message to the client
    ws.send(JSON.stringify({ 
      type: 'error', 
      data: { 
        message: 'No speech detected for a while - recording stopped', 
        details: 'Recording automatically stopped due to silence', 
        code: 'AUDIO_TIMEOUT' 
      } 
    }));
    
    // End the recognize stream
    if (recognizeStream) {
      recognizeStream.end();
    }
    
    // Remove the session
    if (sessions && sessions.has(sessionId)) {
      sessions.delete(sessionId);
    }
  } else {
    // For other errors, send the error to the client
    ws.send(JSON.stringify({ 
      type: 'error', 
      data: { 
        message: 'Error during transcription', 
        details: error.message 
      } 
    }));
  }
};

// WebSocket connection handler
wss.on('connection', (ws) => {
  // Generate a unique session ID for this connection
  const sessionId = uuidv4();
  console.log(`New WebSocket connection established: ${sessionId}`);
  
  // Variables for this session
  let recognizeStream = null;
  let sourceLanguage = 'en-US';  // Default source language
  let targetLanguage = 'es';     // Default target language
  
  // Send a message to the client
  const sendMessage = (type, data) => {
    ws.send(JSON.stringify({ type, data }));
  };
  
  // Handle incoming messages from the client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Add a new case for conversation mode
      if (data.mode === 'conversation') {
        const { speakerId, action, sourceLanguage, targetLanguage } = data;
        
        switch (action) {
          case 'start':
            // Start transcription for specified speaker
            console.log(`Starting transcription for speaker ${speakerId}`);
            
            sourceLanguage = data.sourceLanguage || 'en-US';
            targetLanguage = data.targetLanguage || 'es';
            
            // Create a recognize stream for this speaker
            recognizeStream = speechClient.streamingRecognize({
              config: {
                encoding: 'LINEAR16',
                sampleRateHertz: 16000,
                languageCode: sourceLanguage,
                enableAutomaticPunctuation: true,
                model: 'default',
                useEnhanced: true,
              },
              interimResults: true,
            });
            
            // Store this session with speaker information
            sessions.set(sessionId, { 
              recognizeStream, 
              ws, 
              speakerId,
              sourceLanguage,
              targetLanguage
            });
            
            // Handle transcription results
            recognizeStream.on('data', async (response) => {
              // Get transcription from the response
              const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join('\n');
              
              const isFinal = response.results[0].isFinal;
              
              // Send the transcription back to the client
              sendMessage('transcription', { 
                text: transcription, 
                isFinal,
                speakerId: speakerId
              });
              
              // If this is a final result, translate it
              if (isFinal) {
                try {
                  // Translate the text
                  const [translation] = await translate.translate(
                    transcription, 
                    targetLanguage
                  );
                  
                  // Send the translation back to the client
                  sendMessage('translation', { 
                    text: translation,
                    sourceLanguage,
                    targetLanguage,
                    speakerId: speakerId
                  });
                  
                } catch (translateError) {
                  console.error('Translation error:', translateError);
                  sendMessage('error', { 
                    message: 'Error during translation',
                    details: translateError.message,
                    speakerId: speakerId
                  });
                }
              }
            });
            
            // Handle errors
            recognizeStream.on('error', (error) => {
              handleStreamingError(error, sessionId, recognizeStream, ws, sessions);
            });
            
            // Handle end of stream
            recognizeStream.on('end', () => {
              console.log(`Transcription stream ended for speaker ${speakerId}`);
            });
            
            // Confirm speaker session started
            sendMessage('conversation', {
              speakerId: speakerId,
              action: 'start',
              status: 'success'
            });
            break;
            
          case 'audio':
            // Process audio for specified speaker
            if (recognizeStream && data.audio) {
              // Convert base64 audio data to buffer
              const audioBuffer = Buffer.from(data.audio, 'base64');
              
              // Write to the stream
              recognizeStream.write(audioBuffer);
            }
            break;
            
          case 'stop':
            // Stop transcription for specified speaker
            console.log(`Stopping transcription for speaker ${speakerId}`);
            if (recognizeStream) {
              recognizeStream.end();
              recognizeStream = null;
              console.log(`Ended transcription for speaker ${speakerId}`);
              
              // Update session status
              sendMessage('conversation', {
                speakerId: speakerId,
                action: 'stop',
                status: 'success'
              });
            }
            break;
            
          default:
            console.warn(`Unknown action for conversation mode: ${action}`);
        }
      } else {
        switch (data.type) {
          case 'start':
            // Configure the transcription based on client settings
            sourceLanguage = data.sourceLanguage || 'en-US';
            targetLanguage = data.targetLanguage || 'es';
            
            console.log(`Starting transcription session ${sessionId} from ${sourceLanguage} to ${targetLanguage}`);
            
            // Create a recognize stream for this session
            recognizeStream = speechClient.streamingRecognize({
              config: {
                encoding: 'LINEAR16',
                sampleRateHertz: 16000,
                languageCode: sourceLanguage,
                enableAutomaticPunctuation: true,
                model: 'default',
                useEnhanced: true,
              },
              interimResults: true,
            });
            
            // Store this session
            sessions.set(sessionId, { recognizeStream, ws });
            
            // Handle transcription results
            recognizeStream.on('data', async (response) => {
              // Get transcription from the response
              const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join('\n');
              
              const isFinal = response.results[0].isFinal;
              
              // Send the transcription back to the client
              sendMessage('transcription', { 
                text: transcription, 
                isFinal 
              });
              
              // If this is a final result, translate it
              if (isFinal) {
                try {
                  // Translate the text
                  const [translation] = await translate.translate(
                    transcription, 
                    targetLanguage
                  );
                  
                  // Send the translation back to the client
                  sendMessage('translation', { 
                    text: translation,
                    sourceLanguage,
                    targetLanguage
                  });
                  
                } catch (translateError) {
                  console.error('Translation error:', translateError);
                  sendMessage('error', { 
                    message: 'Error during translation',
                    details: translateError.message
                  });
                }
              }
            });
            
            // Handle errors - Updated to use the new error handling function
            recognizeStream.on('error', (error) => {
              handleStreamingError(error, sessionId, recognizeStream, ws, sessions);
            });
            
            // Handle end of stream
            recognizeStream.on('end', () => {
              console.log(`Transcription stream ended for session ${sessionId}`);
            });
            
            // Confirm session started
            sendMessage('started', { sessionId });
            break;
            
          case 'audio':
            // Forward audio data to the recognize stream
            if (recognizeStream && data.audio) {
              // Convert base64 audio data to buffer
              const audioBuffer = Buffer.from(data.audio, 'base64');
              
              // Write to the stream
              recognizeStream.write(audioBuffer);
            }
            break;
            
          case 'stop':
            // End the recognize stream
            if (recognizeStream) {
              recognizeStream.end();
              recognizeStream = null;
              console.log(`Ended transcription session ${sessionId}`);
              sessions.delete(sessionId);
              sendMessage('stopped', {});
            }
            break;
            
          default:
            console.warn(`Unknown message type: ${data.type}`);
        }
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Error processing message', details: error.message }
      }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log(`WebSocket connection closed: ${sessionId}`);
    // Clean up the recognize stream if it exists
    if (sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      if (session.recognizeStream) {
        session.recognizeStream.end();
      }
      sessions.delete(sessionId);
    }
  });
});

// API endpoints
app.get('/api/languages', async (req, res) => {
  try {
    // Get supported languages from Translation API
    const [languages] = await translate.getLanguages();
    res.json({ languages });
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});