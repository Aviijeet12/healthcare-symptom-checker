"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Lightbulb } from "lucide-react"

interface AnalysisResult {
  conditions: string[]
  recommendations: string
  disclaimer: string
}

interface ResultsCardProps {
  results: AnalysisResult
}

export default function ResultsCard({ results }: ResultsCardProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  return (
    <div
      className={`mt-10 space-y-6 transform transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div className="bg-gradient-to-br from-blue-950 to-blue-900 rounded-xl border-2 border-blue-800 shadow-lg hover:shadow-xl transition-all p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Possible Conditions</h2>
            <p className="text-sm text-blue-300">Based on your symptoms</p>
          </div>
        </div>
        <div className="space-y-3">
          {results.conditions && results.conditions.length > 0 ? (
            results.conditions.map((condition, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-4 bg-slate-800 rounded-lg border border-blue-700 hover:border-blue-500 hover:shadow-md transition-all group"
              >
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                  <span className="text-white font-bold text-sm">{index + 1}</span>
                </div>
                <span className="text-white font-semibold pt-0.5">{condition}</span>
              </div>
            ))
          ) : (
            <p className="text-slate-400 text-center py-4">No conditions identified.</p>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-amber-950 to-orange-900 rounded-xl border-2 border-amber-800 shadow-lg hover:shadow-xl transition-all p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 bg-amber-600 rounded-lg flex items-center justify-center shadow-md">
            <Lightbulb className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Recommended Actions</h2>
            <p className="text-sm text-amber-300">What you should do next</p>
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-5 border border-amber-700">
          <p className="text-amber-100 leading-relaxed font-medium">{results.recommendations}</p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-red-950 to-orange-900 rounded-xl border-2 border-red-800 shadow-lg p-7">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-red-300 mb-3 text-lg">Important Medical Disclaimer</h3>
            <div className="space-y-3">
              <p className="text-sm text-red-200 leading-relaxed font-medium">{results.disclaimer}</p>
              <div className="bg-slate-800 rounded-lg p-4 border border-red-800">
                <p className="text-sm text-red-300 font-semibold">
                  ⚕️ Always consult with a qualified medical professional for proper diagnosis and treatment. This tool
                  is for educational purposes only.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
