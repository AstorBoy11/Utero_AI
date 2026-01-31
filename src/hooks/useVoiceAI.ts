'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { VoiceState, Message, ChatResponse } from '@/types';
import { DEFAULT_MODEL, GREETING_MESSAGE, getModelById, AIProvider } from '@/constants/ai';

// Configuration
const SPEECH_DELAY_MS = 2500; // 2.5 seconds delay after user stops speaking
const MAX_NETWORK_RETRIES = 3; // Maximum number of retries for network errors
const RETRY_DELAY_BASE_MS = 1000; // Base delay for retry (will be multiplied by attempt number)

// Function to clean text for TTS (remove markdown symbols that would be read aloud)
const cleanTextForTTS = (text: string): string => {
    return text
        // Remove thinking tags
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        // Remove bold/italic markers (**, *, __)
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
        .replace(/\*([^*]+)\*/g, '$1')      // *italic* -> italic
        .replace(/__([^_]+)__/g, '$1')      // __underline__ -> underline
        .replace(/_([^_]+)_/g, '$1')        // _italic_ -> italic
        // Remove headers (#, ##, ###)
        .replace(/^#{1,6}\s*/gm, '')
        // Remove bullet points and list markers
        .replace(/^[\s]*[-*+]\s+/gm, '')    // - item, * item, + item
        .replace(/^[\s]*\d+\.\s+/gm, '')    // 1. item, 2. item
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')        // `code` -> code
        // Remove remaining asterisks and underscores
        .replace(/[*_]/g, '')
        // Remove excessive whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

// Interface definitions
interface UseVoiceAIOptions {
    onStateChange?: (state: VoiceState) => void;
    onTranscript?: (text: string) => void;
    onResponse?: (text: string) => void;
    onError?: (error: string) => void;
    initialModel?: string;
}

interface UseVoiceAIReturn {
    state: VoiceState;
    transcript: string;
    response: string;
    isSupported: boolean;
    startListening: () => void;
    stopListening: () => void;
    speak: (text: string) => void;
    stopSpeaking: () => void;
    messages: Message[];
    greet: () => void;
    currentModel: string;
    setCurrentModel: (modelId: string) => void;
    networkError: boolean;
}

export const useVoiceAI = (options: UseVoiceAIOptions = {}): UseVoiceAIReturn => {
    const [state, setState] = useState<VoiceState>('idle');
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isSupported, setIsSupported] = useState(false);
    const [currentModel, setCurrentModel] = useState(options.initialModel || DEFAULT_MODEL);
    const [networkError, setNetworkError] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
    const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
    const messagesRef = useRef<Message[]>([]);
    const optionsRef = useRef(options);
    const isInitializedRef = useRef(false);

    // Debounce timer for speech processing
    const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const accumulatedTranscriptRef = useRef<string>('');

    // Network retry tracking
    const networkRetryCountRef = useRef<number>(0);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Keep refs updated
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    // Speak text using TTS
    const speak = useCallback((text: string) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

        console.log('[TTS] Speaking:', text.substring(0, 50) + '...');

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to find Indonesian voice
        const voices = window.speechSynthesis.getVoices();
        const indonesianVoice = voices.find(
            (voice) => voice.lang.includes('id') || voice.lang.includes('ID')
        );
        if (indonesianVoice) {
            utterance.voice = indonesianVoice;
        }

        utterance.onstart = () => {
            console.log('[TTS] Started speaking');
            setState('speaking');
            optionsRef.current.onStateChange?.('speaking');
        };

        utterance.onend = () => {
            console.log('[TTS] Finished speaking');
            setState('idle');
            optionsRef.current.onStateChange?.('idle');
        };

        utterance.onerror = (event) => {
            // Ignore errors when speech is cancelled/interrupted by user
            const errorType = String(event.error || '');
            if (errorType.includes('interrupt') || errorType.includes('cancel') || !errorType) {
                console.log('[TTS] Speech was stopped');
            } else {
                console.warn('[TTS] Error:', errorType);
            }
            setState('idle');
        };

        synthesisRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, []);

    // Process message and get AI response
    const processMessage = useCallback(async (userMessage: string) => {
        console.log('[AI] Processing message:', userMessage);
        setState('processing');
        optionsRef.current.onStateChange?.('processing');

        const newUserMessage: Message = { role: 'user', content: userMessage };
        setMessages((prev) => [...prev, newUserMessage]);

        try {
            // Get provider from model info
            const modelInfo = getModelById(currentModel);
            const provider: AIProvider = modelInfo?.provider || 'gemini';

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    model: currentModel,
                    provider: provider,
                    history: messagesRef.current.slice(-10),
                }),
            });

            console.log('[AI] API Response status:', res.status);

            if (!res.ok) {
                let errorData;
                try {
                    errorData = await res.json();
                } catch {
                    // If JSON parsing fails, try to get text
                    try {
                        errorData = await res.text();
                    } catch {
                        errorData = 'Unknown error';
                    }
                }
                console.error('[AI] API Error:', errorData, 'Status:', res.status);
                throw new Error('Failed to get response from AI');
            }

            const data: ChatResponse = await res.json();
            console.log('[AI] Response data:', data);

            const aiResponse = data.choices?.[0]?.message?.content || 'Maaf, terjadi kesalahan.';

            // Clean up response for TTS (remove thinking tags, markdown symbols, etc.)
            const cleanResponse = cleanTextForTTS(aiResponse);

            setResponse(cleanResponse);
            optionsRef.current.onResponse?.(cleanResponse);

            const newAssistantMessage: Message = { role: 'assistant', content: cleanResponse };
            setMessages((prev) => [...prev, newAssistantMessage]);

            // Speak the response
            speak(cleanResponse);
        } catch (error) {
            console.error('[AI] Error processing message:', error);
            setState('idle');
            setResponse('Maaf, terjadi kesalahan koneksi. Pastikan API Key sudah dikonfigurasi dengan benar.');
            optionsRef.current.onError?.('Gagal mendapatkan respons dari AI');
        }
    }, [speak, currentModel]);

    // Store processMessage in ref to avoid useEffect dependency issues
    const processMessageRef = useRef(processMessage);
    useEffect(() => {
        processMessageRef.current = processMessage;
    }, [processMessage]);

    // Debounced process - waits for user to stop speaking
    const scheduleProcessing = useCallback((finalText: string) => {
        // Clear any existing timeout
        if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
            console.log('[STT] Cleared previous timeout, accumulating speech...');
        }

        // Accumulate transcript
        accumulatedTranscriptRef.current = finalText;
        setTranscript(finalText);
        optionsRef.current.onTranscript?.(finalText);

        console.log(`[STT] Waiting ${SPEECH_DELAY_MS}ms for more speech...`);

        // Set new timeout
        speechTimeoutRef.current = setTimeout(() => {
            const textToProcess = accumulatedTranscriptRef.current.trim();
            if (textToProcess) {
                console.log('[STT] Delay complete, processing:', textToProcess);

                // Stop recognition before processing
                if (recognitionRef.current) {
                    try {
                        recognitionRef.current.stop();
                    } catch {
                        // Ignore
                    }
                }

                // Process the accumulated transcript
                processMessageRef.current(textToProcess);

                // Reset accumulated transcript
                accumulatedTranscriptRef.current = '';
            }
            speechTimeoutRef.current = null;
        }, SPEECH_DELAY_MS);
    }, []);

    // Initialize speech recognition ONCE on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isInitializedRef.current) return; // Prevent re-initialization

        console.log('[STT] Initializing Speech Recognition...');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const hasSpeechRecognition = !!SpeechRecognitionAPI;
        const hasSpeechSynthesis = 'speechSynthesis' in window;

        console.log('[STT] SpeechRecognition available:', hasSpeechRecognition);
        console.log('[TTS] SpeechSynthesis available:', hasSpeechSynthesis);

        setIsSupported(hasSpeechRecognition && hasSpeechSynthesis);

        // Load voices
        if (hasSpeechSynthesis) {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.addEventListener('voiceschanged', () => {
                window.speechSynthesis.getVoices();
            });
        }

        if (hasSpeechRecognition) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recognition = new SpeechRecognitionAPI();
            recognition.continuous = true; // Allow continuous speech
            recognition.interimResults = true;
            recognition.lang = 'id-ID';
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                console.log('[STT] Recognition started - listening...');
            };

            // Track which results have been finalized to avoid duplication
            let finalizedResultsCount = 0;
            let committedTranscript = ''; // Accumulated final results

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                
                // Process only NEW results (from finalizedResultsCount onwards)
                for (let i = finalizedResultsCount; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0].transcript;
                    
                    if (result.isFinal) {
                        // Commit this result permanently
                        committedTranscript += (committedTranscript ? ' ' : '') + transcript.trim();
                        finalizedResultsCount = i + 1;
                    } else {
                        // Interim result - show but don't commit
                        interimTranscript += transcript;
                    }
                }

                // Display: committed + current interim
                const displayTranscript = committedTranscript + (interimTranscript ? ' ' + interimTranscript : '');
                
                console.log('[STT] Display:', displayTranscript);
                setTranscript(displayTranscript.trim());

                // Check if we have a new final result to process
                const lastResult = event.results[event.results.length - 1];
                if (lastResult.isFinal) {
                    console.log('[STT] Got final result, scheduling processing with delay...');
                    scheduleProcessing(committedTranscript);
                }
            };

            // Reset counters when recognition starts
            const originalOnStart = recognition.onstart;
            recognition.onstart = () => {
                finalizedResultsCount = 0;
                committedTranscript = '';
                originalOnStart?.();
            };

            recognition.onspeechstart = () => {
                console.log('[STT] Speech detected');
                // Clear timeout if user starts speaking again
                if (speechTimeoutRef.current) {
                    clearTimeout(speechTimeoutRef.current);
                    speechTimeoutRef.current = null;
                    console.log('[STT] User speaking again, cleared timeout');
                }
            };

            recognition.onspeechend = () => {
                console.log('[STT] Speech ended');
            };

            recognition.onnomatch = () => {
                console.log('[STT] No match found');
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onerror = (event: any) => {
                console.error('[STT] Recognition error:', event.error, event);

                // Clear any pending timeout
                if (speechTimeoutRef.current) {
                    clearTimeout(speechTimeoutRef.current);
                    speechTimeoutRef.current = null;
                }

                // Don't set idle for no-speech error if we're waiting for more input
                if (event.error === 'no-speech') {
                    console.log('[STT] No speech detected, but keeping listening state');
                    return;
                }

                // Handle network errors with retry
                if (event.error === 'network') {
                    if (networkRetryCountRef.current < MAX_NETWORK_RETRIES) {
                        networkRetryCountRef.current++;
                        setNetworkError(true);
                        console.log(`[STT] Network error detected. Retrying (${networkRetryCountRef.current}/${MAX_NETWORK_RETRIES})...`);

                        const delay = RETRY_DELAY_BASE_MS * networkRetryCountRef.current;

                        // Clear existing retry timeout
                        if (retryTimeoutRef.current) {
                            clearTimeout(retryTimeoutRef.current);
                        }

                        retryTimeoutRef.current = setTimeout(() => {
                            if (recognitionRef.current && state === 'listening') {
                                console.log('[STT] Attempting retry start...');
                                try {
                                    recognitionRef.current.start();
                                } catch (e) {
                                    console.error('[STT] Retry start failed:', e);
                                }
                            }
                        }, delay);
                        return; // Skip default error handling
                    } else {
                        console.log('[STT] Max network retries reached');
                    }
                }

                setState('idle');
                setNetworkError(false); // Reset network error state on final failure or other errors
                networkRetryCountRef.current = 0;

                // Provide user-friendly error messages
                let errorMessage = 'Speech recognition error';
                if (event.error === 'not-allowed') {
                    errorMessage = 'Microphone access denied. Please allow microphone access.';
                } else if (event.error === 'network') {
                    errorMessage = 'Network error. Please check your connection.';
                }

                optionsRef.current.onError?.(errorMessage);
            };

            recognition.onend = () => {
                console.log('[STT] Recognition ended');

                // If there's a pending timeout, let it complete
                if (speechTimeoutRef.current) {
                    console.log('[STT] Pending timeout exists, waiting for it to complete...');
                    return;
                }

                setState((prevState) => {
                    // Only reset to idle if we're still in listening state
                    if (prevState === 'listening') {
                        return 'idle';
                    }
                    return prevState;
                });
            };

            recognitionRef.current = recognition;
            isInitializedRef.current = true;
            console.log('[STT] Recognition initialized successfully');
        }

        return () => {
            // Clear any pending timeout
            if (speechTimeoutRef.current) {
                clearTimeout(speechTimeoutRef.current);
                speechTimeoutRef.current = null;
            }

            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort();
                } catch {
                    // Ignore errors when aborting
                }
            }
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, [scheduleProcessing]);

    // Start listening
    const startListening = useCallback(() => {
        console.log('[STT] startListening called, current state:', state);
        console.log('[STT] recognitionRef.current:', !!recognitionRef.current);

        if (!recognitionRef.current) {
            console.error('[STT] Recognition not initialized');
            return;
        }

        if (state !== 'idle') {
            console.log('[STT] Cannot start - not in idle state');
            return;
        }

        // Stop any ongoing speech
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        // Reset state
        setTranscript('');
        accumulatedTranscriptRef.current = '';
        setNetworkError(false);
        networkRetryCountRef.current = 0;

        // Clear any existing timeout
        if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
            speechTimeoutRef.current = null;
        }

        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }

        setState('listening');
        optionsRef.current.onStateChange?.('listening');

        try {
            console.log('[STT] Starting recognition...');
            recognitionRef.current.start();
        } catch (error: any) {
            console.error('[STT] Error starting recognition:', error);
            // If recognition is already started, that's fine, we can treat it as success
            if (error.name === 'InvalidStateError' || (error.message && error.message.includes('already started'))) {
                console.log('[STT] Recognition was already active, continuing...');
            } else {
                setState('idle');
            }
        }
    }, [state]);

    // Stop listening
    const stopListening = useCallback(() => {
        console.log('[STT] stopListening called');

        // Clear any pending timeout
        if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
            speechTimeoutRef.current = null;
        }

        if (!recognitionRef.current) return;
        try {
            recognitionRef.current.stop();
        } catch {
            // Ignore errors
        }
        setState('idle');
        optionsRef.current.onStateChange?.('idle');
    }, []);

    // Stop speaking
    const stopSpeaking = useCallback(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setState('idle');
        optionsRef.current.onStateChange?.('idle');
    }, []);

    // Greet user
    const greet = useCallback(() => {
        speak(GREETING_MESSAGE);
        setResponse(GREETING_MESSAGE);
    }, [speak]);

    return {
        state,
        transcript,
        response,
        isSupported,
        startListening,
        stopListening,
        speak,
        stopSpeaking,
        messages,
        greet,
        currentModel,
        setCurrentModel,
        networkError,
    };
};
