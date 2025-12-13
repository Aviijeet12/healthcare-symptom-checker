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

export default function Home() {
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyzeSymptoms = async (symptoms: string) => {
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symptoms }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMessage = data.error || "Failed to analyze symptoms"
        setError(errorMessage)
        console.error("[v0] API Error:", data)
        return
      }

      setResults(data)
    } catch (err) {
      setError("Network error: Unable to reach the server. Please check your internet connection and try again.")
      console.error("[v0] Error:", err)
    } finally {
      setLoading(false)
    }
  }

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
                  <p className="text-red-300 text-sm">{error}</p>
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
