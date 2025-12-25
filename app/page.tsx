"use client"

import { useState } from "react"
import SymptomForm from "@/components/symptom-form"
import ResultsCard from "@/components/results-card"
import Header from "@/components/header"
import Footer from "@/components/footer"
import { Sparkles } from "lucide-react"

interface AnalysisResult {
  conditions: string[]
  recommendations: string
  disclaimer: string
}

type ApiErrorState = {
  message: string
  code?: string
}

export default function Home() {
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiErrorState | null>(null)
  const [lastSymptoms, setLastSymptoms] = useState<string | null>(null)

  const handleAnalyzeSymptoms = async (symptoms: string) => {
    setLoading(true)
    setError(null)
    setResults(null)
    setLastSymptoms(symptoms)

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symptoms }),
      })

      const rawText = await response.text().catch(() => "")
      const data = (() => {
        if (!rawText) return null
        try {
          return JSON.parse(rawText)
        } catch {
          return null
        }
      })()

      if (!response.ok) {
        const errorMessage = (data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : rawText?.trim()
            ? rawText.trim()
            : "Failed to analyze symptoms")
        const errorCode = (data && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : undefined)
        setError({ message: errorMessage, code: errorCode })
        console.error("[v0] API Error:", { status: response.status, data, rawText })
        return
      }

      if (!data) {
        setError({ message: "Unexpected server response. Please try again.", code: "BAD_RESPONSE" })
        console.error("[v0] API Error:", { status: response.status, data, rawText })
        return
      }

      setResults(data)
    } catch (err) {
      setError({
        message: "Network error: Unable to reach the server. Please check your internet connection and try again.",
        code: "NETWORK_ERROR",
      })
      console.error("[v0] Error:", err)
    } finally {
      setLoading(false)
    }
  }

  const canRetry = Boolean(
    !loading &&
      lastSymptoms &&
      error &&
      (error.code === "TIMEOUT" || error.code === "CONNECTION_ERROR" || error.code === "NETWORK_ERROR"),
  )

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-black dark">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-screen filter blur-3xl opacity-15 animate-blob"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-cyan-600 rounded-full mix-blend-screen filter blur-3xl opacity-15 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-3xl">
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-blue-950 rounded-full border border-blue-800">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">LLM-Powered Symptom Insights</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 text-balance leading-tight">
              Understand Your{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Symptoms</span>
            </h1>

            <p className="text-xl text-slate-300 text-balance mb-2">
              Get instant insights about your health concerns with our advanced AI analysis
            </p>
            <p className="text-sm text-slate-400">Educational tool for informational purposes only</p>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700 shadow-2xl p-8 md:p-10">
            <SymptomForm onSubmit={handleAnalyzeSymptoms} loading={loading} />

            {error && (
              <div className="mt-6 p-4 bg-red-950/50 border border-red-800 rounded-xl animate-in fade-in slide-in-from-top-2">
                <div className="flex gap-3">
                  <span className="text-xl">⚠️</span>
                  <div className="flex-1">
                    <p className="text-red-300 text-sm">{error.message}</p>
                    {canRetry && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => lastSymptoms && handleAnalyzeSymptoms(lastSymptoms)}
                          disabled={loading}
                          className="inline-flex items-center justify-center rounded-lg border border-red-700 bg-slate-900/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-slate-900/70 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Try again
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {results && <ResultsCard results={results} />}
          </div>

          {!results && (
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700 p-6 hover:shadow-lg hover:border-blue-600 transition-all">
                <div className="text-3xl mb-3">🔍</div>
                <h3 className="font-semibold text-white mb-2">Detailed Analysis</h3>
                <p className="text-sm text-slate-400">Describe your symptoms in detail for accurate insights</p>
              </div>
              <div className="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700 p-6 hover:shadow-lg hover:border-blue-600 transition-all">
                <div className="text-3xl mb-3">⚡</div>
                <h3 className="font-semibold text-white mb-2">Instant Results</h3>
                <p className="text-sm text-slate-400">Get AI-powered recommendations in seconds</p>
              </div>
              <div className="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700 p-6 hover:shadow-lg hover:border-blue-600 transition-all">
                <div className="text-3xl mb-3">🛡️</div>
                <h3 className="font-semibold text-white mb-2">Professional Guidance</h3>
                <p className="text-sm text-slate-400">Always consult licensed medical professionals for diagnosis</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
