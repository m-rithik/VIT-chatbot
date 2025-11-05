# VIT Bot - Version 2.0.0

An AI-powered assistant for VIT students with advanced features including real-time papers search, VTOP integration, and intelligent query handling.

## 🚀 Features

- **Real-Time Papers Search**: Search CodeChef-VIT papers using Puppeteer browser automation
- **VTOP Integration**: Access VTOP data and course information
- **AI-Powered Chat**: Intelligent responses using Google Gemini AI
- **User Authentication**: Secure login with Clerk
- **Answer Key Detection**: Automatically detects papers with answer keys
- **Dynamic Subject Search**: Real-time search results based on user input

## 🛠️ Installation

1. **Clone or extract the project**
   ```bash
   # Extract the zip file
   unzip vit-bot-cloud-project-v2.zip
   cd vit-bot-cloud-project-v2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key
   CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   CLERK_SECRET_KEY=your_clerk_secret_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 📦 Dependencies

- **Next.js 14**: React framework
- **Puppeteer**: Browser automation for papers scraping
- **Clerk**: User authentication
- **Google Gemini AI**: AI responses
- **React Markdown**: Markdown rendering

## 🔧 Key Components

- **Papers Search**: Real-time scraping from CodeChef-VIT Papers website
- **VTOP Integration**: Course details and assignment tracking
- **AI Chat**: Intelligent query processing and responses
- **User Management**: Secure authentication and session handling

## 🌟 Version 2.0.0 Highlights

- ✅ **Puppeteer Integration**: Real-time papers search with browser automation
- ✅ **Dynamic Subject Search**: Different results for different subjects
- ✅ **Answer Key Detection**: Automatic detection of papers with answer keys
- ✅ **Real Paper Links**: Actual CodeChef paper URLs and data
- ✅ **Enhanced Error Handling**: Better user experience with helpful error messages

## 🚀 Getting Started

1. Install all dependencies with `npm install`
2. Set up your environment variables
3. Run `npm run dev` to start the development server
4. Open `http://localhost:3000` in your browser
5. Start chatting with the VIT Bot!

## 📝 Usage

- **Search Papers**: "Give me cloud computing papers"
- **VTOP Queries**: "Show me my courses"
- **General Questions**: Ask any VIT-related questions

## 🔒 Security

- User authentication handled by Clerk
- API keys stored securely in environment variables
- No sensitive data stored in the application

## 📄 License

MIT License - feel free to use and modify as needed.

---

**Made with ❤️ for VIT students**