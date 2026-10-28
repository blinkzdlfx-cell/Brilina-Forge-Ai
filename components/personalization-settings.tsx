"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { DEFAULT_PERSONALIZATION, normalizePersonalization, type PersonalizationPreferences } from "@/lib/personalization"

type Props = { onClose: () => void }

const fieldClass = "mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
const areaClass = "mt-1.5 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium">{label}<select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
}

function TextField({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return <label className="block text-sm font-medium">{label}<textarea className={areaClass} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /><span className="mt-1 block text-right text-xs text-muted-foreground">{value.length}/{maxLength}</span></label>
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-primary" /></label>
}

export function PersonalizationSettings({ onClose }: Props) {
  const { setTheme } = useTheme()
  const [preferences, setPreferences] = React.useState<PersonalizationPreferences>(normalizePersonalization(DEFAULT_PERSONALIZATION))
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")

  React.useEffect(() => {
    let active = true
    fetch("/api/profile/preferences").then(async (response) => {
      const payload = await response.json() as { preferences?: unknown; error?: string }
      if (!response.ok || !payload.preferences) throw new Error(payload.error ?? "Could not load personalization.")
      if (active) {
        const normalized = normalizePersonalization(payload.preferences)
        setPreferences(normalized)
        setTheme(normalized.theme)
      }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load personalization.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [setTheme])

  const update = <K extends keyof PersonalizationPreferences,>(key: K, value: PersonalizationPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }))
    if (key === "theme") setTheme(value as PersonalizationPreferences["theme"])
  }

  async function save() {
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences }),
      })
      const payload = await response.json() as { preferences?: unknown; error?: string }
      if (!response.ok || !payload.preferences) throw new Error(payload.error ?? "Could not save personalization.")
      const normalized = normalizePersonalization(payload.preferences)
      setPreferences(normalized)
      setTheme(normalized.theme)
      setNotice("Personalization saved.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save personalization.")
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    const defaults = normalizePersonalization(DEFAULT_PERSONALIZATION)
    setPreferences(defaults)
    setTheme(defaults.theme)
    setError("")
    setNotice("")
    setSaving(true)
    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: defaults }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not reset personalization.")
      setNotice("Defaults restored.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset personalization.")
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label="Personalization" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-base font-semibold">Personalization</h2><p className="mt-1 text-xs text-muted-foreground">Choose how Brilina Forge looks and responds.</p></div><button type="button" aria-label="Close personalization" onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><XIcon className="size-4" /></button></header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading your preferences…</p> : <>
          <section className="space-y-3"><h3 className="text-sm font-semibold">Appearance</h3><SelectField label="Theme" value={preferences.theme} options={[["system","Use device setting"],["light","Light"],["dark","Dark"]]} onChange={(v) => update("theme", v as PersonalizationPreferences["theme"])} /></section>
          <section className="space-y-3"><h3 className="text-sm font-semibold">Response preferences</h3><div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Response style" value={preferences.responseStyle} options={[["default","Default"],["professional","Professional"],["friendly","Friendly"],["direct","Direct"],["creative","Creative"]]} onChange={(v) => update("responseStyle", v as PersonalizationPreferences["responseStyle"])} />
            <SelectField label="Response length" value={preferences.responseLength} options={[["concise","Concise"],["balanced","Balanced"],["detailed","Detailed"]]} onChange={(v) => update("responseLength", v as PersonalizationPreferences["responseLength"])} />
            <SelectField label="Tone" value={preferences.tone} options={[["neutral","Neutral"],["friendly","Friendly"],["enthusiastic","Enthusiastic"]]} onChange={(v) => update("tone", v as PersonalizationPreferences["tone"])} />
            <SelectField label="Formatting" value={preferences.formatting} options={[["minimal","Minimal"],["balanced","Balanced"],["structured","Structured"]]} onChange={(v) => update("formatting", v as PersonalizationPreferences["formatting"])} />
            <SelectField label="Emoji usage" value={preferences.emojiUsage} options={[["never","Never"],["occasionally","Occasionally"],["frequently","Frequently"]]} onChange={(v) => update("emojiUsage", v as PersonalizationPreferences["emojiUsage"])} />
          </div></section>
          <section className="space-y-3"><h3 className="text-sm font-semibold">Custom instructions</h3><TextField label="What should Brilina Forge know about you?" value={preferences.aboutUser} maxLength={2000} onChange={(v) => update("aboutUser", v)} /><TextField label="How should Brilina Forge respond?" value={preferences.responseInstructions} maxLength={3000} onChange={(v) => update("responseInstructions", v)} /></section>
          <section className="space-y-3"><h3 className="text-sm font-semibold">Coding workflow</h3><div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Planning" value={preferences.planning} options={[["always","Plan before implementation"],["before-significant-changes","Plan significant changes"],["when-asked","Plan when I ask"]]} onChange={(v) => update("planning", v as PersonalizationPreferences["planning"])} />
            <SelectField label="Implementation batch size" value={preferences.batchSize} options={[["tiny","Tiny batches"],["small","Small batches"],["medium","Medium batches"]]} onChange={(v) => update("batchSize", v as PersonalizationPreferences["batchSize"])} />
            <SelectField label="Testing" value={preferences.runTests} options={[["always","Run all relevant tests"],["relevant","Run tests for changed areas"],["when-asked","Run tests when asked"]]} onChange={(v) => update("runTests", v as PersonalizationPreferences["runTests"])} />
          </div><div className="space-y-2"><ToggleField label="Explain important code changes" checked={preferences.explainChanges} onChange={(v) => update("explainChanges", v)} /><ToggleField label="Require my approval before merging a pull request" checked={preferences.approvalBeforeMerge} onChange={(v) => update("approvalBeforeMerge", v)} /><ToggleField label="Show progress and blockers during long tasks" checked={preferences.showProgress} onChange={(v) => update("showProgress", v)} /></div></section>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3"><button type="button" disabled={loading || saving} onClick={() => void reset()} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"><RotateCcwIcon className="size-4" />Reset to defaults</button><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Close</button><button type="button" disabled={loading || saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"><CheckIcon className="size-4" />{saving ? "Saving…" : "Save preferences"}</button></div></footer>
    </section>
  </div>
}
