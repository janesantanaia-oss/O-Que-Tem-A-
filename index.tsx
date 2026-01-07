
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { 
  Utensils, 
  Clock, 
  Flame, 
  ArrowLeft,
  Loader2,
  Sparkles,
  Copy,
  RotateCw,
  ChefHat,
  Refrigerator,
  CheckCircle2,
  Share2,
  Printer,
  FileText,
  Camera,
  X,
  Scan
} from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface Recipe {
  name: string;
  ingredients: string[];
  instructions: string[];
  totalTime: string;
  tip?: string;
  imageUrl?: string;
}

const App = () => {
  const [input, setInput] = useState('');
  const [preference, setPreference] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [variationCount, setVariationCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      alert("Não foi possível acessar a câmera. Verifique as permissões.");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraOpen(false);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsAnalyzing(true);
    const context = canvasRef.current.getContext('2d');
    if (context) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      
      const base64Image = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              parts: [
                { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
                { text: "Analise esta foto de uma geladeira ou despensa e liste todos os ingredientes alimentares que você identifica. Retorne apenas os nomes dos ingredientes separados por vírgula, de forma curta e direta. Não use frases completas." }
              ]
            }
          ]
        });

        const detectedIngredients = response.text || "";
        if (detectedIngredients) {
          setInput(prev => prev ? `${prev}, ${detectedIngredients}` : detectedIngredients);
        }
        stopCamera();
      } catch (err) {
        console.error("Erro na análise da imagem:", err);
        alert("Falha ao analisar a imagem. Tente novamente.");
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const generateRecipe = async (isVariation = false) => {
    if (!input.trim()) return;
    
    setLoading(true);
    if (!isVariation) setVariationCount(0);

    const systemPrompt = `Você é um chef prático do dia a dia. Seu papel é criar UMA receita possível agora usando APENAS os ingredientes informados (considere apenas sal, água e óleo como extras implícitos se necessário).
    Regras obrigatórias:
    - Nunca sugira ingredientes que a pessoa não citou.
    - Nunca ofereça mais de UMA receita.
    - Use preparo simples, caseiro e rápido.
    - Se o usuário pedir variação, mude a técnica de preparo (ex: de cozido para frito).
    - Preferência do usuário: ${preference || 'Nenhuma'}.`;

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Ingredientes disponíveis: ${input}. ${isVariation ? 'Dê uma alternativa diferente da anterior.' : ''}`,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
              instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
              totalTime: { type: Type.STRING },
              tip: { type: Type.STRING },
            },
            required: ["name", "ingredients", "instructions", "totalTime"]
          }
        },
      });

      const recipeData = JSON.parse(response.text || "{}") as Recipe;
      
      try {
        const imgResponse: GenerateContentResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: `Foto profissional de comida: ${recipeData.name}, estilo minimalista, fundo claro.` }] },
          config: { imageConfig: { aspectRatio: "1:1" } }
        });
        
        const part = imgResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) {
          recipeData.imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        }
      } catch (e) {
        console.error("Image gen failed", e);
      }

      setRecipe(recipeData);
      if (isVariation) setVariationCount(prev => prev + 1);
    } catch (error) {
      console.error("Generation error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getMarkdownRecipe = () => {
    if (!recipe) return "";
    const ingredients = recipe.ingredients.map(ing => `- ${ing}`).join('\n');
    const instructions = recipe.instructions.map((step, i) => `${i + 1}. ${step}`).join('\n');
    const tipSection = recipe.tip ? `\n\n> 💡 **Dica do Chef:** ${recipe.tip}` : "";
    
    return `# 🍳 ${recipe.name}\n\n⏱ **Tempo total:** ${recipe.totalTime}\n\n## 🛒 Ingredientes\n${ingredients}\n\n## 👨‍🍳 Modo de Preparo\n${instructions}${tipSection}\n\n---\n*Gerado por O Que Tem Aí?*`;
  };

  const copyAsMarkdown = () => {
    const text = getMarkdownRecipe();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareRecipe = async () => {
    const text = getMarkdownRecipe();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receita: ${recipe?.name}`,
          text: text,
        });
      } catch (err) {
        console.error("Error sharing", err);
      }
    } else {
      copyAsMarkdown();
    }
  };

  const printToPdf = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-slate-900 pb-12 print:bg-white print:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-orange-100 py-4 md:py-6 px-4 sticky top-0 z-50 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-orange-200">
              <ChefHat size={20} className="md:w-6 md:h-6" />
            </div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">O QUE TEM AÍ?</h1>
          </div>
          {recipe && (
            <button 
              onClick={() => { setRecipe(null); setInput(''); setPreference(''); }}
              className="text-gray-400 hover:text-orange-500 transition-colors text-xs md:text-sm font-bold flex items-center gap-1"
            >
              <ArrowLeft size={16} /> <span className="hidden sm:inline">NOVA BUSCA</span><span className="sm:hidden">VOLTAR</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-6 md:mt-10 print:mt-0 print:max-w-none">
        {!recipe ? (
          <div className="animate-fade-in space-y-8 max-w-xl mx-auto">
            <div className="text-center space-y-2">
              <h2 className="text-2xl md:text-4xl font-bold text-gray-900">O que vamos comer hoje?</h2>
              <p className="text-sm md:text-base text-gray-500">Diga o que você tem na geladeira e eu resolvo a sua refeição.</p>
            </div>

            <div className="space-y-4">
              <div className="relative group">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 block">Seus Ingredientes</label>
                  <button 
                    onClick={startCamera}
                    className="flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100 shadow-sm"
                  >
                    <Camera size={14} /> ESCANEAR GELADEIRA
                  </button>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ex: Ovo, Arroz, Cebola, Frango..."
                  className="w-full h-32 md:h-40 p-4 bg-white border-2 border-gray-100 rounded-2xl focus:border-orange-500 focus:ring-0 outline-none transition-all resize-none shadow-sm text-base md:text-lg"
                />
                <div className="absolute bottom-4 right-4 text-gray-300">
                  <Refrigerator size={24} />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 block">Preferência (Opcional)</label>
                <div className="flex flex-wrap gap-2">
                  {['Lanche Rápido', 'Saudável', 'Vegano', 'Low Carb'].map((pref) => (
                    <button
                      key={pref}
                      onClick={() => setPreference(prev => prev === pref ? '' : pref)}
                      className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium transition-all border ${
                        preference === pref 
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md' 
                        : 'bg-white text-gray-600 border-gray-100 hover:border-orange-200'
                      }`}
                    >
                      {pref}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => generateRecipe()}
                disabled={loading || !input.trim()}
                className="w-full py-4 md:py-5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white font-bold rounded-2xl shadow-xl shadow-orange-200 transition-all flex items-center justify-center gap-3 text-base md:text-lg"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {loading ? 'Cozinhando ideias...' : 'Criar Receita'}
              </button>
            </div>

            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-start gap-3">
              <CheckCircle2 className="text-orange-500 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-[10px] md:text-xs text-orange-800 leading-relaxed">
                Minha IA só usará o que você listou. Se você tiver temperos básicos como sal e pimenta, pode usar à vontade!
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6 md:space-y-8 print:space-y-4">
            <div id="recipe-content" className="bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100 print:shadow-none print:border-none">
              <div className="flex flex-col md:flex-row">
                {recipe.imageUrl && (
                  <div className="w-full md:w-2/5 aspect-square md:aspect-auto relative print:hidden">
                    <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6 md:hidden">
                      <h2 className="text-2xl font-bold text-white leading-tight">{recipe.name}</h2>
                    </div>
                  </div>
                )}

                <div className={`p-6 md:p-10 space-y-6 md:space-y-8 print:p-0 ${recipe.imageUrl ? 'md:w-3/5' : 'w-full'}`}>
                  <div className="hidden md:block print:block border-b border-gray-100 pb-4 print:border-orange-100">
                    <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">{recipe.name}</h2>
                  </div>
                  
                  <div className="flex items-center gap-6 print:gap-10">
                    <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-gray-500 print:text-gray-900">
                      <Clock size={18} className="text-orange-500" />
                      {recipe.totalTime}
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-gray-500 print:text-gray-900">
                      <Flame size={18} className="text-orange-500" />
                      Preparo Direto
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Refrigerator size={14} /> Ingredientes
                    </h3>
                    <div className="flex flex-wrap gap-2 print:flex-col print:gap-1">
                      {recipe.ingredients.map((ing, i) => (
                        <span key={i} className="px-2.5 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs md:text-sm font-medium border border-orange-100 print:bg-transparent print:border-none print:text-gray-800 print:p-0 print:before:content-['•_']">
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Utensils size={14} /> Modo de Preparo
                    </h3>
                    <div className="space-y-4">
                      {recipe.instructions.map((step, i) => (
                        <div key={i} className="flex gap-4">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center print:border print:border-orange-500 print:bg-white">
                            {i + 1}
                          </span>
                          <p className="text-gray-700 leading-relaxed text-sm print:text-gray-900">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {recipe.tip && (
                    <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3 print:bg-transparent print:mt-4 print:border-t print:border-b print:border-l-0 print:border-r-0 print:rounded-none">
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm text-orange-500 flex-shrink-0 print:hidden">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest block mb-0.5">Dica do Chef</span>
                        <p className="text-xs text-orange-800 font-medium italic">"{recipe.tip}"</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="hidden print:block pt-8 text-center text-gray-400 text-[10px] uppercase tracking-widest border-t border-gray-100">
                    Gerado pelo App: O Que Tem Aí?
                  </div>
                </div>
              </div>
            </div>

            <div className="max-w-xl mx-auto w-full space-y-6 print:hidden">
              <button 
                onClick={() => generateRecipe(true)}
                disabled={loading || variationCount >= 3}
                className="w-full flex items-center justify-center gap-2 py-4 md:py-5 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 disabled:bg-gray-200 transition-all shadow-xl shadow-orange-100"
              >
                {loading ? <Loader2 size={24} className="animate-spin" /> : <RotateCw size={24} />}
                {variationCount >= 3 ? 'Limite de variações atingido' : 'Tentar outra ideia'}
              </button>
              
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                <button 
                  onClick={copyAsMarkdown}
                  className={`flex flex-col items-center justify-center gap-2 py-3 md:py-4 bg-white border border-gray-200 rounded-2xl font-bold text-[10px] md:text-xs transition-all shadow-sm ${copied ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {copied ? <CheckCircle2 size={18} md:size={20} /> : <FileText size={18} md:size={20} />}
                  <span>{copied ? 'Copiado' : 'Copiar (MD)'}</span>
                </button>
                
                <button onClick={shareRecipe} className="flex flex-col items-center justify-center gap-2 py-3 md:py-4 bg-white border border-gray-200 rounded-2xl font-bold text-[10px] md:text-xs text-gray-600 hover:bg-gray-50 transition-all shadow-sm">
                  <Share2 size={18} md:size={20} />
                  <span>Compartilhar</span>
                </button>

                <button onClick={printToPdf} className="flex flex-col items-center justify-center gap-2 py-3 md:py-4 bg-white border border-gray-200 rounded-2xl font-bold text-[10px] md:text-xs text-gray-600 hover:bg-gray-50 transition-all shadow-sm">
                  <Printer size={18} md:size={20} />
                  <span>PDF / Imprimir</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
          <button 
            onClick={stopCamera}
            className="absolute top-6 right-6 p-2 bg-white/20 text-white rounded-full backdrop-blur-md z-10"
          >
            <X size={24} />
          </button>
          
          <div className="relative w-full h-full max-w-2xl mx-auto flex items-center justify-center overflow-hidden">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            {/* Overlay Scan Line */}
            <div className="absolute inset-0 border-2 border-orange-500/30 pointer-events-none">
              <div className="w-full h-1 bg-orange-500/50 absolute top-0 animate-[scan_3s_infinite_linear]" />
            </div>
          </div>

          <div className="absolute bottom-12 w-full flex flex-col items-center gap-4 px-6">
            <p className="text-white/80 text-sm font-medium text-center max-w-xs">
              Aponte para a geladeira ou despensa para identificar os ingredientes
            </p>
            <button 
              onClick={captureAndAnalyze}
              disabled={isAnalyzing}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform disabled:opacity-50"
            >
              {isAnalyzing ? (
                <Loader2 size={40} className="text-orange-500 animate-spin" />
              ) : (
                <div className="w-16 h-16 border-4 border-orange-500 rounded-full flex items-center justify-center">
                   <Scan size={32} className="text-orange-500" />
                </div>
              )}
            </button>
          </div>
          
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
      
      <footer className="mt-12 text-center text-gray-300 text-[10px] font-bold uppercase tracking-[0.2em] print:hidden px-4">
        Sem ingredientes extras • Sem complicação • Só o que tem aí
      </footer>

      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
