import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import {
  ArrowRight, FileText, Search, Target, Clock, AlertCircle,
  CheckCircle2, Brain, Activity, Key, TrendingUp, Download,
  ChevronRight, GraduationCap, Users, Globe, FileCheck,
  ChevronDown, Sparkles, Zap, ShieldCheck, BarChart3
} from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

const BentoCard = ({ children, className, delay = 0 }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
    className={cn(
      "relative overflow-hidden rounded-[1.5rem] md:rounded-[2rem] border border-slate-200/60 bg-white/80 p-6 md:p-8 backdrop-blur-xl transition-all hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5",
      className
    )}
  >
    {children}
  </motion.div>
);

const FeatureIcon = ({ icon: Icon, color = "primary" }: any) => (
  <div className={cn(
    "mb-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm",
    color === "primary" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
  )}>
    <Icon className="h-7 w-7" />
  </div>
);

const HeroSection = ({ t, login, opacity, scale }: any) => (
  <section className="relative flex min-h-[90vh] w-full flex-col items-center justify-center px-4 pt-20 pb-32">
    <motion.div
      style={{ opacity, scale }}
      className="container relative z-10 mx-auto max-w-6xl text-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-bold text-primary backdrop-blur-md"
      >
        <Sparkles className="h-4 w-4" />
        <span>AI-Powered CV Intelligence</span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="font-sans text-4xl font-extrabold tracking-tight text-slate-900 sm:text-7xl lg:text-8xl"
      >
        {t.heroTitle.split(' ').slice(0, -1).join(' ')} <br className="hidden sm:block" />
        <span className="block mt-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent sm:inline sm:mt-0">
          {t.heroTitle.split(' ').slice(-1)} Smart Insights
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl"
      >
        {t.heroDesc}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row px-4 w-full sm:px-0"
      >
        <button
          onClick={login}
          className="group relative flex h-14 w-full sm:w-auto items-center justify-center gap-2 overflow-hidden rounded-2xl bg-slate-900 px-10 font-bold text-white transition-all hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/20 active:scale-95"
        >
          <Zap className="h-5 w-5 fill-current text-primary" />
          <span>{t.startNow}</span>
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
        <a
          href="https://hr.thanhnghiep.top"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-14 w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-8 font-bold text-slate-900 transition-all hover:bg-slate-50 hover:shadow-lg active:scale-95"
        >
          <span className="truncate">Dành cho nhà tuyển dụng</span>
          <ArrowRight className="h-5 w-5 text-slate-400 shrink-0" />
        </a>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-6 text-sm font-semibold text-slate-400"
      >
        {t.heroSub}
      </motion.p>
    </motion.div>

    {/* Floating Preview */}
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.4, type: 'spring' }}
      className="relative mt-20 w-full max-w-6xl px-4"
    >
      <div className="group relative overflow-hidden rounded-[2.5rem] border border-white/40 bg-white/30 p-2 shadow-2xl backdrop-blur-2xl transition-transform hover:scale-[1.01]">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-accent/5 opacity-0 transition-opacity group-hover:opacity-100" />
        <img
          src="https://thanhnghiep.top/CVMatcher/cv-dash.jpg"
          alt={t.seoTitle || "CV Matcher & Optimizer Dashboard"}
          className="relative z-10 rounded-[2rem] shadow-sm transition-transform"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Decorative Elements */}
      <div className="absolute -top-10 -right-10 h-32 w-32 animate-pulse rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 animate-pulse rounded-full bg-accent/20 blur-3xl" />
    </motion.div>
  </section>
);

