# 🚀 Deployment Instructions - Symptom Checker

## ✅ Backend Update: Switched to Google Gemini LLM

The backend now uses the **Google Gemini (Generative Language) API** for analysis.

---

## 📝 Step 1: Get Your Gemini API Key

1. Create a Gemini API key from Google AI Studio / Google Cloud.
2. Copy the key value.

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
7. (Optional) Add `GEMINI_MODEL` if you want to override the default `gemini-1.5-flash`
8. Click **"Save Changes"**

---

## 🗂️ Step 3: Point Render to the backend folder

1. In the Render service settings, set **Root Directory** to `healthcare-backend`
2. Use **Build Command** `pip install -r requirements.txt`
3. Use **Start Command** `python app.py`
4. Save the changes so future deploys target the isolated backend folder

---

## 🚢 Step 4: Deploy Updated Backend Code

### Option A: Deploy via GitHub (Recommended)
1. **Commit the changes**:
   ```bash
   git add healthcare-backend/app.py
   git commit -m "Switch backend to Gemini"
   git push origin main
   ```
2. **Render will auto-deploy** (if connected to GitHub)

### Option B: Manual Deploy
1. Go to your Render service dashboard
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Or upload the updated `app.py` file

---

## ✅ Step 5: Verify the Deployment

1. **Wait for deployment to complete** (usually 2-5 minutes)
2. **Test the backend**:
   - Open: `https://healthcare-symptom-checker-backend-xktt.onrender.com`
   - You should see: `"Symptom Checker backend with LLM-Powered AI is running! ✅"`
3. **Test the frontend**: Open `http://localhost:3000` and try analyzing symptoms

---

## 🎉 That's it!

Your Symptom Checker should now be fully functional with Gemini!

---

## 🆘 Troubleshooting

### If you get "API key not configured" error:
- Make sure you added `GEMINI_API_KEY` in Render
- Make sure the service restarted after adding the environment variable

### If you get "LLM provider error":
- Check that your Gemini API key is valid
- Make sure the account/project has sufficient quota and the selected model is available

### If the backend doesn't update:
- Go to Render → Click "Manual Deploy" → "Clear build cache & deploy"

---

## 📊 API Considerations

Gemini Usage:
- Rate limits depend on your Google AI / project quota
- Track usage/quota in your Google console
- Create separate keys for staging vs. production environments if needed

---

## 💡 Next Steps

1. Get your Gemini API key
2. Add it to Render environment variables
3. Deploy the updated backend
4. Test your Symptom Checker!

Good luck! 🎊
