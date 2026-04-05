// Web Speech Recognition — Browser-native STT wrapper
// Uses the Web Speech API (SpeechRecognition / webkitSpeechRecognition)
// Works in Chrome, Edge, Safari (partial). No Firefox support.

// Common misheard words → correct spelling
const POST_CORRECTIONS: [RegExp, string][] = [
  [/\bwell bloom\b/gi, 'Wellbloom'],
  [/\bwell\.bloom\b/gi, 'Wellbloom'],
  [/\bjournal coach\b/gi, 'JournalCoach'],
  [/\bbodhi\b/g, 'Bodhi'],
  [/\bikigai\b/g, 'Ikigai'],
  [/\bdispenza\b/g, 'Dispenza'],
  [/\bpennebaker\b/g, 'Pennebaker'],
];

/**
 * Apply post-processing corrections to a transcript.
 */
export function correctTranscript(text: string): string {
  let result = text;
  for (const [pattern, replacement] of POST_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Check if the Web Speech API is available in this browser.
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );
}

/**
 * Request microphone permission.
 */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately — we just needed permission
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

type SpeechRecognitionType = typeof SpeechRecognition;

function getSpeechRecognitionConstructor(): SpeechRecognitionType | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as SpeechRecognitionType | null;
}

export interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

let activeRecognition: SpeechRecognition | null = null;

/**
 * Start listening for speech.
 * Returns a cleanup function to stop listening.
 */
export function startListening(options: SpeechRecognitionOptions): (() => void) | null {
  const SpeechRecognitionClass = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionClass) {
    options.onError?.('Speech recognition is not supported in this browser.');
    return null;
  }

  // Stop any existing recognition
  if (activeRecognition) {
    try { activeRecognition.abort(); } catch {}
    activeRecognition = null;
  }

  const recognition = new SpeechRecognitionClass();
  recognition.lang = options.language ?? 'en-US';
  recognition.continuous = options.continuous ?? true;
  recognition.interimResults = true;

  let finalTranscript = '';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + ' ';
        options.onResult?.(correctTranscript(finalTranscript.trim()), true);
      } else {
        interim += result[0].transcript;
        options.onResult?.(correctTranscript(finalTranscript + interim), false);
      }
    }
  };

  recognition.onend = () => {
    // Auto-restart if continuous mode and not manually stopped
    if (options.continuous && activeRecognition === recognition) {
      try {
        recognition.start();
        return;
      } catch {
        // Fall through to onEnd
      }
    }
    activeRecognition = null;
    options.onEnd?.();
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    // 'no-speech' and 'aborted' are not real errors
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    if (event.error === 'not-allowed') {
      options.onError?.('Microphone access denied. Please allow microphone access in your browser settings.');
      return;
    }
    options.onError?.(event.error);
  };

  try {
    recognition.start();
    activeRecognition = recognition;
  } catch (err) {
    options.onError?.('Failed to start speech recognition.');
    return null;
  }

  return () => {
    if (activeRecognition === recognition) {
      activeRecognition = null;
    }
    try { recognition.stop(); } catch {}
  };
}

/**
 * Stop the currently active recognition session.
 */
export function stopListening() {
  if (activeRecognition) {
    const ref = activeRecognition;
    activeRecognition = null;
    try { ref.stop(); } catch {}
  }
}
