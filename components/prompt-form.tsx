"use client"

import * as React from "react"
import { ArrowUpIcon, FileTextIcon, ImageIcon, MicIcon, PlusIcon, SquareIcon, XIcon, RotateCcwIcon } from "lucide-react"
import { uploadPrivateFile } from "@/lib/direct-upload"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

const MAX_RECORDING_BYTES = 20 * 1024 * 1024
const MAX_RECORDING_MS = 10 * 60 * 1000
const AUTO_STOP_MARGIN_MS = 1000
// Must exceed the server-side provider timeout (120 s); otherwise the browser gives up
// on a request the server later completes, and the retry finds the audio already consumed.
const TRANSCRIPTION_TIMEOUT_MS = 125_000
const MAX_IMAGE_COUNT = 3
const MAX_ATTACHMENT_COUNT = 5
const MAX_IMAGE_FILE_BYTES = 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])
const ALLOWED_DOCUMENT_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown", "text/csv", "text/html", "application/json", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"])

async function readDocxPreview(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let endRecord = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { endRecord = i; break }
  }
  if (endRecord < 0) throw new Error("This DOCX file could not be previewed.")
  const entries = view.getUint16(endRecord + 10, true)
  const centralOffset = view.getUint32(endRecord + 16, true)
  if (entries > 2048 || centralOffset >= bytes.length) throw new Error("This DOCX file is too complex to preview.")
  let cursor = centralOffset
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("This DOCX file could not be previewed.")
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    if (name === "word/document.xml") {
      if (uncompressedSize > 5 * 1024 * 1024 || compressedSize > bytes.length || localOffset + 30 > bytes.length) throw new Error("This DOCX file is too large to preview.")
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("This DOCX file could not be previewed.")
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const start = localOffset + 30 + localNameLength + localExtraLength
      const compressed = bytes.slice(start, start + compressedSize)
      if (start + compressedSize > bytes.length) throw new Error("This DOCX file could not be previewed.")
      let xmlBytes: ArrayBuffer
      if (method === 0) {
        xmlBytes = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer
      } else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const stream = new Blob([compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer]).stream()
          .pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat))
        xmlBytes = await new Response(stream).arrayBuffer()
      } else {
        throw new Error("DOCX preview is not supported by this browser. The file can still be sent to the AI.")
      }
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes)
      return xml.replace(/<w:tab\b[^>]*\/>/g, "\t").replace(/<w:br\b[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&amp;/g, "&").slice(0, 80_000)
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  throw new Error("No document text was found in this DOCX file.")
}

function normalizeAttachment(file: File) {
  if (file.type) return file
  const ext = file.name.toLowerCase().split(".").pop()
  const type = ext === "md" ? "text/markdown" : ext === "txt" ? "text/plain" : ext === "csv" ? "text/csv" : ext === "html" || ext === "htm" ? "text/html" : ext === "json" ? "application/json" : ext === "pdf" ? "application/pdf" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ""
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file
}

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

