"use client"

import type React from "react"
import { useState } from "react"
import { Send } from "lucide-react"

interface SymptomFormProps {
  onSubmit: (symptoms: string) => void
  loading: boolean
}

export default function SymptomForm({ onSubmit, loading }: SymptomFormProps) {
  const [symptoms, setSymptoms] = useState("")
  const [isFocused, setIsFocused] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (symptoms.trim()) {
      onSubmit(symptoms)
    }
  }

  const characterCount = symptoms.length
  const maxCharacters = 500
  const percentage = (characterCount / maxCharacters) * 100

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <label className="block text-sm font-semibold text-white mb-3">Describe Your Symptoms</label>
        <textarea
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value.slice(0, maxCharacters))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Example: I have a sore throat, fever around 101°F, body aches, and fatigue for 2 days..."
          disabled={loading}
          className={`w-full px-5 py-4 border-2 rounded-xl focus:outline-none transition-all resize-none bg-slate-800/50 text-white placeholder-slate-500 disabled:bg-slate-700/50 disabled:cursor-not-allowed font-medium backdrop-blur-sm ${
            isFocused
              ? "border-blue-500 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/20"
              : "border-slate-700 hover:border-slate-600"
          }`}
          rows={6}
        />

        <div className="absolute bottom-3 right-4 flex flex-col items-end gap-2">
          <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          <span
            className={`text-xs font-medium ${characterCount > maxCharacters * 0.9 ? "text-orange-400" : "text-slate-400"}`}
          >
            {characterCount}/{maxCharacters}
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !symptoms.trim()}
        className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 shadow-lg hover:shadow-blue-500/50 disabled:shadow-none disabled:hover:scale-100"
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Analyzing your symptoms...</span>
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>Analyze Symptoms</span>
          </>
        )}
      </button>

      <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-3">
        <p className="text-xs text-blue-300 font-medium">
          ℹ️ This analysis is for educational purposes only and should not replace professional medical advice. Always
          consult a healthcare provider.
        </p>
      </div>
    </form>
  )
}
