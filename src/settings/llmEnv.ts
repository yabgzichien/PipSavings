export const APP_LLM_ENV = {
  groqKey: process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '',
  groqModel: process.env.EXPO_PUBLIC_GROQ_MODEL ?? '',
  geminiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL ?? '',
  openrouterKey: process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '',
  openrouterModel: process.env.EXPO_PUBLIC_OPENROUTER_MODEL ?? '',
};
