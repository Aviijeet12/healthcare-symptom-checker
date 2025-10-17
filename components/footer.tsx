export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gradient-to-r from-slate-950 to-slate-900 text-slate-100 mt-16 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="font-bold text-lg text-white mb-3">HealthCheck</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              An AI-powered educational tool designed to help you understand your symptoms better.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Important</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>• Educational use only</li>
              <li>• Not a medical diagnosis</li>
              <li>• Consult healthcare professionals</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Disclaimer</h4>
            <p className="text-slate-400 text-sm leading-relaxed">
              This tool should not be used as a substitute for professional medical advice, diagnosis, or treatment.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <p className="text-sm text-slate-400">© {currentYear} HealthCheck — Educational Use Only</p>
            <p className="text-xs text-slate-500 mt-4 md:mt-0">
              Always seek professional medical advice for health concerns
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
