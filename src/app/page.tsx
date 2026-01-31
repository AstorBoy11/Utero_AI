'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { AvatarCanvas, VoiceControl, ChatBubble, ModelSelector } from '@/components';
import { useVoiceAI } from '@/hooks/useVoiceAI';
import { AIModel } from '@/constants/ai';
import Logo from './logo.png';

export default function Home() {
  const {
    state,
    transcript,
    response,
    isSupported,
    startListening,
    stopListening,
    messages,
    greet,
    stopSpeaking,
    currentModel,
    setCurrentModel,
    networkError,
  } = useVoiceAI({
    onError: (error) => console.error('Voice AI Error:', error),
  });

  // Greet on first load
  useEffect(() => {
    // Small delay to ensure voices are loaded
    const timer = setTimeout(() => {
      // Load voices first
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const handleStopInteraction = () => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'speaking') {
      stopSpeaking();
    }
  };

  const handleModelChange = (model: AIModel) => {
    setCurrentModel(model.id);
    console.log('[Model] Changed to:', model.name, '(', model.provider, ')');
  };

  return (
    <div className="h-[100dvh] bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 overflow-hidden relative flex flex-col">
      {/* Animated background elements - separated to prevent scroll issues */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-red-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-rose-600/20 rounded-full blur-3xl animate-pulse animation-delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-red-700/10 rounded-full blur-3xl" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="fixed inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-20 lg:h-20 relative">
            <Image
              src={Logo}
              alt="Utero Logo"
              fill
              sizes="(max-width: 640px) 40px, (max-width: 768px) 56px, (max-width: 1024px) 64px, 80px"
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm sm:text-base md:text-lg tracking-tight">
              Utero AI
            </h1>
            <p className="text-white/50 text-[10px] sm:text-xs">Virtual Assistant</p>
          </div>
        </div>

        {/* Model Selector */}
        <ModelSelector
          selectedModel={currentModel}
          onModelChange={handleModelChange}
          disabled={state !== 'idle'}
        />
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 px-3 sm:px-4 md:px-6 py-2 sm:py-4">
        {/* Avatar section */}
        <div className="relative mb-2 sm:mb-3 md:mb-4 shrink-0 w-full max-w-[180px] sm:max-w-[240px] md:max-w-[300px] lg:max-w-[360px] xl:max-w-[400px] aspect-square">
          {/* Glow effect behind avatar */}
          <div
            className={`
              absolute inset-0 rounded-full blur-2xl sm:blur-3xl transition-all duration-500
              ${state === 'listening' ? 'bg-green-500/30' : ''}
              ${state === 'processing' ? 'bg-yellow-500/30' : ''}
              ${state === 'speaking' ? 'bg-rose-500/30' : ''}
              ${state === 'idle' ? 'bg-red-500/20' : ''}
            `}
          />

          <AvatarCanvas state={state} className="relative z-10 w-full h-full" />
        </div>

        {/* Response/Chat bubble */}
        <div className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl mb-2 sm:mb-3 md:mb-4 flex-1 min-h-0 flex flex-col justify-center">
          {response && !messages.length ? (
            <div className="text-center px-2 sm:px-4">
              <p className="text-white/90 text-sm sm:text-base md:text-lg leading-relaxed bg-white/5 backdrop-blur-md rounded-xl sm:rounded-2xl px-4 sm:px-5 md:px-6 py-3 sm:py-4 border border-white/10">
                {response}
              </p>
            </div>
          ) : messages.length > 0 ? (
            <ChatBubble messages={messages} currentResponse={response} className="h-full" />
          ) : (
            <div className="text-center px-2 sm:px-4">
              <p className="text-white/50 text-xs sm:text-sm md:text-base leading-relaxed">
                Tekan tombol mikrofon dan ajukan pertanyaan seputar PT Utero Kreatif Indonesia
              </p>
            </div>
          )}
        </div>

        {/* Voice control */}
        <div className="shrink-0 mb-2 sm:mb-3 md:mb-4">
          <VoiceControl
            state={state}
            onStart={startListening}
            onStop={handleStopInteraction}
            onStopSpeaking={stopSpeaking}
            isSupported={isSupported}
            transcript={transcript}
            networkError={networkError}
          />
        </div>

        {/* Greet button */}
        {state === 'idle' && !messages.length && (
          <div className="shrink-0 mb-2 sm:mb-3 md:mb-4">
            <button
              onClick={greet}
              className="px-4 sm:px-5 md:px-6 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 rounded-full text-white/80 text-xs sm:text-sm transition-all duration-300 border border-white/20"
            >
              Sapa Saya
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-2 sm:py-3 md:py-4 shrink-0">
        <p className="text-white/30 text-[10px] sm:text-xs md:text-sm px-4">
         © 2026  PT Utero Kreatif Indonesia X POLINEMA DEV
        </p>
      </footer>
    </div>
  );
}
