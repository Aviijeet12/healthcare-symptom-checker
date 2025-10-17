"use client"

import { useState } from "react"
import { Heart } from "lucide-react"

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false)

  if (typeof window !== "undefined") {
    window.addEventListener("scroll", () => {
      setIsScrolled(window.scrollY > 10)
    })
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-slate-900/95 backdrop-blur-md border-b border-slate-700 shadow-md"
          : "bg-slate-900/80 backdrop-blur-sm border-b border-slate-700"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow transform group-hover:scale-105">
              <Heart className="w-6 h-6 text-white fill-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">UNTHINKABLE - HEALTHCHECK</h1>
              <p className="text-xs text-slate-400 font-medium">LLM Powered Symptom Checker</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-green-950 rounded-full border border-green-800">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-semibold text-green-400">GEMINI ACTIVE</span>
          </div>
        </div>
      </div>
    </header>
  )
}
