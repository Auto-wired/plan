import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

function getSpeechErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '마이크 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.'
    case 'no-speech':
      return '음성이 감지되지 않았습니다.'
    case 'network':
      return '네트워크 오류로 음성 인식에 실패했습니다.'
    case 'audio-capture':
      return '마이크를 사용할 수 없습니다. 연결 상태를 확인해 주세요.'
    default:
      return `음성 인식 오류: ${error}`
  }
}

export type SpeechStatus = 'idle' | 'listening' | 'processing' | 'unsupported'

export function useSpeechRecognition(onFinalResult: (text: string) => void) {
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const onFinalResultRef = useRef(onFinalResult)

  useEffect(() => {
    onFinalResultRef.current = onFinalResult
  }, [onFinalResult])

  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    if (!isSupported) {
      setStatus('unsupported')
      return
    }

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onstart = () => {
      setStatus('listening')
      setError(null)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      setInterimTranscript(interim)
      if (final) {
        setTranscript(final)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(getSpeechErrorMessage(event.error))
      setStatus('idle')
    }

    recognition.onend = () => {
      setStatus((current) => {
        if (current === 'listening') {
          return 'processing'
        }
        return current
      })
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
    }
  }, [isSupported])

  useEffect(() => {
    if (status === 'processing' && transcript.trim()) {
      onFinalResultRef.current(transcript.trim())
      setTranscript('')
      setInterimTranscript('')
      setStatus('idle')
    }
  }, [status, transcript])

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    try {
      recognitionRef.current.start()
    } catch {
      recognitionRef.current.stop()
      recognitionRef.current.start()
    }
  }, [isSupported])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  return {
    isSupported,
    status,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
  }
}
