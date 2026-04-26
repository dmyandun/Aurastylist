import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Download, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { OutfitPlan } from '../services/aiService';

interface OutfitCardProps {
  outfit: OutfitPlan;
  imageUrl: string | null;
  flatUrl?: string | null;
  index: number;
  onFeedback?: (like: boolean) => void;
  feedback?: 'like' | 'dislike' | null;
}

export const OutfitCard: React.FC<OutfitCardProps> = ({ outfit, imageUrl, flatUrl, index, onFeedback, feedback }) => {
  const [isFlipped, setIsFlipped] = React.useState(false);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const activeUrl = isFlipped ? flatUrl : imageUrl;
    if (!activeUrl) return;
    const link = document.createElement('a');
    link.href = activeUrl;
    link.download = `aura-outfit-${outfit.occasion.toLowerCase()}-${isFlipped ? 'flat' : 'lifestyle'}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, scale: 1.02 }}
      onClick={() => flatUrl && setIsFlipped(!isFlipped)}
      onHoverStart={() => flatUrl && !('ontouchstart' in window) && setIsFlipped(true)}
      onHoverEnd={() => !('ontouchstart' in window) && setIsFlipped(false)}
      transition={{ 
        delay: index * 0.15, 
        duration: 0.8, 
        ease: [0.22, 1, 0.36, 1],
        hover: { duration: 0.3, ease: "easeOut" }
      }}
      className="group glass-card overflow-hidden h-full flex flex-col relative transition-all duration-300 hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:border-white/20 perspective-1000 cursor-pointer"
    >
      {/* View Indicator Badge */}
      <div className="absolute top-4 left-4 z-30 pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={isFlipped ? 'flat' : 'lifestyle'}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className={`px-2 py-1 rounded-md text-[8px] font-bold tracking-widest uppercase backdrop-blur-md border border-black/10 shadow-lg ${isFlipped ? 'bg-indigo-500/30 text-indigo-900' : 'bg-black/5 text-black/60'}`}
          >
            {isFlipped ? 'Vista Prenda' : 'Estilo Editorial'}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative aspect-square w-full">
        <motion.div
          className="w-full h-full relative preserve-3d"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        >
          {/* Front: Editorial Lifestyle */}
          <div className="absolute inset-0 backface-hidden bg-white/5">
            {imageUrl ? (
              <motion.img 
                src={imageUrl} 
                alt={`${outfit.occasion} Lifestyle`} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-3 p-8 text-center bg-white/5">
                <Sparkles className="w-8 h-8 text-black/10 animate-pulse" />
                <p className="text-black/30 text-[10px] uppercase tracking-widest font-bold">Refinando Vibe...</p>
              </div>
            )}
          </div>

          {/* Back: Flat-lay Display */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white/5">
            {flatUrl ? (
              <img 
                src={flatUrl} 
                alt={`${outfit.occasion} Flat-lay`} 
                className="w-full h-full object-cover p-4"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-3 p-8 text-center">
                <Sparkles className="w-8 h-8 text-black/10 animate-pulse" />
                <p className="text-black/30 text-[10px] uppercase tracking-widest font-bold">Desplegando Patrón...</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Global Action Overlay */}
        <button 
          onClick={handleDownload}
          className="absolute bottom-4 right-4 z-20 p-3 glass bg-black/40 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-all hover:bg-black/60 active:scale-95"
          title={`Descargar ${isFlipped ? 'Prenda' : 'Editorial'}`}
        >
          <Download className="w-4 h-4 text-white" />
        </button>
      </div>

      <div className="p-6 flex flex-col flex-grow space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="label text-black/40">Ocasión</div>
            <div className="text-sm font-medium text-black/90">{outfit.occasion}</div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onFeedback?.(true); }}
              className={`p-2 rounded-lg border transition-all ${feedback === 'like' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-600 scale-110' : 'bg-black/5 border-black/10 text-black/40 hover:bg-black/10 hover:text-black/60'}`}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onFeedback?.(false); }}
              className={`p-2 rounded-lg border transition-all ${feedback === 'dislike' ? 'bg-red-500/20 border-red-500/50 text-red-600 scale-110' : 'bg-black/5 border-black/10 text-black/40 hover:bg-black/10 hover:text-black/60'}`}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="label text-black/40">Incluye</div>
          <div className="flex flex-wrap gap-1.5">
            {outfit.pieces.map((piece, i) => (
              <span 
                key={i} 
                className="px-2.5 py-1 bg-black/5 text-black/80 text-[10px] rounded-lg border border-black/10"
              >
                {piece}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OutfitCard;
