import React from 'react';
import { Star, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { rateAnalysis } from '../../../services/historyService';

interface RatingSectionProps {
  userId: string;
  analysisId: string;
}

export function RatingSection({ userId, analysisId }: RatingSectionProps) {
  const { t } = useUI();
  const [userRating, setUserRating] = React.useState<number>(0);
  const [userFeedback, setUserFeedback] = React.useState('');
  const [isRatingSubmitted, setIsRatingSubmitted] = React.useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = React.useState(false);

  const handleRateAnalysis = async () => {
    if (userRating === 0) return;
    setIsSubmittingRating(true);
    try {
      await rateAnalysis(userId, analysisId, userRating, userFeedback);
      setIsRatingSubmitted(true);
    } catch (err) {
      console.error('Lỗi khi gửi đánh giá:', err);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  if (isRatingSubmitted) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-8 text-center animate-in zoom-in duration-500">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h4 className="text-xl font-bold text-emerald-900 mb-2">{t.thankYouRating}</h4>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
        <div>
          <h4 className="text-xl font-bold text-slate-800 mb-1">{t.rateResults}</h4>
          <p className="text-sm text-slate-500">{t.rateResultsDesc}</p>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setUserRating(star)}
              className="p-1 transition-all hover:scale-125 cursor-pointer"
            >
              <Star 
                className={cn(
                  "w-8 h-8 transition-colors",
                  star <= userRating ? "fill-amber-400 text-amber-400" : "text-slate-200"
                )} 
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
          <textarea
            value={userFeedback}
            onChange={(e) => setUserFeedback(e.target.value)}
            placeholder={t.feedbackPlaceholder}
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all min-h-[120px] text-slate-900"
          />
        </div>
        
        <button
          onClick={handleRateAnalysis}
          disabled={userRating === 0 || isSubmittingRating}
          className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
        >
          {isSubmittingRating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            t.submitRating
          )}
        </button>
      </div>
    </div>
  );
}
