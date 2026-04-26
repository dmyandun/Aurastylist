import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, RefreshCw, AlertCircle, Download, LogIn, LogOut, User as UserIcon, History, X } from 'lucide-react';
import { analyzeItem, planOutfits, generateOutfitImage, type ItemAnalysis, type OutfitPlan } from './services/aiService';
import { auth, googleProvider } from './lib/firebase';
import { signInWithPopup, onAuthStateChanged, type User } from 'firebase/auth';
import { dbService } from './services/dbService';
import UploadZone from './components/UploadZone';
import OutfitCard from './components/OutfitCard';
import Loader from './components/Loader';

export default function App() {
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'planning' | 'visualizing' | 'completed' | 'error'>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [gender, setGender] = useState<'men' | 'women'>('women');
  const [ageRange, setAgeRange] = useState<'20s' | '30s' | '40s' | '50s+'>('30s');
  const [filter, setFilter] = useState<'All' | 'Casual' | 'Business' | 'Night Out'>('All');
  const [preferredOccasion, setPreferredOccasion] = useState<'All' | 'Casual' | 'Business' | 'Night Out'>('All');
  const [analysis, setAnalysis] = useState<ItemAnalysis | null>(null);
  const [outfitPlans, setOutfitPlans] = useState<OutfitPlan[]>([]);
  const [outfitImages, setOutfitImages] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, 'like' | 'dislike'>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Auth & Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      if (currentUser) {
        await dbService.syncUser(currentUser, gender);
        const historyData = await dbService.getHistory(currentUser.uid);
        if (historyData) setHistory(historyData);
      }
    });
    return () => unsubscribe();
  }, [gender]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showNotification("¡Bienvenido a Aura Stylist!");
    } catch (err: any) {
      // Don't show notification for user cancellations as it's not an app "error"
      const isCancelled = err.code === 'auth/cancelled-popup-request' || 
                          err.code === 'auth/popup-closed-by-user';
      
      if (!isCancelled) {
        console.error("Login failed", err);
        showNotification("Error al iniciar sesión");
      }
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleFeedback = async (outfitId: string, outfit: OutfitPlan, like: boolean) => {
    const type = like ? 'like' : 'dislike';
    setFeedbacks(prev => ({ ...prev, [outfitId]: type }));
    
    if (user) {
      await dbService.saveFeedback(user.uid, outfitId, outfit, type);
    }
    
    showNotification(like ? "¡Me gusta guardado! Aprenderemos de esto." : "Entendido, ajustaremos tus recomendaciones.");
  };

  const handleDownloadAnalysis = () => {
    const images = Object.values(outfitImages);
    const firstImageUrl = images[0] as string | undefined;
    if (!firstImageUrl) return;
    const link = document.createElement('a');
    link.href = firstImageUrl;
    link.download = `aura-analisis-${analysis?.name.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImageSelect = async (base64: string, mimeType: string) => {
    try {
      setStatus('analyzing');
      setError(null);
      setFilter('All');
      setOutfitImages({});
      
      // 1. Analyze item
      const itemAnalysis = await analyzeItem(base64, mimeType);
      setAnalysis(itemAnalysis);
      
      // 2. Plan outfits
      setStatus('planning');
      const plans = await planOutfits(itemAnalysis, gender, history, preferredOccasion, ageRange);
      setOutfitPlans(plans);
      setFeedbacks({}); // Clear current session feedbacks for new set
      
      // 3. Generate images (visualizing) - Sequential to avoid 429 quota exhaustion
      setStatus('visualizing');
      
      // Helper for image generation with simple retry
      const fetchWithRetry = async (prompt: string, retries = 6): Promise<string | null> => {
        for (let i = 0; i <= retries; i++) {
          try {
            return await generateOutfitImage(prompt);
          } catch (err: any) {
            const errStr = JSON.stringify(err);
            console.warn(`Intento de imagen ${i + 1} fallido:`, errStr);
            
            if (i === retries) throw err;
            
            const isRateLimit = errStr.includes('429') || err?.status === 429;
            const isHighDemand = errStr.includes('503') || err?.status === 503 || errStr.toLowerCase().includes('high demand');
            const isInternalError = errStr.includes('500') || err?.status === 500;
            
            if (isRateLimit || isHighDemand || isInternalError) {
              // Longer wait for 503/High Demand
              const baseWait = isHighDemand ? 4000 : 2000;
              const waitTime = Math.pow(2, i) * baseWait;
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              throw err;
            }
          }
        }
        return null;
      };

      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        
        const lifestyleUrl = await fetchWithRetry(plan.imagePrompt);
        if (lifestyleUrl) {
          setOutfitImages(prev => ({ ...prev, [`${plan.occasion}-${i}`]: lifestyleUrl }));
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));

        const flatLayUrl = await fetchWithRetry(plan.flatLayPrompt);
        if (flatLayUrl) {
          setOutfitImages(prev => ({ ...prev, [`${plan.occasion}-${i}-flat`]: flatLayUrl }));
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (user) {
        await dbService.saveStylingHistory(user.uid, itemAnalysis, plans, gender, preferredOccasion, ageRange);
        const historyData = await dbService.getHistory(user.uid);
        if (historyData) setHistory(historyData);
      }
      
      setFilter(preferredOccasion);
      setStatus('completed');
    } catch (err: any) {
      console.error("Styling Error Detail:", err);
      if (err?.message?.includes('429')) {
        setError("Límite de cuota excedido. Por favor, espera un momento antes de intentar de nuevo.");
      } else if (err?.message?.includes('413')) {
        setError("La imagen es demasiado pesada para el análisis. Intenta con una foto más ligera.");
      } else if (err?.message?.includes('503') || err?.message?.includes('504')) {
        setError("El servicio de IA está ocupado. Por favor, reintenta en un momento.");
      } else {
        setError(`Error de Conexión: ${err?.message?.slice(0, 100) || "Fallo inesperado"}. Intenta de nuevo.`);
      }
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setAnalysis(null);
    setOutfitPlans([]);
    setOutfitImages({});
    setError(null);
    setFilter('All');
  };

  const normalizeOccasion = (occ: string) => {
    const o = (occ || '').toLowerCase().trim();
    if (o.includes('noche') || o.includes('night') || o.includes('velada') || o.includes('fiesta') || o.includes('party') || o.includes('evening')) return 'night out';
    if (o.includes('formal') || o.includes('business') || o.includes('negocio') || o.includes('trabajo') || o.includes('oficina') || o.includes('ejecutivo')) return 'business';
    if (o.includes('casual') || o.includes('diario') || o.includes('relajado') || o.includes('informal') || o.includes('weekend')) return 'casual';
    return o;
  };

  const filteredOutfits = outfitPlans.filter(o => {
    if (filter === 'All') return true;
    const normFilter = filter.toLowerCase();
    const normOcc = normalizeOccasion(o.occasion);
    return normOcc === normFilter;
  });

  const filterTranslations: Record<string, string> = {
    'All': 'Todos',
    'Casual': 'Casual',
    'Business': 'Formal',
    'Night Out': 'Velada Exclusiva'
  };

  return (
    <div className="min-h-screen selection:bg-white selection:text-brand-dark">
      <div className="mesh-gradient" />
      
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-24 left-1/2 z-[100] glass px-6 py-3 text-[10px] uppercase tracking-[0.2em] font-bold shadow-2xl border-white/20"
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="glass p-2 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center font-bold text-lg sm:text-xl cursor-default">S</div>
            <h1 className="text-xl sm:text-2xl font-light tracking-tight cursor-default">Virtual<span className="serif">Stylist</span></h1>
          </div>
          
          <div className="hidden md:flex items-center space-x-8 text-[11px] uppercase tracking-[0.2em] font-bold text-[#1a1a1a]/50">
            <button onClick={() => showNotification("Acceso al Armario próximamente en v2.0")} className="hover:text-[#1a1a1a] transition-colors cursor-pointer">Armario</button>
            <button onClick={() => user ? setIsHistoryOpen(true) : handleLogin()} className="hover:text-[#1a1a1a] transition-colors cursor-pointer">
              {user ? "Mi Historial" : "Iniciar Sesión"}
            </button>
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-3 glass pl-3 pr-1 py-1">
                <span className="text-[10px] uppercase font-bold tracking-tighter opacity-70 hidden sm:inline-block">
                  {user.displayName?.split(' ')[0]}
                </span>
                <button 
                  onClick={() => auth.signOut()}
                  className="p-1 hover:bg-black/5 rounded-full transition-colors flex items-center justify-center"
                  title="Cerrar Sesión"
                >
                  <img src={user.photoURL || ""} alt="" className="w-6 h-6 rounded-full border border-black/10" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="glass p-2 hover:bg-black/5 transition-all"
              >
                <LogIn className="w-4 h-4 text-[#1a1a1a]" />
              </button>
            )}
            <button 
              onClick={reset}
              className="glass px-6 py-2 text-sm font-medium hover:bg-black/5 transition-all active:scale-95 whitespace-nowrap text-[#1a1a1a]"
            >
              Nueva Prenda
            </button>
          </div>
        </div>
      </nav>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col relative z-[101]"
            >
              <div className="p-6 border-b border-black/5 flex justify-between items-center bg-black/5">
                <div className="flex flex-col">
                  <span className="text-xl font-light tracking-tight text-[#1a1a1a]">Tu Galería Aura</span>
                  <span className="text-[10px] uppercase tracking-widest text-[#1a1a1a]/40 font-bold">Sesiones guardadas en la nube</span>
                </div>
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors text-[#1a1a1a]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-white/20 space-y-4">
                    <History className="w-12 h-12" />
                    <p className="text-[10px] uppercase tracking-[0.3em]">No hay sesiones guardadas</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.map((entry) => (
                      <div key={entry.id} className="glass-card p-5 group hover:bg-white/5 transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-sm font-medium tracking-tight truncate max-w-[200px]">{entry.itemName}</h3>
                            <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold mt-1">
                              {entry.timestamp?.toDate ? entry.timestamp.toDate().toLocaleDateString() : 'Reciente'}
                            </p>
                          </div>
                          <div className={`px-2 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-widest ${entry.gender === 'men' ? 'bg-blue-400/10 text-blue-300' : 'bg-pink-400/10 text-pink-300'}`}>
                            {entry.gender === 'men' ? 'Hombre' : 'Mujer'}
                          </div>
                        </div>
                        <div className="flex gap-1.5 mb-6">
                          {entry.itemAnalysis?.styleTags?.slice(0, 3).map((tag: string, i: number) => (
                            <span key={i} className="text-[8px] uppercase tracking-widest px-2 py-0.5 glass-card bg-white/5 opacity-60">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t border-white/5">
                          <span className="text-[8px] uppercase tracking-[0.2em] opacity-40">
                            {entry.outfitPlans?.length || 0} Outfits
                          </span>
                          <button 
                            onClick={() => {
                              showNotification("Restaurando edición...");
                              setAnalysis(entry.itemAnalysis);
                              setOutfitPlans(entry.outfitPlans);
                              setGender(entry.gender as 'men' | 'women');
                              setPreferredOccasion(entry.preferredOccasion as any);
                              // Clear current images as they belong to a different session
                              setOutfitImages({});
                              setStatus('completed');
                              setIsHistoryOpen(false);
                            }}
                            className="text-[9px] font-bold uppercase tracking-widest hover:text-white text-white/60 transition-colors flex items-center group/btn"
                          >
                            Recuperar <ArrowRight className="w-3 h-3 ml-1 group-hover/btn:translate-x-1 transition-transform" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="pt-24 sm:pt-32 pb-24 px-4 sm:px-6 max-w-7xl mx-auto">
        {/* Hero Section */}
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.section 
              key="hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center mb-16 space-y-12"
            >
              <div className="space-y-6">
                <h1 className="text-4xl sm:text-6xl md:text-8xl font-light tracking-tight px-4">
                  Estilo sin Esfuerzo<br /><span className="serif italic">Curado por IA</span>
                </h1>
                <p className="max-w-2xl mx-auto text-[#1a1a1a]/60 text-base sm:text-lg font-light leading-relaxed px-6">
                  Sube una prenda de tu armario. Nuestro estilista analizará su esencia y compondrá el conjunto perfecto para cualquier ocasión.
                </p>
              </div>

              <div className="flex flex-col md:flex-row justify-center items-center gap-6 mb-8">
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-[#1a1a1a]/40 font-bold">Género</div>
                  <div className="glass p-1 flex space-x-1">
                    <button 
                      onClick={() => setGender('women')}
                      className={`px-8 py-2 rounded-[20px] transition-all text-xs font-bold uppercase tracking-widest ${gender === 'women' ? 'bg-[#1a1a1a] text-white shadow-lg' : 'text-[#1a1a1a]/40 hover:text-[#1a1a1a]'}`}
                    >
                      Mujeres
                    </button>
                    <button 
                      onClick={() => setGender('men')}
                      className={`px-8 py-2 rounded-[20px] transition-all text-xs font-bold uppercase tracking-widest ${gender === 'men' ? 'bg-[#1a1a1a] text-white shadow-lg' : 'text-[#1a1a1a]/40 hover:text-[#1a1a1a]'}`}
                    >
                      Hombres
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-[#1a1a1a]/40 font-bold">Rango de Edad</div>
                  <div className="glass p-1 flex space-x-1">
                    {(['20s', '30s', '40s', '50s+'] as const).map((range) => (
                      <button 
                        key={range}
                        onClick={() => setAgeRange(range)}
                        className={`px-4 py-2 rounded-[20px] transition-all text-[10px] font-bold uppercase tracking-widest ${ageRange === range ? 'bg-[#1a1a1a] text-white shadow-lg' : 'text-[#1a1a1a]/40 hover:text-[#1a1a1a]'}`}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-[#1a1a1a]/40 font-bold">Ocasión</div>
                  <div className="glass p-1 flex space-x-1">
                    {(['All', 'Casual', 'Business', 'Night Out'] as const).map((occ) => (
                      <button 
                        key={occ}
                        onClick={() => setPreferredOccasion(occ)}
                        className={`px-4 py-2 rounded-[20px] transition-all text-[10px] font-bold uppercase tracking-widest ${preferredOccasion === occ ? 'bg-[#1a1a1a] text-white shadow-lg' : 'text-[#1a1a1a]/40 hover:text-[#1a1a1a]'}`}
                      >
                        {filterTranslations[occ]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="glass p-8 max-w-2xl mx-auto">
                <UploadZone onImageSelect={handleImageSelect} isLoading={false} />
              </div>
              
              <div className="pt-12 flex flex-wrap justify-center gap-12 text-[#1a1a1a]/30 uppercase text-[10px] tracking-[0.3em] font-bold">
                <span>Visión Computacional</span>
                <span>Curaduría Contextual</span>
                <span>Estética Minimalista</span>
              </div>
            </motion.section>
          )}

          {status !== 'idle' && status !== 'completed' && status !== 'error' && (
            <motion.section 
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Loader 
                gender={gender}
                message={
                  status === 'analyzing' ? 'Decodificando patrones textiles' : 
                  status === 'planning' ? 'Diseñando ediciones de ocasión' : 
                  'Puliendo composiciones virtuales'
                } 
              />
            </motion.section>
          )}

          {status === 'error' && (
            <motion.section 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass p-20 flex flex-col items-center justify-center space-y-4 text-center max-w-2xl mx-auto"
            >
              <div className="w-16 h-16 rounded-full bg-red-400/20 border border-red-400/30 flex items-center justify-center text-red-400">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-light">{error}</h2>
              <button 
                onClick={reset}
                className="glass px-8 py-3 bg-white/10 hover:bg-white/20 transition-all font-bold uppercase text-[10px] tracking-widest"
              >
                Reintentar
              </button>
            </motion.section>
          )}

          {status === 'completed' && (
            <motion.section 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full space-y-8"
            >
              <div className="flex flex-col space-y-8">
                {/* Occasion Filter */}
                <div className="flex justify-center">
                  <div className="glass p-1 flex space-x-1">
                    {['All', 'Casual', 'Business', 'Night Out'].map((opt) => (
                      <button 
                        key={opt}
                        onClick={() => setFilter(opt as any)}
                        className={`px-6 py-2 rounded-[20px] transition-all text-[10px] font-bold uppercase tracking-[0.2em] ${filter === opt ? 'bg-[#1a1a1a] text-white shadow-lg' : 'text-[#1a1a1a]/40 hover:text-[#1a1a1a]'}`}
                      >
                        {filterTranslations[opt]}
                      </button>
                    ))}
                  </div>
                </div>

                <motion.div 
                  layout
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                >
                  <AnimatePresence mode="popLayout">
                    {filteredOutfits.map((outfit, index) => {
                      const occasion = outfit.occasion;
                      const originalIndex = outfitPlans.indexOf(outfit);
                      const id = `${occasion}-${originalIndex}`;
                      const imageUrl = outfitImages[id] || null;
                      const flatUrl = outfitImages[`${id}-flat`] || null;
                      const feedback = feedbacks[id] || null;
                      
                      return (
                        <motion.div 
                          key={id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.4 }}
                          className="glass p-5 flex flex-col h-full"
                        >
                          <OutfitCard 
                            outfit={outfit} 
                            imageUrl={imageUrl} 
                            flatUrl={flatUrl}
                            index={index} 
                            feedback={feedback}
                            onFeedback={(like) => handleFeedback(id, outfit, like)}
                          />
                          
                          <div className="mt-4 p-4 glass-card text-[10px] leading-relaxed opacity-70 italic border-t border-black/5">
                            <span className="font-bold border-r border-black/10 pr-2 mr-2 not-italic text-black/40">ESTILISTA AURA</span>
                            {outfit.description}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
                
                {filteredOutfits.length === 0 && (
                  <div className="h-64 flex items-center justify-center glass rounded-3xl opacity-30">
                    <p className="text-xs uppercase tracking-widest font-bold font-sans">No hay estilos que coincidan</p>
                  </div>
                )}
              </div>

              <div className="col-span-12 flex justify-center pt-8">
                <button 
                  onClick={reset}
                  className="glass px-12 py-4 bg-black/5 hover:bg-black/10 text-black transition-all font-bold uppercase text-[10px] tracking-[0.3em]"
                >
                  Iniciar Nueva Sesión
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-12 bg-black/5 backdrop-blur-md border-t border-black/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-[10px] uppercase tracking-[0.3em] font-bold text-[#1a1a1a]/30">
          <span>&copy; 2026 Plataforma VirtualStylist</span>
          <div className="flex space-x-12 mt-6 md:mt-0">
            <a href="#" className="hover:text-black transition-colors">Ética de Privacidad</a>
            <a href="#" className="hover:text-black transition-colors">Modelos de IA</a>
            <a href="#" className="hover:text-black transition-colors">Laboratorio de Diseño</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

