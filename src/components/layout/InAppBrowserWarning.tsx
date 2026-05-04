import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ExternalLink, X } from 'lucide-react';
import { useUI } from '../../context/UIContext';

export function InAppBrowserWarning() {
  const { isInAppBrowser, showInAppWarning, setShowInAppWarning, t } = useUI();

  if (!isInAppBrowser || !showInAppWarning) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-amber-50 border-b border-amber-200 relative z-[60]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 pr-8 sm:pr-0 relative">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-bold text-amber-800 mb-0.5">
                {t.inAppBrowserWarning}
              </p>
              <p className="text-amber-700">
                {t.inAppBrowserAction}
              </p>
            </div>
          </div>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-all shadow-sm shrink-0 w-full sm:w-auto cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            {t.openInExternalBrowser}
          </button>
          
          <button 
            onClick={() => setShowInAppWarning(false)}
            className="absolute top-0 right-0 sm:static sm:top-auto sm:right-auto w-8 h-8 rounded-full hover:bg-amber-100/50 flex items-center justify-center transition-colors text-amber-500 hover:text-amber-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
