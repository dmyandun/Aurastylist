import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UploadZoneProps {
  onImageSelect: (base64: string, mimeType: string) => void;
  isLoading: boolean;
}

export default function UploadZone({ onImageSelect, isLoading }: UploadZoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Resize logic
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Get resized base64
          const resizedBase64 = canvas.toDataURL(file.type, 0.8);
          setPreview(resizedBase64);
          const base64Data = resizedBase64.split(',')[1];
          onImageSelect(base64Data, file.type);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div 
      className="relative w-full max-w-xl mx-auto"
      onClick={() => !preview && !isLoading && fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      
      <div className={`
        relative overflow-hidden cursor-pointer
        transition-all duration-500
        ${preview ? 'bg-black/5 border border-black/10 rounded-2xl shadow-xl' : 'glass p-12 hover:bg-black/5'}
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}
      `}>
        <AnimatePresence mode="wait">
          {!preview ? (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-black/5 border border-black/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-[#1a1a1a]" />
              </div>
              <div>
                <h3 className="serif text-xl italic font-medium leading-tight text-[#1a1a1a]">Sube tu prenda</h3>
                <p className="text-black/40 text-sm mt-1 font-light tracking-wide">¿Difícil de combinar? Suéltala aquí.</p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-square sm:aspect-[4/5] w-full"
            >
              <img 
                src={preview} 
                alt="Vista previa de carga" 
                className="w-full h-full object-cover rounded-2xl"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={handleClear}
                className="absolute top-4 right-4 p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 shadow-lg hover:bg-black/60 transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              <div className="absolute bottom-4 left-4 right-4 p-4 bg-white/5 backdrop-blur-md rounded-xl shadow-lg border border-white/10">
                <div className="flex items-center space-x-3 text-white">
                  <ImageIcon className="w-4 h-4 opacity-60" />
                  <span className="text-sm font-medium">Prenda Lista para Análisis</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