// A pulsing ring that follows the microphone level, drawn around its child
// (the stop button). The rings are decorative; the button keeps its own label.
function WaveformRing({ level, children }: { level: number; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex size-10 shrink-0 items-center justify-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full border border-current opacity-50 transition-transform duration-75 motion-reduce:transition-none"
        style={{ transform: `scale(${1 + level * 0.3})` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-1 rounded-full border-2 border-current opacity-70 transition-transform duration-75 motion-reduce:transition-none"
        style={{ transform: `scale(${1 + level * 0.18})` }}
      />
      <span className="relative">{children}</span>
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
  isPreparingAttachments = false,
}: {
  isBusy: boolean
  onSubmit: (text: string, files?: File[], runInBackground?: boolean) => Promise<boolean> | boolean
  onStop: () => void
  canAttachImages: boolean
  maxImages: number
  isPreparingAttachments?: boolean
  onComposerFocus: () => void
}) {
  const maxSelectableImages = Math.min(MAX_IMAGE_COUNT, maxImages)
  void canAttachImages // Documents remain attachable even when the selected text model cannot accept images directly.
  const [input, setInput] = React.useState("")
  const [selectedImages, setSelectedImages] = React.useState<File[]>([])
  const [previewFile, setPreviewFile] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState("")
  const [previewText, setPreviewText] = React.useState("")
  const [previewError, setPreviewError] = React.useState("")
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [runInBackground, setRunInBackground] = React.useState(false)
  const attachmentMenuRef = React.useRef<HTMLDivElement>(null)
  const [imageError, setImageError] = React.useState("")
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const documentInputRef = React.useRef<HTMLInputElement>(null)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = React.useState(false)
  React.useEffect(() => {
    if (!attachmentMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !attachmentMenuRef.current?.contains(event.target)) setAttachmentMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setAttachmentMenuOpen(false) }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [attachmentMenuOpen])

  React.useEffect(() => {
    if (!previewFile) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewFile(null) }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [previewFile])

  React.useEffect(() => {
    if (!previewFile) return
    const url = URL.createObjectURL(previewFile)
    let active = true
    let temporaryFileId: string | null = null
    const frame = requestAnimationFrame(() => { if (active) setPreviewUrl(url) })
    const isImage = previewFile.type.startsWith("image/")
    const isPdf = previewFile.type === "application/pdf"
    if (!isImage && !isPdf) {
      const loadText = async () => {
        if (previewFile.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return previewFile.text()
        try {
          return await readDocxPreview(previewFile)
        } catch {
          // Older mobile browsers may not support raw-DEFLATE in DecompressionStream.
          // Fall back to the existing authenticated server-side DOCX extractor.
          const uploaded = await uploadPrivateFile(previewFile, null, "file")
          temporaryFileId = uploaded.id
          if (!active) {
            await fetch("/api/files/" + encodeURIComponent(uploaded.id), { method: "DELETE" }).catch(() => undefined)
            temporaryFileId = null
            return ""
          }
          const response = await fetch("/api/files/" + encodeURIComponent(uploaded.id) + "/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "extract", prompt: "Extract the document text for preview." }),
          })
          const result = await response.json().catch(() => null) as { text?: string; error?: string } | null
          if (!response.ok || typeof result?.text !== "string") throw new Error(result?.error ?? "Could not preview this DOCX file.")
          return result.text
        }
      }
      void loadText().then((value) => { if (active) setPreviewText(value) })
        .catch((error) => { if (active) setPreviewError(error instanceof Error ? error.message : "Could not preview this document.") })
        .finally(() => { if (active) setPreviewLoading(false) })
    }
    return () => {
      active = false
      cancelAnimationFrame(frame)
      URL.revokeObjectURL(url)
      if (temporaryFileId) void fetch("/api/files/" + encodeURIComponent(temporaryFileId), { method: "DELETE" }).catch(() => undefined)
    }
  }, [previewFile])
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
  const audioFileIdRef = React.useRef<string | null>(null)
  const intentRef = React.useRef<TranscriptionIntent>("insert")
  const abortRef = React.useRef<AbortController | null>(null)
  const audioContextRef = React.useRef<AudioContext | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = React.useRef(false)
  const maxLengthReachedRef = React.useRef(false)
  // Recording callbacks outlive the render that started them. Read the latest
  // submit handler and attachments through refs instead of stale closures.
  const onSubmitRef = React.useRef(onSubmit)
  const selectedImagesRef = React.useRef(selectedImages)
  React.useLayoutEffect(() => {
    onSubmitRef.current = onSubmit
    selectedImagesRef.current = selectedImages
  })

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
      let audioFileId = audioFileIdRef.current
      if (!audioFileId) {
        const mimeType = (blob.type || "audio/webm").split(";")[0].toLowerCase()
        const audioFile = new File([blob], `recording.${getAudioExtension(mimeType)}`, { type: mimeType })
        const uploadedAudio = await uploadPrivateFile(audioFile, null, "audio")
        audioFileId = uploadedAudio.id
        audioFileIdRef.current = audioFileId
      }
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "X-Recording-Session": sessionId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileId: audioFileId }),
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
      audioFileIdRef.current = null
      recordingSessionRef.current = null
      setHasAudio(false)
      setVoiceState("idle")
      if (intent === "send") {
        const currentInput = inputRef.current.trim()
        const combined = [currentInput, transcript].filter(Boolean).join(currentInput ? " " : "")
        const succeeded = await onSubmitRef.current(combined, selectedImagesRef.current, false)
        if (succeeded) {
          setSelectedImages([])
          setImageError("")
          inputRef.current = ""
          setInput("")
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto"
            textareaRef.current.style.overflowY = "hidden"
          }
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
    if (voiceState === "transcribing" || voiceState === "recording") return
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
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
        mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : { audioBitsPerSecond: 96_000 }
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
    const uploadedAudioId = audioFileIdRef.current
    audioFileIdRef.current = null
    if (uploadedAudioId) void fetch("/api/files/" + encodeURIComponent(uploadedAudioId), { method: "DELETE" }).catch(() => undefined)
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
    const incoming = Array.from(event.currentTarget.files ?? []).map(normalizeAttachment)
    event.currentTarget.value = ""
    if (!incoming.length) return

    const combined = [...selectedImages, ...incoming]
    if (combined.length > MAX_ATTACHMENT_COUNT) {
      setImageError("Attach up to 5 files per message.")
      return
    }
    if (combined.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type) && !ALLOWED_DOCUMENT_TYPES.has(file.type))) {
      setImageError("Supported files: PNG, JPEG, WebP, TXT, MD, CSV, JSON, HTML, PDF, and DOCX.")
      return
    }
    const images = combined.filter((file) => ALLOWED_IMAGE_TYPES.has(file.type))
    const documents = combined.filter((file) => !ALLOWED_IMAGE_TYPES.has(file.type))
    if (images.length > maxSelectableImages) {
      setImageError(`This model supports up to ${maxSelectableImages} new image(s) in this message.`)
      return
    }
    if (images.some((file) => file.size > MAX_IMAGE_FILE_BYTES)) {
      setImageError("Each image must be 1 MiB or smaller.")
      return
    }
    if (images.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
      setImageError("All attached images must total 3 MiB or less.")
      return
    }
    if (documents.some((file) => file.size > MAX_DOCUMENT_FILE_BYTES)) {
      setImageError("Each document must be 10 MiB or smaller.")
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
    () => selectedImages.filter((file) => ALLOWED_IMAGE_TYPES.has(file.type)).map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedImages]
  )

  React.useEffect(() => {
    return () => imagePreviews.forEach(({ url }) => URL.revokeObjectURL(url))
  }, [imagePreviews])

  async function handleSubmit(event?: React.FormEvent) {
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
    if ((!text && selectedImages.length === 0) || isBusy || isPreparingAttachments || isSubmitting || voiceState === "transcribing" || voiceState === "stopped") return
    setIsSubmitting(true)
    try {
      const succeeded = await onSubmit(text, selectedImages, runInBackground)
      if (!succeeded) return
      setSelectedImages([])
      setRunInBackground(false)
      setImageError("")
      inputRef.current = ""
      setInput("")
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.style.overflowY = "hidden"
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isVoiceActive = voiceState !== "idle"
  const isRecording = voiceState === "recording"
  const isTranscribing = voiceState === "transcribing"

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {selectedImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" aria-label="Attached files">
          {selectedImages.map((file) => {
            const index = selectedImages.indexOf(file)
            const preview = imagePreviews.find((item) => item.file === file)
            return (
            <div key={file.name + file.size + index} className={preview ? "relative size-16 overflow-hidden rounded-lg border border-border bg-muted" : "relative flex max-w-56 items-center gap-2 rounded-lg border border-border bg-muted px-2 py-1 text-xs"}>
              <button type="button" onClick={() => { setPreviewUrl(""); setPreviewText(""); setPreviewError(""); setPreviewLoading(!file.type.startsWith("image/") && file.type !== "application/pdf"); setPreviewFile(file) }} aria-label={"Preview " + file.name} title={"Preview " + file.name} className={preview ? "size-full" : "flex min-w-0 items-center gap-2 pr-4 text-left"}>
                {preview ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview.url} alt={file.name} className="size-full object-cover" />
                </> : <><FileTextIcon className="size-4 shrink-0" /><span className="max-w-44 truncate">{file.name}</span></>}
              </button>
              {isPreparingAttachments || isSubmitting ? <span aria-label="Uploading attachment" role="status" className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-background/90 shadow"><span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /></span> : <button
                type="button"
                aria-label={"Remove " + file.name}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-foreground shadow"
                onClick={() => removeSelectedImage(index)}
              >
                <XIcon className="size-3" />
              </button>}
            </div>
          )})}
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
            <>
              <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={handleImageSelection} />
              <input ref={documentInputRef} type="file" accept=".txt,.md,.csv,.json,.html,.htm,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple className="hidden" onChange={handleImageSelection} />
              <div ref={attachmentMenuRef} className="relative">
                <InputGroupButton type="button" size="icon-sm" variant="outline" aria-label="Add attachment" title="Add attachment" disabled={isPreparingAttachments || isSubmitting} aria-haspopup="menu" aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen((open) => !open)}>
                  <PlusIcon />
                </InputGroupButton>
                {attachmentMenuOpen && <div role="menu" aria-label="Add attachment" className="absolute bottom-full left-0 z-50 mb-2 min-w-44 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
                  <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setAttachmentMenuOpen(false); imageInputRef.current?.click() }}><ImageIcon className="size-4" />Add images</button>
                  <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setAttachmentMenuOpen(false); documentInputRef.current?.click() }}><FileTextIcon className="size-4" />Add documents</button>
                </div>}
              </div>
            </>
            {!isVoiceActive && (
              <label className="ml-auto flex shrink-0 items-center gap-1.5 px-1 text-[11px] text-muted-foreground" title="Run this request as a persistent background task">
                <input type="checkbox" checked={runInBackground} onChange={(event) => setRunInBackground(event.target.checked)} disabled={isSubmitting || isBusy || selectedImages.length > 0} className="size-3.5 accent-primary" />
                Background task
              </label>
            )}
            {isVoiceActive ? (
              <>
                <InputGroupButton type="button" size="icon-sm" variant="ghost" className="ml-auto shrink-0" aria-label="Discard recording" title="Discard" onClick={cancelVoice}>
                  <XIcon />
                </InputGroupButton>
                {isRecording ? (
                  <WaveformRing level={waveformLevel}>
                    <InputGroupButton type="button" size="icon-sm" variant="outline" className="shrink-0" aria-label="Stop and transcribe without sending" title="Stop and transcribe" onClick={() => finalizeRecording("insert")}>
                      <SquareIcon />
                    </InputGroupButton>
                  </WaveformRing>
                ) : (
                  <span role="status" aria-live="polite" className={`min-w-0 truncate text-xs ${voiceState === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                    {voiceState === "failed" ? "Couldn't transcribe" : "Transcribing…"}
                  </span>
                )}
                {voiceState === "failed" && (
                  <InputGroupButton type="button" size="icon-sm" variant="outline" aria-label="Retry transcription" title="Retry transcription" onClick={retryTranscription}>
                    <RotateCcwIcon />
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
                disabled={isPreparingAttachments || isSubmitting}
                onClick={() => void startRecording()}
              >
                <MicIcon />
              </InputGroupButton>
            )}
            {isBusy ? (
              <InputGroupButton type="button" size="icon-sm" variant="outline" aria-label="Stop generating" className="ml-2" onClick={onStop}>
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                aria-label={isRecording ? "Send audio and transcribe" : isTranscribing ? "Transcribing audio" : "Send message"}
                className="ml-2"
                disabled={isTranscribing || isPreparingAttachments || isSubmitting || voiceState === "stopped" || (!input.trim() && selectedImages.length === 0 && !isRecording && !(voiceState === "failed" && hasAudio))}
              >
                {isRecording ? <ArrowUpIcon /> : isTranscribing || isPreparingAttachments || isSubmitting ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUpIcon />}
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
      {previewFile && <div role="dialog" aria-modal="true" aria-label={"Preview " + previewFile.name} className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6" onPointerDown={(event) => { if (event.target === event.currentTarget) setPreviewFile(null) }}>
        <section className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3"><FileTextIcon className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{previewFile.name}</span><button type="button" onClick={() => setPreviewFile(null)} aria-label="Close preview" className="rounded-lg p-2 hover:bg-muted"><XIcon className="size-4" /></button></header>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3 sm:p-5">
            {previewFile.type.startsWith("image/") && previewUrl ? <div className="flex min-h-64 items-center justify-center"><img src={previewUrl} alt={previewFile.name} className="max-h-[75dvh] max-w-full object-contain" /></div>
              : previewFile.type === "application/pdf" && previewUrl ? <iframe title={"PDF preview: " + previewFile.name} src={previewUrl} className="h-[75dvh] w-full rounded-lg bg-background" />
              : previewLoading ? <div role="status" className="flex min-h-40 items-center justify-center"><span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /></div>
              : previewError ? <p role="alert" className="p-4 text-sm text-muted-foreground">{previewError}</p>
              : <pre className="whitespace-pre-wrap break-words rounded-lg bg-background p-4 text-sm leading-6">{previewText || "This document contains no previewable text."}</pre>}
          </div>
          <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Preview only. The original file remains selected until sending succeeds.</footer>
        </section>
      </div>}
    </form>
  )
}