const TrustSection = ({ t }: any) => {
  const experts = [
    { name: 'VietnamWorks', url: 'https://www.vietnamworks.com/' },
    { name: 'ITviec', url: 'https://itviec.com/' },
    { name: 'TopCV', url: 'https://www.topcv.vn/' },
    { name: 'CareerViet', url: 'https://careerviet.vn/' },
    { name: 'Việc Làm 24h', url: 'https://vieclam24h.vn/' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/' },
  ];

  return (
    <section className="w-full border-y border-slate-200/60 bg-white/50 py-12 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <p className="mb-8 text-center text-xs font-black uppercase tracking-[0.2em] text-slate-400">
          {t.trustedBy}
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
          {experts.map(expert => (
            <a
              key={expert.name}
              href={expert.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative"
            >
              <span className="font-sans text-xl md:text-2xl font-black italic tracking-tighter text-slate-400 transition-all duration-300 group-hover:text-slate-900 group-hover:scale-110 block">
                {expert.name}
              </span>
              <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-primary transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};


const ProblemSection = ({ t }: any) => (
  <section className="w-full py-32">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-20 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-sans text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl"
        >
          {t.problemTitle}
        </motion.h2>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <BentoCard className="lg:col-span-2">
          <FeatureIcon icon={AlertCircle} color="accent" />
          <h3 className="mb-4 font-sans text-2xl font-bold text-slate-900">{t.problemItem1}</h3>
          <p className="text-slate-500">{t.problemItem2}. Hệ thống ATS tự động loại bỏ các hồ sơ không chứa đúng từ khóa hoặc định dạng không chuẩn.</p>
        </BentoCard>

        <BentoCard>
          <FeatureIcon icon={Clock} />
          <h3 className="mb-4 font-sans text-2xl font-bold text-slate-900">6–10 Giây</h3>
          <p className="text-slate-500">{t.problemItem4}. Bạn cần làm nổi bật giá trị của mình ngay lập tức.</p>
        </BentoCard>

        <BentoCard>
          <FeatureIcon icon={Search} />
          <h3 className="mb-4 font-sans text-2xl font-bold text-slate-900">{t.problemItem3}</h3>
          <p className="text-slate-500">Kỹ năng không khớp khiến AI đánh giá thấp hồ sơ của bạn.</p>
        </BentoCard>

        <BentoCard className="lg:col-span-2 bg-slate-900 text-white border-none shadow-xl shadow-slate-900/20">
          <div className="flex h-full flex-col justify-center">
            <div className="mb-6 flex items-center gap-3">
              <div className="h-2 w-12 rounded-full bg-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">Critical Insight</span>
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

const WhyChooseSection = ({ t }: any) => (
  <section className="w-full bg-slate-900 py-32 text-white">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-24 flex flex-col items-end justify-between gap-8 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <h2 className="font-sans text-4xl font-extrabold tracking-tight sm:text-6xl">
            {t.whyTitle}
          </h2>
        </div>
        <div className="h-1 w-24 bg-primary" />
      </div>

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Target, title: t.feature1Title, desc: t.feature1Desc },
          { icon: ShieldCheck, title: t.feature2Title, desc: t.feature2Desc },
          { icon: Brain, title: t.feature3Title, desc: t.feature3Desc },
          { icon: BarChart3, title: t.feature4Title, desc: t.feature4Desc },
          { icon: Key, title: t.feature5Title, desc: t.feature5Desc },
          { icon: TrendingUp, title: t.feature6Title, desc: t.feature6Desc },
          { icon: FileCheck, title: t.feature7Title, desc: t.feature7Desc },
          { icon: Download, title: t.feature8Title, desc: t.feature8Desc }
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="group"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
              <item.icon className="h-6 w-6" />
            </div>
            <h4 className="mb-4 font-sans text-xl font-bold leading-snug">{item.title}</h4>
            <p className="text-sm leading-relaxed text-slate-400 group-hover:text-slate-300">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const HowItWorksSection = ({ t }: any) => (
  <section className="w-full py-32">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-20 text-center">
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {t.howItWorksTitle}
        </h2>
      </div>

      <div className="relative grid grid-cols-1 gap-8 md:grid-cols-4">
        <div className="absolute top-10 left-0 hidden h-0.5 w-full bg-slate-200 md:block" />

        {[
          { title: t.howItWorksStep1Title, desc: t.howItWorksStep1Desc, icon: Download },
          { title: t.howItWorksStep2Title, desc: t.howItWorksStep2Desc, icon: FileText },
          { title: t.howItWorksStep3Title, desc: t.howItWorksStep3Desc, icon: Brain },
          { title: t.howItWorksStep4Title, desc: t.howItWorksStep4Desc, icon: CheckCircle2 }
        ].map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="relative flex flex-col items-center text-center"
          >
            <div className="relative z-10 mb-8 flex h-20 w-20 items-center justify-center rounded-full border-4 border-slate-50 bg-white shadow-xl shadow-slate-200/50">
              <span className="font-sans text-2xl font-black text-primary">{i + 1}</span>
            </div>
            <h4 className="mb-3 font-sans text-xl font-extrabold text-slate-900">{step.title}</h4>
            <p className="max-w-[200px] text-sm leading-relaxed text-slate-500">{step.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-20 flex flex-col items-center justify-center gap-4 rounded-[2.5rem] bg-primary/5 p-8 text-center border border-primary/10">
        <p className="font-sans text-lg font-bold text-primary">
          {t.howItWorksFooter}
        </p>
      </div>
    </div>
  </section>
);

const DemoResultSection = ({ t }: any) => (
  <section className="w-full bg-white py-32">
    <div className="container mx-auto max-w-5xl px-4">
      <div className="mb-16 text-center">
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-slate-900">{t.resultTitle}</h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="overflow-hidden rounded-[3rem] border border-slate-200 bg-slate-50 shadow-2xl"
      >
        <div className="border-b border-slate-200 bg-white px-8 py-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-amber-400" />
            <div className="h-3 w-3 rounded-full bg-emerald-400" />
            <span className="ml-4 text-xs font-bold uppercase tracking-widest text-slate-400">Analysis Report Preview</span>
          </div>
        </div>

        <div className="p-6 md:p-16">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            <div className="space-y-8">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-sans text-lg font-bold text-slate-700">{t.matchingScore}</span>
                  <span className="font-sans text-3xl font-black text-primary">72%</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '72%' }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-primary"
                  />
                </div>
              </div>
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-sans text-lg font-bold text-slate-700">{t.atsScore}</span>
                  <span className="font-sans text-3xl font-black text-emerald-500">81%</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '81%' }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
                <h4 className="mb-4 flex items-center gap-2 font-sans text-sm font-black uppercase tracking-wider text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {t.missingSkills}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {['SQL', 'Communication', 'Leadership'].map(skill => (
                    <span key={skill} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600">{skill}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
                <h4 className="mb-4 flex items-center gap-2 font-sans text-sm font-black uppercase tracking-wider text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                  {t.strengths}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {['UX Design', 'Figma', 'Research'].map(skill => (
                    <span key={skill} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600">{skill}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 rounded-[2rem] bg-white p-8 border border-slate-100 shadow-sm">
            <h4 className="mb-6 font-sans text-xl font-extrabold text-slate-900">{t.suggestions}</h4>
            <ul className="space-y-4">
              {[t.suggestion1, t.suggestion2, t.suggestion3].map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <span className="text-sm font-medium text-slate-600">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

const StatsSection = ({ t }: any) => (
  <section className="relative w-full overflow-hidden bg-slate-900 py-24 text-white">
    <div className="absolute top-0 left-0 h-full w-full opacity-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#4f46e5,transparent_50%)]" />
    </div>
    <div className="container relative z-10 mx-auto max-w-6xl px-4">
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
        {[
          { val: "35+", label: t.stats1 },
          { val: "98%", label: t.stats2 },
          { val: "2M+", label: t.stats3 }
        ].map((stat, i) => (
          <div key={i} className="text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="font-sans text-6xl font-black tracking-tighter text-white"
            >
              {stat.val}
            </motion.div>
            <div className="mt-2 font-bold uppercase tracking-[0.2em] text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const TargetUsersSection = ({ t }: any) => (
  <section className="w-full py-32">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-20 text-center">
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {t.targetUsersTitle}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-center md:gap-6">
        {[
          { label: t.targetUsersItem1, icon: GraduationCap },
          { label: t.targetUsersItem2, icon: Search },
          { label: t.targetUsersItem3, icon: Users },
          { label: t.targetUsersItem4, icon: Globe },
          { label: t.targetUsersItem5, icon: FileCheck },
        ].map((item, index) => (
          <motion.div
            key={index}
            whileHover={{ y: -5 }}
            className={cn(
              "flex flex-col items-center gap-4 rounded-2xl md:rounded-3xl border border-slate-200 bg-white p-6 md:px-8 md:py-10 text-center transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5",
              index === 4 && "col-span-2 sm:col-span-1"
            )}
          >
            <div className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-xl md:rounded-2xl bg-slate-50 text-primary">
              <item.icon className="h-6 w-6 md:h-8 md:w-8" />
            </div>
            <p className="font-sans text-sm md:text-lg font-bold text-slate-800 leading-tight">{item.label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const CtaSection = ({ t, login }: any) => (
  <section className="w-full pb-32 pt-16 px-4">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className="container relative mx-auto max-w-6xl overflow-hidden rounded-[3rem] bg-primary px-8 py-20 text-center shadow-2xl shadow-primary/30 md:px-20 md:py-32"
    >
      <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative z-10">
        <h2 className="mx-auto max-w-3xl font-sans text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          {t.ctaTitle}
        </h2>
        <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
          <button
            onClick={login}
            className="h-16 rounded-2xl bg-white px-12 font-sans text-xl font-black text-primary transition-all hover:bg-slate-50 hover:shadow-2xl active:scale-95"
          >
            {t.ctaBtn}
          </button>
          <a
            href="https://hr.thanhnghiep.top"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-16 items-center justify-center gap-3 rounded-2xl border-2 border-white/30 bg-white/10 px-10 font-sans text-lg font-bold text-white backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
          >
            <span>Dành cho nhà tuyển dụng</span>
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
        <p className="mt-8 font-sans text-lg font-bold text-white/80">
          {t.ctaSub}
        </p>
      </div>
    </motion.div>
  </section>
);

const FaqSection = ({ t, openFaqIndex, setOpenFaqIndex }: any) => (
  <section className="w-full border-t border-slate-200/60 bg-white py-32">
    <div className="container mx-auto max-w-3xl px-4">
      <div className="mb-20 text-center">
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-slate-900">{t.faqTitle}</h2>
      </div>

      <div className="space-y-6">
        {t.faqItems.map((item: any, index: number) => (
          <motion.div
            layout
            key={index}
            className="group overflow-hidden rounded-[2rem] border border-slate-200 transition-all hover:border-primary/40"
          >
            <button
              onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              className="flex w-full items-center justify-between p-6 md:p-8 text-left transition-colors focus:outline-none group-hover:bg-primary/[0.02]"
            >
              <span className="font-sans text-base md:text-lg font-bold text-slate-800 pr-4">{item.q}</span>
              <div className={cn(
                "flex h-8 w-8 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full transition-all duration-500",
                openFaqIndex === index ? "rotate-180 bg-primary text-white" : "bg-slate-50 text-slate-400"
              )}>
                <ChevronDown className="h-5 w-5 md:h-6 md:w-6" />
              </div>
            </button>
            <AnimatePresence initial={false}>
              {openFaqIndex === index && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                >
                  <div className="px-8 pb-8 text-slate-500 leading-relaxed whitespace-pre-line border-t border-slate-50 pt-6">
                    {item.a}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export function LandingView() {
  const { t } = useUI();
  const { login } = useAuth();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden bg-slate-50 font-body">
      {/* Background Orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[5%] h-[30%] w-[30%] rounded-full bg-accent/10 blur-[100px]" />
        <div className="absolute bottom-[10%] left-[20%] h-[25%] w-[25%] rounded-full bg-indigo-200/30 blur-[80px]" />
      </div>

      <HeroSection t={t} login={login} opacity={opacity} scale={scale} />
      <TrustSection t={t} />
      <ProblemSection t={t} />
      <WhyChooseSection t={t} />
      <HowItWorksSection t={t} />
      <DemoResultSection t={t} />
      <StatsSection t={t} />
      <TargetUsersSection t={t} />
      <CtaSection t={t} login={login} />
      <FaqSection t={t} openFaqIndex={openFaqIndex} setOpenFaqIndex={setOpenFaqIndex} />
    </div>
  );
}

