#!/bin/bash

# VIT Bot - Version 2.0.0 Installation Script
echo "🚀 VIT Bot - Version 2.0.0 Installation"
echo "======================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create .env.local template
echo "📝 Creating environment variables template..."
cat > .env.local << EOF
# VIT Bot Environment Variables
# Replace with your actual API keys

# OpenAI API Key (for AI responses)
OPENAI_API_KEY=your_openai_api_key_here

# Google Gemini API Key (for AI responses)
GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key_here

# Clerk Authentication Keys
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here
EOF

echo "✅ Environment template created at .env.local"
echo ""
echo "🎉 Installation Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Edit .env.local and add your API keys"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:3000"
echo ""
echo "🔑 Required API Keys:"
echo "   - OpenAI API Key: https://platform.openai.com/api-keys"
echo "   - Google Gemini API Key: https://makersuite.google.com/app/apikey"
echo "   - Clerk Keys: https://clerk.com/"
echo ""
echo "📚 Documentation: See README.md for detailed instructions"
