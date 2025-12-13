# 🚀 Deployment Instructions - Symptom Checker

## ✅ Backend Update: Switched to OpenAI LLM

The backend now uses the **OpenAI Responses API** for faster, more reliable analysis.

---

## 📝 Step 1: Get Your OpenAI API Key

1. **Go to OpenAI Dashboard**: https://platform.openai.com/api-keys
2. **Sign in** with your OpenAI account (or create one)
3. Click **"Create new secret key"**
4. **Copy** the API key (it starts with `sk-...`)

---

## 🔧 Step 2: Configure Environment Variable on Render

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Find your backend service**: `healthcare-symptom-checker-backend-xktt`
3. Click on the service name to open it
4. Go to **"Environment"** tab (left sidebar)
5. Click **"Add Environment Variable"**
6. Add the following:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Paste your OpenAI API key (from Step 1)
7. (Optional) Add `OPENAI_MODEL` if you want to override the default `gpt-4o-mini`
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
   git commit -m "Switch backend to OpenAI Responses API"
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

Your Symptom Checker should now be fully functional with OpenAI!

---

## 🆘 Troubleshooting

### If you get "API key not configured" error:
- Make sure you added `OPENAI_API_KEY` in Render
- Make sure the service restarted after adding the environment variable

### If you get "OpenAI API error":
- Check if your API key is valid at https://platform.openai.com/api-keys
- Make sure the account has sufficient quota and the selected model is available in your region

### If the backend doesn't update:
- Go to Render → Click "Manual Deploy" → "Clear build cache & deploy"

---

## 📊 API Considerations

OpenAI Usage:
- Rate limits depend on your OpenAI subscription tier
- Track usage from https://platform.openai.com/usage
- Create multiple keys for staging vs. production environments if needed

---

## 💡 Next Steps

1. Get your OpenAI API key
2. Add it to Render environment variables
3. Deploy the updated backend
4. Test your Symptom Checker!

Good luck! 🎊
