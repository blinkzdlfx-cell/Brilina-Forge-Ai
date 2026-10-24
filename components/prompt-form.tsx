"use client"

import * as React from "react"
import { ArrowUpIcon, ImagePlusIcon, MicIcon, SquareIcon, XIcon, RotateCcwIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

const MAX_RECORDING_BYTES = 20 * 1024 * 1024
const MAX_RECORDING_MS = 10 * 60 * 1000
const AUTO_STOP_MARGIN_MS = 1000
const TRANSCRIPTION_TIMEOUT_MS = 45_000
const MAX_IMAGE_COUNT = 3
const MAX_IMAGE_FILE_BYTES = 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

type VoiceState = "idle" | "recording" | "stopped" | "transcribing" | "failed"
type TranscriptionIntent = "insert" | "send"

function getRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return ""
  const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function getAudioExtension(type: string) {
  const mimeType = type.split(";")[0].toLowerCase()
  if (mimeType === "audio/mp4") return "mp4"
  if (mimeType === "audio/ogg") return "ogg"
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav"
  if (mimeType === "audio/mpeg" || mimeType === "audio/mpga") return "mp3"
  if (mimeType === "audio/flac") return "flac"
  return "webm"
}

function WaveformRing({ level }: { level: number }) {
  return (
    <span className="relative inline-flex size-8 items-center justify-center" aria-hidden="true">
      <span
        className="absolute inset-0 rounded-full border border-current opacity-60 transition-transform duration-75"
        style={{ transform: `scale(${1 + level * 0.45})` }}
      />
      <span
        className="absolute inset-1 rounded-full border-2 border-current opacity-80 transition-transform duration-75"
        style={{ transform: `scale(${1 + level * 0.25})` }}
      />
      <MicIcon className="relative size-4" />
    </span>
  )
}

export function PromptForm({
  isBusy,
  onSubmit,
  onStop,
  onComposerFocus,
  canAttachImages,
  maxImages,
}: {
  isBusy: boolean
  onSubmit: (text: string, files?: File[]) => void
  onStop: () => void
  canAttachImages: boolean
  maxImages: number
  onComposerFocus: () => void
}) {
  const maxSelectableImages = Math.min(MAX_IMAGE_COUNT, maxImages)
  const [input, setInput] = React.useState("")
  const [selectedImages, setSelectedImages] = React.useState<File[]>([])
  const [imageError, setImageError] = React.useState("")
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const [hasAudio, setHasAudio] = React.useState(false)
  const inputRef = React.useRef("")
  const [voiceState, setVoiceState] = React.useState<VoiceState>("idle")
  const [voiceError, setVoiceError] = React.useState("")
  const [voiceNotice, setVoiceNotice] = React.useState("")
  const [waveformLevel, setWaveformLevel] = React.useState(0)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const recordingSessionRef = React.useRef<string | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const audioBlobRef = React.useRef<Blob | null>(null)
  const intentRef = React.useRef<TranscriptionIntent>("insert")
  const abortRef = React.useRef<AbortController | null>(null)
  const audioContextRef = React.useRef<AudioContext | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = React.useRef(false)
  const maxLengthReachedRef = React.useRef(false)

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto"
    const maxHeight = 160
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"
  }

  function appendTranscript(transcript: string) {
    const textarea = textareaRef.current
    const current = inputRef.current
    const separator = current.trim()
      ? current.endsWith(" ") || current.endsWith("\n") ? "" : " "
      : ""
    const next = `${current}${separator}${transcript}`
    inputRef.current = next
    setInput(next)
    requestAnimationFrame(() => {
      if (textarea) resizeTextarea(textarea)
      textarea?.focus()
    })
  }

  function stopVisualizers() {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    recordingTimerRef.current = null
    setWaveformLevel(0)
  }

  function stopMicrophone() {
    stopVisualizers()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
  }

  function startWaveform(stream: MediaStream) {
    try {
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      const samples = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(samples)
        let total = 0
        for (const sample of samples) {
          const normalized = (sample - 128) / 128
          total += normalized * normalized
        }
        setWaveformLevel(Math.min(1, Math.sqrt(total / samples.length) * 3.5))
        animationFrameRef.current = requestAnimationFrame(tick)
      }
      void context.resume().then(tick).catch(() => undefined)
    } catch {
      // Recording still works if the browser does not support Web Audio.
    }
  }

  async function transcribeRecording(blob: Blob, intent: TranscriptionIntent) {
    if (cancelledRef.current) return
    if (!blob.size) {
      setVoiceError("No audio was captured. Try recording again.")
      setVoiceState("failed")
      return
    }
    if (blob.size > MAX_RECORDING_BYTES) {
      setVoiceError("This recording is too large. Please record a shorter message.")
      setVoiceState("failed")
      return
    }

    setVoiceState("transcribing")
    setVoiceError("")
    const controller = new AbortController()
    abortRef.current = controller
    timeoutRef.current = setTimeout(() => controller.abort("timeout"), TRANSCRIPTION_TIMEOUT_MS)

    try {
      const sessionId = recordingSessionRef.current
      if (!sessionId) throw new Error("Recording session expired. Record a new message.")
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "X-Recording-Session": sessionId,
          "Content-Type": blob.type || "application/octet-stream",
          "X-Audio-Filename": `recording.${getAudioExtension(blob.type || "audio/webm")}`,
        },
        body: blob,
        signal: controller.signal,
      })
      const result = (await response.json().catch(() => null)) as
        | { text?: unknown; error?: unknown }
        | null

      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : "Transcription failed. Please try again.")
      }
      if (typeof result?.text !== "string" || !result.text.trim()) {
        throw new Error("Didn't catch anything. Try speaking more clearly.")
      }

      const transcript = result.text.trim()
      if (maxLengthReachedRef.current) {
        setVoiceNotice("Maximum recording length is 10 minutes. Your recording has been transcribed.")
        maxLengthReachedRef.current = false
      }
      audioBlobRef.current = null
      recordingSessionRef.current = null
      setHasAudio(false)
      setVoiceState("idle")
      if (intent === "send") {
        const currentInput = inputRef.current.trim()
        const combined = [currentInput, transcript].filter(Boolean).join(currentInput ? " " : "")
        onSubmit(combined || "Please analyze the attached image(s) and describe what is important.", selectedImages)
        setSelectedImages([])
        setImageError("")
        inputRef.current = ""
        setInput("")
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto"
          textareaRef.current.style.overflowY = "hidden"
        }
      } else {
        appendTranscript(transcript)
      }
    } catch (error) {
      if (cancelledRef.current) return
      setVoiceState("failed")
      setVoiceError(
        controller.signal.aborted
          ? "Transcription timed out or was cancelled. Retry the audio."
          : error instanceof Error ? error.message : "Transcription failed. Please try again."
      )
    } finally {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      abortRef.current = null
    }
  }

  function finalizeRecording(intent: TranscriptionIntent) {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === "inactive") return
    intentRef.current = intent
    setVoiceState("stopped")
    recorder.stop()
  }

  async function startRecording() {
    if (isBusy || voiceState === "transcribing" || voiceState === "recording") return
    intentRef.current = "insert"
    recordingSessionRef.current = null
    setVoiceError("")
    setVoiceNotice("")
    maxLengthReachedRef.current = false
    cancelledRef.current = false
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setVoiceError("Audio recording is not supported by this browser. Try a recent version of Chrome or Safari.")
      return
    }

    try {
      // Create and resume the audio context directly from the microphone tap,
      // before the permission prompt can consume the browser's user activation.
      const context = new AudioContext()
      audioContextRef.current = context
      await context.resume()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      chunksRef.current = []
      const sessionResponse = await fetch("/api/transcribe/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      const sessionResult = await sessionResponse.json().catch(() => null) as
        | { sessionId?: unknown; error?: unknown }
        | null
      if (!sessionResponse.ok || typeof sessionResult?.sessionId !== "string") {
        throw new Error(typeof sessionResult?.error === "string" ? sessionResult.error : "Could not start a secure recording session.")
      }
      recordingSessionRef.current = sessionResult.sessionId
      const mimeType = getRecordingMimeType()
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 }
      )
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stopMicrophone()
        recorderRef.current = null
        setVoiceState("failed")
        setVoiceError("Recording failed. Check microphone permissions and try again.")
      }
      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        })
        chunksRef.current = []
        recorderRef.current = null
        stopMicrophone()
        if (cancelledRef.current) return
        audioBlobRef.current = audioBlob
        setHasAudio(true)
        const sessionId = recordingSessionRef.current
        if (!sessionId) {
          setVoiceState("failed")
          setVoiceError("Recording session expired. Record a new message.")
          return
        }
        void (async () => {
          try {
            const finishResponse = await fetch("/api/transcribe/session", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "finish", sessionId }),
            })
            const finishResult = await finishResponse.json().catch(() => null) as
              | { error?: unknown }
              | null
            if (!finishResponse.ok) {
              throw new Error(typeof finishResult?.error === "string" ? finishResult.error : "The recording exceeded the allowed duration.")
            }
            await transcribeRecording(audioBlob, intentRef.current)
          } catch (error) {
            setVoiceState("failed")
            setVoiceError(error instanceof Error ? error.message : "Could not finalize the recording.")
          }
        })()
      }
      recorder.start(1000)
      setVoiceState("recording")
      startWaveform(stream)
      const startedAt = Date.now()
      // Stop slightly before the server deadline so finalization reaches the
      // server within the 10-minute window. No timer is rendered in the UI.
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt
        if (elapsed >= MAX_RECORDING_MS - AUTO_STOP_MARGIN_MS) {
          maxLengthReachedRef.current = true
          finalizeRecording("insert")
        }
      }, 100)
    } catch (error) {
      stopMicrophone()
      setVoiceState("idle")
      setVoiceError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access in your browser and try again."
          : error instanceof Error && /recording session|transcription is temporarily disabled|authentication/i.test(error.message)
            ? error.message
            : "Could not start the microphone. Check your browser permissions and try again."
      )
    }
  }

  function cancelVoice() {
    cancelledRef.current = true
    maxLengthReachedRef.current = false
    const sessionId = recordingSessionRef.current
    if (sessionId) {
      void fetch("/api/transcribe/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", sessionId }),
      }).catch(() => undefined)
    }
    recordingSessionRef.current = null
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    abortRef.current?.abort()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null
      recorder.stop()
    }
    stopMicrophone()
    recorderRef.current = null
    chunksRef.current = []
    audioBlobRef.current = null
    setHasAudio(false)
    setVoiceState("idle")
    setVoiceError("")
  }

  function retryTranscription() {
    const blob = audioBlobRef.current
    if (!blob) {
      setVoiceState("idle")
      setVoiceError("The audio is no longer available. Record a new message.")
      return
    }
    cancelledRef.current = false
    void transcribeRecording(blob, intentRef.current)
  }

  React.useEffect(() => {
    return () => {
      cancelledRef.current = true
      abortRef.current?.abort()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null
        recorder.stop()
      }
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      void audioContextRef.current?.close().catch(() => undefined)
      audioContextRef.current = null
    }
  }, [])

  function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ""
    if (!incoming.length) return

    const combined = [...selectedImages, ...incoming]
    if (combined.length > maxSelectableImages) {
      setImageError(`Attach up to ${maxSelectableImages} image(s) per message.`)
      return
    }
    if (combined.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type))) {
      setImageError("Use PNG, JPEG, or WebP images only.")
      return
    }
    if (combined.some((file) => file.size > MAX_IMAGE_FILE_BYTES)) {
      setImageError("Each image must be 1 MiB or smaller.")
      return
    }
    if (combined.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
      setImageError("All attached images must total 3 MiB or less.")
      return
    }

    setSelectedImages(combined)
    setImageError("")
  }

  function removeSelectedImage(index: number) {
    setSelectedImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
    setImageError("")
  }

  const imagePreviews = React.useMemo(
    () => selectedImages.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedImages]
  )

  React.useEffect(() => {
    return () => imagePreviews.forEach(({ url }) => URL.revokeObjectURL(url))
  }, [imagePreviews])

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault()
    if (voiceState === "recording") {
      finalizeRecording("send")
      return
    }
    if (voiceState === "failed" && audioBlobRef.current) {
      intentRef.current = "send"
      retryTranscription()
      return
    }
    const text = inputRef.current.trim()
    if ((!text && selectedImages.length === 0) || isBusy || voiceState === "transcribing" || voiceState === "stopped") return
    onSubmit(text || "Please analyze the attached image(s) and describe what is important.", selectedImages)
    setSelectedImages([])
    setImageError("")
    inputRef.current = ""
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.overflowY = "hidden"
    }
  }

  const isVoiceActive = voiceState !== "idle"
  const isRecording = voiceState === "recording"
  const isTranscribing = voiceState === "transcribing"

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {imagePreviews.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" aria-label="Attached images">
          {imagePreviews.map(({ file, url }, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="relative size-16 overflow-hidden rounded-lg border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file.name} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-foreground shadow"
                onClick={() => removeSelectedImage(index)}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <InputGroup>
        <InputGroupTextarea
          ref={textareaRef}
          placeholder="Send a message…"
          className="max-h-40 min-h-11 overflow-y-hidden p-3.5"
          value={input}
          onChange={(event) => {
            inputRef.current = event.target.value
            setInput(event.target.value)
            resizeTextarea(event.currentTarget)
          }}
          onFocus={() => onComposerFocus()}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing || event.shiftKey) return
            const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches
            const isNarrowViewport = window.innerWidth <= 768
            if (isTouchDevice || isNarrowViewport) return
            event.preventDefault()
            handleSubmit()
          }}
        />
        <InputGroupAddon align="block-end">
          {voiceNotice && !voiceError && !imageError && (
            <span role="status" className="max-w-64 text-xs text-muted-foreground">
              {voiceNotice}
            </span>
          )}
          {(voiceError || imageError) && (
            <span role="status" className="max-w-64 text-xs text-destructive">
              {imageError || voiceError}
            </span>
          )}
          <div className="flex w-full min-w-0 items-center gap-1.5">
            {canAttachImages && (
              <>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleImageSelection}
                />
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Attach images"
                  title={`Attach images (PNG, JPEG, WebP; up to ${maxSelectableImages})`}
                  disabled={isBusy}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImagePlusIcon />
                </InputGroupButton>
              </>
            )}
            {isVoiceActive ? (
              <>
                {isRecording ? <WaveformRing level={waveformLevel} /> : null}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {isRecording
                    ? "Listening…"
                    : voiceState === "stopped"
                      ? "Transcribing…"
                      : isTranscribing
                        ? "Transcribing…"
                        : voiceState === "failed"
                          ? "Couldn't transcribe. Tap to retry."
                          : "Audio ready"}
                </span>
                {voiceState === "failed" && (
                  <InputGroupButton type="button" size="icon-sm" variant="outline" aria-label="Retry transcription" onClick={retryTranscription}>
                    <RotateCcwIcon />
                  </InputGroupButton>
                )}
                <InputGroupButton type="button" size="icon-sm" variant="ghost" className="shrink-0" aria-label="Cancel audio" title="Cancel audio" onClick={cancelVoice}>
                  <XIcon />
                </InputGroupButton>
                {isRecording && (
                  <InputGroupButton type="button" size="icon-sm" variant="outline" className="shrink-0" aria-label="Stop and transcribe without sending" title="Stop and transcribe" onClick={() => finalizeRecording("insert")}>
                    <SquareIcon />
                  </InputGroupButton>
                )}
              </>
            ) : (
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Record voice message"
                title="Record voice message"
                disabled={isBusy}
                onClick={() => void startRecording()}
              >
                <MicIcon />
              </InputGroupButton>
            )}
            {isBusy ? (
              <InputGroupButton type="button" size="icon-sm" variant="outline" aria-label="Stop generating" className="ml-auto" onClick={onStop}>
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                aria-label={isRecording ? "Send audio and transcribe" : isTranscribing ? "Transcribing audio" : "Send message"}
                className="ml-auto"
                disabled={isTranscribing || voiceState === "stopped" || (!input.trim() && selectedImages.length === 0 && !isRecording && !(voiceState === "failed" && hasAudio))}
              >
                {isRecording ? <ArrowUpIcon /> : isTranscribing ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUpIcon />}
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
