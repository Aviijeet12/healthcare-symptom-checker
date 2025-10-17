# 🩺 Healthcare Symptom Checker
https://healthcare-symptom-checker-sooty.vercel.app/
A modern, interactive web application for educational purposes that helps users understand potential medical conditions based on their symptoms. This tool provides insights into possible conditions and recommended next steps, with clear disclaimers about its educational nature.

## ✨ Features

- **Interactive Symptom Input**: User-friendly textarea for describing symptoms in detail
- **AI-Powered Analysis**: Integrates with a backend API to analyze symptoms
- **Beautiful Results Display**: Shows probable conditions, recommendations, and important disclaimers
- **Responsive Design**: Works seamlessly on mobile, tablet, and desktop devices
- **Professional Healthcare Theme**: Clean, modern interface with healthcare-appropriate colors
- **Loading States**: Visual feedback during symptom analysis
- **Error Handling**: Graceful error messages for failed API calls

## 🛠️ Tech Stack

- **Frontend Framework**: Next.js 15+ with React
- **Styling**: Tailwind CSS v4 with custom healthcare color palette
- **Language**: TypeScript
- **API Integration**: Fetch API for backend communication
- **Deployment**: Vercel-ready

## 📁 Project Structure

\`\`\`
healthcare-symptom-checker/
├── app/
│   ├── layout.tsx           # Root layout with metadata
│   ├── page.tsx             # Main page component
│   └── globals.css          # Global styles and theme
├── components/
│   ├── header.tsx           # App header
│   ├── symptom-form.tsx     # Symptom input form
│   ├── results-card.tsx     # Results display component
│   └── footer.tsx           # App footer
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
├── next.config.mjs          # Next.js configuration
└── README.md                # This file
\`\`\`

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   \`\`\`bash
   git clone https://github.com/Aviijeet12/healthcare-symptom-checker.git
   cd healthcare-symptom-checker
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Run the development server**
   \`\`\`bash
   npm run dev
   \`\`\`

4. **Open in browser**
   Navigate to `http://localhost:3000`

## 📡 API Integration

### Endpoint
\`\`\`
POST https://healthcare-symptom-checker.onrender.com/analyze
\`\`\`

### Request Format
\`\`\`json
{
  "symptoms": "user input text describing symptoms"
}
\`\`\`

### Response Format
\`\`\`json
{
  "conditions": ["Condition 1", "Condition 2"],
  "recommendations": "Recommended actions and next steps",
  "disclaimer": "Educational disclaimer text"
}
\`\`\`

## 🎨 Design Features

- **Color Palette**: Professional healthcare blues with white backgrounds
- **Typography**: Clean, readable fonts optimized for medical content
- **Animations**: Smooth transitions and loading states
- **Accessibility**: Semantic HTML and ARIA-compliant components
- **Mobile-First**: Responsive design that works on all devices

## 🔒 Privacy & Security

- No personal health information is stored locally
- API calls are made directly to the backend service
- No cookies or tracking mechanisms are used
- User data is not retained after analysis

