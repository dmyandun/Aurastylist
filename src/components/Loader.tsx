import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';

const STYLING_PHRASES = {
  women: [
    "Uh la la, qué divina va a quedar...",
    "Preparándote para una pasarela...",
    "Estarás lista para un date night...",
    "Buscando los accesorios perfectos...",
    "Divina e impecable para ti...",
    "Combinando texturas de alta costura...",
    "Tu estilo está a punto de elevarse...",
    "Haciendo magia con tu armario...",
    "Capturando la esencia de tu look...",
    "Ese outfit tendrá mucho porte..."
  ],
  men: [
    "Uh la la, qué elegante vas a quedar...",
    "Preparando tu mejor versión...",
    "Quedarás listo para invitarla a cenar...",
    "Buscando el balance perfecto...",
    "Impecable y con mucho porte...",
    "Combinando texturas de alta costura...",
    "Tu estilo está a punto de elevarse...",
    "Haciendo magia con tu armario...",
    "Asegurando un look impecable...",
    "Ese atuendo tendrá mucha presencia..."
  ]
};

export default function Loader({ message, gender }: { message: string, gender: 'men' | 'women' }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrases = STYLING_PHRASES[gender];

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % phrases.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [phrases.length]);

  return (
    <div className="flex flex-col items-center justify-center p-20 space-y-8 min-h-[400px]">
      <div className="relative w-24 h-24">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 border-t-2 border-black/5 rounded-full"
        />
        <motion.div 
          animate={{ rotate: -360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 border-r-2 border-black/10 rounded-full"
        />
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-4 border-b-2 border-black/40 rounded-full"
        />
      </div>
      <div className="flex flex-col items-center space-y-4 w-full max-w-sm text-center px-4">
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] font-bold text-black/60"
        >
          {message}
        </motion.p>
        
        <div className="min-h-[60px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p 
              key={phraseIndex}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-[#1a1a1a] text-base sm:text-lg italic font-serif leading-relaxed"
            >
              {phrases[phraseIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
