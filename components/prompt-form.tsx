"use client"

import * as React from "react"
import { ArrowUpIcon, MicIcon, SquareIcon, XIcon } from "lucide-react"

import { type GatewayModel } from "@/lib/models"
import { ModelSelect } from "@/components/model-select"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

const MAX_RECORDING_BYTES = 20 * 1024 * 1024

function getRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return ""
  const preferredTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

export function PromptForm({
  models,
  model,
  onModelChange,
  isBusy,
  onSubmit,
  onStop,
  onComposerFocus,
}: {
  models: GatewayModel[]
  model: string
  onModelChange: (model: string) => void
  isBusy: boolean
  onSubmit: (text: string) => void
  onStop: () => void
  onComposerFocus: () => void
}) {
  const [input, setInput] = React.useState("")
  const [isRecording, setIsRecording] = React.useState(false)
  const [isTranscribing, setIsTranscribing] = React.useState(false)
  const [voiceError, setVoiceError] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto"
    const maxHeight = 160
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"
  }

  function appendTranscript(transcript: string) {
    const textarea = textareaRef.current
    setInput((current) => {
      const separator = current.trim() ? (current.endsWith(" ") || current.endsWith("\n") ? "" : " ") : ""
      return `${current}${separator}${transcript}`
    })
    requestAnimationFrame(() => {
      if (textarea) resizeTextarea(textarea)
      textarea?.focus()
    })
  }

  async function transcribeRecording(blob: Blob) {
    if (!blob.size) {
      setVoiceError("No audio was captured. Try recording again.")
      return
    }
    if (blob.size > MAX_RECORDING_BYTES) {
      setVoiceError("This recording is too large. Please record a shorter message.")
      return
    }

    setIsTranscribing(true)
    setVoiceError("")
    try {
      const formData = new FormData()
      const mimeType = blob.type.split(";")[0] || "audio/webm"
      const extension = mimeType === "audio/mp4" ? "mp4"
        : mimeType === "audio/ogg" ? "ogg"
        : mimeType === "audio/wav" || mimeType === "audio/x-wav" ? "wav"
        : mimeType === "audio/mpeg" || mimeType === "audio/mpga" ? "mp3"
        : mimeType === "audio/flac" ? "flac"
        : "webm"
      formData.append("file", blob, `recording.${extension}`)

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      })
      const result = (await response.json().catch(() => null)) as
        | { text?: unknown; error?: unknown }
        | null

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "Transcription failed. Please try again."
        )
      }
      if (typeof result?.text !== "string" || !result.text.trim()) {
        throw new Error("No speech was detected. Try speaking more clearly.")
      }
      appendTranscript(result.text.trim())
    } catch (error) {
      setVoiceError(
        error instanceof Error
          ? error.message
          : "Transcription failed. Please try again."
      )
    } finally {
      setIsTranscribing(false)
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") recorder.stop()
    setIsRecording(false)
  }

  async function toggleRecording() {
    if (isRecording) {
      stopRecording()
      return
    }
    if (isBusy || isTranscribing) return
    setVoiceError("")

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setVoiceError("Audio recording is not supported by this browser. Try a recent version of Chrome or Safari.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = getRecordingMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setVoiceError("Recording failed. Check microphone permissions and try again.")
        setIsRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        chunksRef.current = []
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        void transcribeRecording(audioBlob)
      }
      recorder.start()
      setIsRecording(true)
    } catch (error) {
      setVoiceError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access in your browser and try again."
          : "Could not start the microphone. Check your browser permissions and try again."
      )
    }
  }

  React.useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== "inactive") recorder.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault()
    const text = input.trim()
    if (!text || isBusy || isTranscribing || isRecording) return
    onSubmit(text)
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.overflowY = "hidden"
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <InputGroup>
        <InputGroupTextarea
          ref={textareaRef}
          placeholder="Send a message…"
          className="max-h-40 min-h-11 overflow-y-hidden p-3.5"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            resizeTextarea(event.currentTarget)
          }}
          onFocus={() => {
            onComposerFocus()
            // The chat shell follows VisualViewport resize events when the
            // mobile keyboard opens. Avoid scrollIntoView here: it can scroll
            // the document behind the keyboard and hide the send controls.
          }}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.nativeEvent.isComposing ||
              event.shiftKey
            ) {
              return
            }

            const isTouchDevice = window.matchMedia(
              "(hover: none) and (pointer: coarse)"
            ).matches
            const isNarrowViewport = window.innerWidth <= 768

            // Mobile keyboards use Enter/Return for a newline. Only the Send
            // button submits on touch devices; desktop Enter submits normally.
            if (isTouchDevice || isNarrowViewport) return

            event.preventDefault()
            handleSubmit()
          }}
        />
        <InputGroupAddon align="block-end">
          <ModelSelect
            models={models}
            value={model}
            onValueChange={onModelChange}
          />
          {voiceError && (
            <span role="status" className="max-w-48 text-xs text-destructive">
              {voiceError}
            </span>
          )}
          <InputGroupButton
            type="button"
            size="icon-sm"
            variant={isRecording ? "destructive" : "outline"}
            className={isRecording ? "ml-auto" : ""}
            aria-label={
              isRecording
                ? "Stop recording"
                : isTranscribing
                  ? "Transcribing audio"
                  : "Record voice message"
            }
            title={
              isRecording
                ? "Stop recording"
                : isTranscribing
                  ? "Transcribing…"
                  : "Record voice message"
            }
            disabled={isBusy || isTranscribing}
            onClick={() => void toggleRecording()}
          >
            {isRecording ? (
              <SquareIcon />
            ) : isTranscribing ? (
              <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <MicIcon />
            )}
          </InputGroupButton>
          {isBusy ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Stop generating"
              className="ml-auto"
              onClick={onStop}
            >
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              aria-label="Send message"
              className="ml-auto"
              disabled={!input.trim() || isTranscribing || isRecording}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      {isRecording && (
        <div className="mt-2 flex items-center gap-2 px-2 text-xs text-muted-foreground" role="status">
          <span className="size-2 animate-pulse rounded-full bg-destructive" />
          Recording. Select stop when you are finished.
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-muted"
            onClick={() => {
              if (recorderRef.current && recorderRef.current.state !== "inactive") {
                recorderRef.current.onstop = null
                recorderRef.current.stop()
              }
              streamRef.current?.getTracks().forEach((track) => track.stop())
              recorderRef.current = null
              streamRef.current = null
              chunksRef.current = []
              setIsRecording(false)
            }}
          >
            <XIcon className="size-3" />
            Cancel
          </button>
        </div>
      )}
    </form>
  )
}
