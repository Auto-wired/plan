import { useEffect } from 'react'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { useToast } from '../../contexts/ToastContext'
import './VoiceButton.css'

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  )
}

function LoadingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="voice-loading-icon">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const { showToast } = useToast()
  const {
    isSupported,
    status,
    interimTranscript,
    error,
    startListening,
    stopListening,
  } = useSpeechRecognition(onTranscript)

  useEffect(() => {
    if (!error) return
    showToast(error, { variant: 'error' })
  }, [error, showToast])

  if (!isSupported) {
    return (
      <span className="voice-unsupported" title="이 브라우저는 음성 입력을 지원하지 않습니다">
        <MicIcon />
      </span>
    )
  }

  const isListening = status === 'listening'
  const isProcessing = status === 'processing'

  const handleClick = () => {
    if (disabled || isProcessing) return
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  return (
    <div className="voice-button-wrapper">
      <button
        type="button"
        className={`voice-button ${isListening ? 'voice-button--listening' : ''}`}
        onClick={handleClick}
        disabled={disabled || isProcessing}
        title={isListening ? '음성 입력 중지' : '음성 입력 시작'}
        aria-label={isListening ? '음성 입력 중지' : '음성 입력 시작'}
      >
        {isProcessing ? <LoadingIcon /> : isListening ? <StopIcon /> : <MicIcon />}
      </button>
      {(isListening || interimTranscript) && (
        <div className="voice-transcript">
          {interimTranscript || '듣고 있습니다...'}
        </div>
      )}
    </div>
  )
}
