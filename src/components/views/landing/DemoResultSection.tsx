import React from 'react';
import { motion } from 'motion/react';
import { Activity, Brain, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { LandingLabels } from './types';

export function DemoResultSection({ t }: { t: LandingLabels }) {
  return (
  <section className="w-full bg-surface-secondary py-32 overflow-hidden">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-light px-4 py-1.5 text-xs font-black uppercase tracking-widest text-accent backdrop-blur-md mb-6"
        >
          <Activity className="h-3 w-3" />
          <span>Intelligent Analysis</span>
        </motion.div>
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-text-main sm:text-6xl">
          {t.resultTitle}
        </h2>
      </div>

      <div className="relative">
        {/* Glass Container */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="group relative overflow-hidden rounded-[3.5rem] border border-white/40 bg-white/40 p-1 shadow-2xl backdrop-blur-3xl"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 to-accent/5 opacity-50" />
          
          <div className="relative overflow-hidden rounded-[3rem] border border-border bg-surface/80 shadow-inner">
            {/* Window Header */}
            <div className="flex items-center justify-between border-b border-border bg-surface-secondary/50 px-8 py-4 backdrop-blur-md">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-border" />
                <div className="h-3 w-3 rounded-full bg-border" />
                <div className="h-3 w-3 rounded-full bg-border" />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-surface/50 px-4 py-1 border border-border/50 shadow-sm">
                  <Brain className="h-3 w-3 shrink-0 text-accent" aria-hidden />
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-light whitespace-nowrap">
                    Gemini 3 Engine Powered
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 border border-accent/20 text-accent shadow-sm">
                  <Zap className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                    AI Powered
                  </span>
                </div>
              </div>
              <div className="flex w-12 shrink-0 gap-2 opacity-0 pointer-events-none" aria-hidden>
                <div className="h-3 w-3 rounded-full bg-border" />
                <div className="h-3 w-3 rounded-full bg-border" />
                <div className="h-3 w-3 rounded-full bg-border" />
              </div>
            </div>

            {/* Analysis Content */}
            <div className="relative p-6 sm:p-12 lg:p-20">
              {/* Scanning Pulse Effect */}
              <motion.div 
                animate={{ 
                  top: ['0%', '100%', '0%'],
                  opacity: [0, 1, 0]
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity, 
                  ease: "linear" 
                }}
                className="absolute left-0 right-0 z-20 h-px w-full bg-gradient-to-r from-transparent via-accent/50 to-transparent shadow-[0_0_15px_rgba(79,70,229,0.3)]"
              />

              <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
                {/* Left Side: Scores */}
                <div className="lg:col-span-5 space-y-8">
                  <div className="relative group/score rounded-3xl border border-border bg-surface p-8 shadow-sm transition-all hover:border-accent/20 hover:shadow-xl hover:shadow-accent/5">
                    <div className="mb-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="block text-xs font-black uppercase tracking-widest text-text-light">{t.matchingScore}</span>
                        <h4 className="font-sans text-xl font-bold text-text-main">Overall Compatibility</h4>
                      </div>
                      <span className="font-sans text-4xl font-black text-accent">72%</span>
                    </div>
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: '72%' }}
                        transition={{ duration: 1.5, delay: 0.5 }}
                        className="absolute h-full bg-gradient-to-r from-accent to-accent-hover"
                      />
                    </div>
                  </div>

                  <div className="relative group/score rounded-3xl border border-border bg-surface p-8 shadow-sm transition-all hover:border-success/20 hover:shadow-xl hover:shadow-success/5">
                    <div className="mb-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="block text-xs font-black uppercase tracking-widest text-text-light">{t.atsScore}</span>
                        <h4 className="font-sans text-xl font-bold text-text-main">System Readability</h4>
                      </div>
                      <span className="font-sans text-4xl font-black text-success">81%</span>
                    </div>
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: '81%' }}
                        transition={{ duration: 1.5, delay: 0.7 }}
                        className="absolute h-full bg-success"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Side: Insights */}
                <div className="lg:col-span-7 space-y-8">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      className="rounded-3xl bg-error-light/50 p-6 border border-error-light"
                    >
                      <h4 className="mb-4 flex items-center gap-2 font-sans text-xs font-black uppercase tracking-widest text-error">
                        <AlertCircle className="h-3 w-3" />
                        {t.missingSkills}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {['SQL', 'Communication', 'Leadership'].map(skill => (
                          <span key={skill} className="rounded-xl bg-surface px-3 py-1.5 text-[10px] font-black text-error shadow-sm border border-error-light">{skill}</span>
                        ))}
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 }}
                      className="rounded-3xl bg-success-light/50 p-6 border border-success-light"
                    >
                      <h4 className="mb-4 flex items-center gap-2 font-sans text-xs font-black uppercase tracking-widest text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        {t.strengths}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {['UX Design', 'Figma', 'Research'].map(skill => (
                          <span key={skill} className="rounded-xl bg-surface px-3 py-1.5 text-[10px] font-black text-success shadow-sm border border-success-light">{skill}</span>
                        ))}
                      </div>
                    </motion.div>
                  </div>

                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4 }}
                    className="rounded-3xl border border-border bg-surface-secondary/50 p-8"
                  >
                    <h4 className="mb-6 font-sans text-lg font-extrabold text-text-main">{t.suggestions}</h4>
                    <div className="space-y-4">
                      {[t.suggestion1, t.suggestion2, t.suggestion3].map((s, i) => (
                        <motion.div 
                          key={i} 
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6 + (i * 0.1) }}
                          className="flex items-start gap-4"
                        >
                          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                            <Zap className="h-3 w-3" />
                          </div>
                          <p className="text-sm font-bold text-text-muted">{s}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Floating Accent Elements */}
        <div className="absolute -top-12 -right-12 -z-10 h-64 w-64 rounded-full bg-accent/10 blur-[100px] animate-pulse" />
        <div className="absolute -bottom-12 -left-12 -z-10 h-64 w-64 rounded-full bg-accent/10 blur-[100px] animate-pulse" />
      </div>
    </div>
  </section>
);

}
