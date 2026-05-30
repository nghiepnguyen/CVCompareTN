import React from 'react';
import { motion } from 'motion/react';
import { Activity, Brain, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { LandingLabels } from './types';
import { SectionHeading, SectionBadge } from './shared';

export function DemoResultSection({ t }: { t: LandingLabels }) {
  return (
    <section className="relative w-full section-padding overflow-hidden">
      <div className="container-premium relative z-10">
        <div className="text-center mb-14">
          <SectionBadge icon={Activity}>Intelligent Analysis</SectionBadge>
        </div>
        <SectionHeading goldLine>{t.resultTitle}</SectionHeading>

        <div className="relative max-w-5xl mx-auto">
          {/* Glass Container */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="group relative overflow-hidden rounded-[2rem] md:rounded-[3rem] border border-white/[0.06] bg-white/[0.02] p-1 shadow-2xl backdrop-blur-3xl"
          >
            <div className="relative overflow-hidden rounded-[1.75rem] md:rounded-[2.75rem] border border-white/[0.06] bg-primary-light">
              {/* Window Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/20 px-6 py-4 md:px-8 backdrop-blur-md">
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-white/[0.03] px-4 py-1 border border-white/[0.05]">
                    <Brain className="h-3 w-3 shrink-0 text-accent" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-text-light whitespace-nowrap">
                      Gemini 3 Engine
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 border border-accent/20 text-accent">
                    <Zap className="h-3 w-3 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap">
                      AI Powered
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex w-12 shrink-0 gap-2 opacity-0 pointer-events-none">
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                </div>
              </div>

              {/* Analysis Content */}
              <div className="relative p-6 sm:p-10 lg:p-16">
                {/* Scanning Pulse Effect */}
                <motion.div
                  animate={{
                    top: ['0%', '100%', '0%'],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="absolute left-0 right-0 z-20 h-px w-full bg-gradient-to-r from-transparent via-accent/50 to-transparent shadow-[0_0_15px_rgba(5,150,105,0.3)] pointer-events-none"
                />

                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
                  {/* Left Side: Scores */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Matching Score */}
                    <div className="group/score rounded-2xl md:rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8 backdrop-blur-sm transition-all duration-500 hover:border-accent/20">
                      <div className="mb-6 flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="block text-[10px] font-semibold uppercase tracking-widest text-text-light">
                            {t.matchingScore}
                          </span>
                          <h4 className="font-sans text-lg font-bold text-text-main">
                            Overall Compatibility
                          </h4>
                        </div>
                        <span className="font-serif text-4xl font-black text-accent-glow">72%</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: '72%' }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.5, delay: 0.3 }}
                          className="absolute h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                        />
                      </div>
                    </div>

                    {/* ATS Score */}
                    <div className="group/score rounded-2xl md:rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8 backdrop-blur-sm transition-all duration-500 hover:border-success/20">
                      <div className="mb-6 flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="block text-[10px] font-semibold uppercase tracking-widest text-text-light">
                            ATS Score
                          </span>
                          <h4 className="font-sans text-lg font-bold text-text-main">
                            System Readability
                          </h4>
                        </div>
                        <span className="font-serif text-4xl font-black text-success">81%</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: '81%' }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.5, delay: 0.5 }}
                          className="absolute h-full rounded-full bg-success"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Insights */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {/* Missing Skills */}
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="rounded-2xl md:rounded-3xl bg-error/5 p-5 md:p-6 border border-error/10 backdrop-blur-sm"
                      >
                        <h4 className="mb-4 flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-wider text-error">
                          <AlertCircle className="h-3 w-3" />
                          {t.missingSkills}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {['SQL', 'Communication', 'Leadership'].map((skill) => (
                            <span
                              key={skill}
                              className="rounded-xl bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-text-muted border border-white/[0.05]"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </motion.div>

                      {/* Strengths */}
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="rounded-2xl md:rounded-3xl bg-success/5 p-5 md:p-6 border border-success/10 backdrop-blur-sm"
                      >
                        <h4 className="mb-4 flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-wider text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          {t.strengths}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {['UX Design', 'Figma', 'Research'].map((skill) => (
                            <span
                              key={skill}
                              className="rounded-xl bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-text-muted border border-white/[0.05]"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    </div>

                    {/* Suggestions */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 }}
                      className="rounded-2xl md:rounded-3xl border border-white/[0.06] bg-white/[0.01] p-6 md:p-8 backdrop-blur-sm"
                    >
                      <h4 className="mb-6 font-sans text-base font-bold text-text-main">
                        {t.suggestions}
                      </h4>
                      <div className="space-y-4">
                        {[t.suggestion1, t.suggestion2, t.suggestion3].map((s, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4 + i * 0.1 }}
                            className="flex items-start gap-4"
                          >
                            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                              <Zap className="h-3 w-3" />
                            </div>
                            <p className="text-sm font-medium text-text-muted leading-relaxed">{s}</p>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Floating decoration */}
          <div className="pointer-events-none absolute -top-12 -right-12 h-64 w-64 rounded-full bg-accent/5 blur-[100px] animate-glow" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-accent/3 blur-[100px] animate-glow" style={{ animationDelay: '2s' }} />
        </div>
      </div>
    </section>
  );
}