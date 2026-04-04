<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Memory Pics

This is a React project built with Vite.

## Development

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key (you can copy `.env.example` to `.env.local` if it exists).
3. Run the app locally:
   ```bash
   npm run dev
   ```

## Deployment

A GitHub Action is configured in `.github/workflows/deploy.yml` which deploys the static build to GitHub Pages.

To enable it:
1. Go to your GitHub repository -> **Settings** -> **Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push your code to the `main` branch. The app will be automatically built and deployed.
