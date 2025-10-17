# 🚀 Deployment Instructions - Healthcare Symptom Checker

## ✅ Backend Update: Switched from Groq to Gemini API

The backend has been updated to use **Google Gemini API** instead of Groq for better reliability and availability.

---

## 📝 Step 1: Get Your Free Gemini API Key

1. **Go to Google AI Studio**: https://aistudio.google.com/app/apikey
2. **Sign in** with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. **Copy** the API key (it starts with `AIza...`)

---

## 🔧 Step 2: Configure Environment Variable on Render

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Find your backend service**: `healthcare-symptom-checker-backend-xktt`
3. Click on the service name to open it
4. Go to **"Environment"** tab (left sidebar)
5. Click **"Add Environment Variable"**
6. Add the following:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Paste your Gemini API key (from Step 1)
7. Click **"Save Changes"**

---

## 🚢 Step 3: Deploy Updated Backend Code

### Option A: Deploy via GitHub (Recommended)
1. **Commit the changes**:
   ```bash
   git add healthcare-backend/app.py
   git commit -m "Switch from Groq to Gemini API for better reliability"
   git push origin main
   ```
2. **Render will auto-deploy** (if connected to GitHub)

### Option B: Manual Deploy
1. Go to your Render service dashboard
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Or upload the updated `app.py` file

---

## ✅ Step 4: Verify the Deployment

1. **Wait for deployment to complete** (usually 2-5 minutes)
2. **Test the backend**:
   - Open: `https://healthcare-symptom-checker-backend-xktt.onrender.com`
   - You should see: `"Healthcare Symptom Checker Backend with Gemini AI is running! ✅"`
3. **Test the frontend**: Open `http://localhost:3000` and try analyzing symptoms

---

## 🎉 That's it!

Your healthcare symptom checker should now be fully functional with Gemini AI!

---

## 🆘 Troubleshooting

### If you get "API key not configured" error:
- Make sure you added `GEMINI_API_KEY` (not `GROQ_API_KEY`) in Render
- Make sure the service restarted after adding the environment variable

### If you get "Gemini API error":
- Check if your API key is valid at https://aistudio.google.com/app/apikey
- Make sure you didn't exceed the free tier limits (60 requests per minute)

### If the backend doesn't update:
- Go to Render → Click "Manual Deploy" → "Clear build cache & deploy"

---

## 📊 API Limits (Free Tier)

Gemini Pro (Free):
- **Rate Limit**: 60 requests per minute
- **Daily Limit**: 1,500 requests per day
- **Perfect for**: Testing, development, and small projects

---

## 💡 Next Steps

1. Get your Gemini API key
2. Add it to Render environment variables
3. Deploy the updated backend
4. Test your symptom checker!

Good luck! 🎊
