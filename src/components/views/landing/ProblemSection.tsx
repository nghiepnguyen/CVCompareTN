import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Clock, Search } from 'lucide-react';
import type { LandingLabels } from './types';
import { BentoCard, FeatureIcon } from './shared';

export function ProblemSection({ t }: { t: LandingLabels }) {
  return (
  <section className="w-full py-32">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-20 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-sans text-4xl font-extrabold tracking-tight text-text-main sm:text-5xl"
        >
          {t.problemTitle}
        </motion.h2>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <BentoCard className="lg:col-span-2">
          <FeatureIcon icon={AlertCircle} color="accent" />
          <h3 className="mb-4 font-sans text-2xl font-bold text-text-main">{t.problemItem1}</h3>
          <p className="text-text-muted">{t.problemItem2}. Hệ thống ATS tự động loại bỏ các hồ sơ không chứa đúng từ khóa hoặc định dạng không chuẩn.</p>
        </BentoCard>

        <BentoCard>
          <FeatureIcon icon={Clock} />
          <h3 className="mb-4 font-sans text-2xl font-bold text-text-main">6–10 Giây</h3>
          <p className="text-text-muted">{t.problemItem4}. Bạn cần làm nổi bật giá trị của mình ngay lập tức.</p>
        </BentoCard>

        <BentoCard>
          <FeatureIcon icon={Search} />
          <h3 className="mb-4 font-sans text-2xl font-bold text-text-main">{t.problemItem3}</h3>
          <p className="text-text-muted">Kỹ năng không khớp khiến AI đánh giá thấp hồ sơ của bạn.</p>
        </BentoCard>

        <BentoCard className="lg:col-span-2 bg-text-main text-white border-none shadow-xl shadow-slate-900/20">
          <div className="flex h-full flex-col justify-center">
            <div className="mb-6 flex items-center gap-3">
              <div className="h-2 w-12 rounded-full bg-accent" />
              <span className="text-xs font-black uppercase tracking-widest text-accent">Critical Insight</span>
            </div>
            <h3 className="mb-4 font-sans text-3xl font-extrabold leading-tight">
              {t.problemResult}
            </h3>
            <p className="text-slate-400">Đừng để nỗ lực của bạn trở nên vô ích chỉ vì thiếu sự chuẩn bị về mặt kỹ thuật.</p>
          </div>
        </BentoCard>
      </div>
    </div>
  </section>
);

}
