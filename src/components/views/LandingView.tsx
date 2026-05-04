import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, FileText, Search, Target, Clock, AlertCircle, CheckCircle2, Brain, Activity, Key, TrendingUp, Download, ChevronRight, GraduationCap, Users, Globe, FileCheck, ChevronDown } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';


const Counter = ({ to, suffix }: any) => <span>{to}{suffix}</span>;

export function LandingView() {
  const { t, reportLanguage } = useUI();
  const { login } = useAuth();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const staggerContainer: any = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  
  const fadeInUp: any = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } }
  };
  
  const scaleIn: any = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 100, damping: 20 } }
  };

  const handleLogin = login;

  return (
    <div className="flex flex-col items-center w-full">
          <div className="flex flex-col items-center w-full">
            {/* Hero Section */}
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={staggerContainer}
              className="text-center py-20 px-4 w-full"
            >
              <motion.h1 
                variants={fadeInUp}
                className="text-5xl sm:text-7xl font-black tracking-tighter mb-6 text-slate-900"
              >
                {t.heroTitle} <span className="text-indigo-600">Smart Insights</span>
              </motion.h1>
              <motion.p 
                variants={fadeInUp}
                className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed"
              >
                {t.heroDesc}
              </motion.p>
              <motion.div 
                variants={fadeInUp}
                className="flex flex-col items-center gap-4 mb-16"
              >
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button onClick={handleLogin} className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 cursor-pointer hover:scale-105 active:scale-95">{t.startNow}</button>
                  <a href="https://hr.thanhnghiep.top" target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-white text-slate-900 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer hover:scale-105 active:scale-95">
                    Dành cho nhà tuyển dụng <ArrowRight className="w-5 h-5" />
                  </a>
                </div>
                <p className="text-sm font-medium text-slate-500">{t.heroSub}</p>
              </motion.div>
              {/* Dashboard Preview */}
              <motion.div 
                variants={scaleIn}
                className="max-w-5xl mx-auto bg-white p-4 rounded-2xl shadow-2xl border border-slate-100"
              >
                <img src="https://thanhnghiep.top/CVMatcher/cv-dash.jpg" alt="Dashboard Preview" className="rounded-xl w-full h-auto" referrerPolicy="no-referrer" />
              </motion.div>
            </motion.div>


            {/* Problem Section */}
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={staggerContainer}
              className="py-20 max-w-6xl w-full px-4"
            >
              <motion.h2 
                variants={fadeInUp}
                className="text-4xl font-black text-center mb-16 tracking-tight text-slate-900"
              >
                {t.problemTitle}
              </motion.h2>
              <motion.div 
                variants={staggerContainer}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-12"
              >
                {[
                  { icon: FileText, text: t.problemItem1 },
                  { icon: Search, text: t.problemItem2 },
                  { icon: Target, text: t.problemItem3 },
                  { icon: Clock, text: t.problemItem4 },
                  { icon: AlertCircle, text: t.problemItem5 }
                ].map((item, i) => (
                  <motion.div 
                    key={i} 
                    variants={fadeInUp}
                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-center flex flex-col items-center"
                  >
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                      <item.icon className="w-8 h-8" />
                    </div>
                    <div className="text-sm font-bold text-slate-900 leading-snug">{item.text}</div>
                  </motion.div>
                ))}
              </motion.div>
              <motion.div 
                variants={fadeInUp}
                className="max-w-4xl mx-auto p-6 bg-slate-50 rounded-2xl text-slate-900 font-bold text-center border border-slate-200"
              >
                {t.problemResult}
              </motion.div>
            </motion.div>

            {/* Why Choose */}
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={staggerContainer}
              className="py-20 max-w-6xl w-full px-4"
            >
              <motion.h2 
                variants={fadeInUp}
                className="text-4xl font-black text-center mb-16 tracking-tight"
              >
                {t.whyTitle}
              </motion.h2>
              <motion.div 
                variants={staggerContainer}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
              >
                {[
                  { icon: Target, title: t.feature1Title, desc: t.feature1Desc },
                  { icon: CheckCircle2, title: t.feature2Title, desc: t.feature2Desc },
                  { icon: Brain, title: t.feature3Title, desc: t.feature3Desc },
                  { icon: Activity, title: t.feature4Title, desc: t.feature4Desc },
                  { icon: Key, title: t.feature5Title, desc: t.feature5Desc },
                  { icon: TrendingUp, title: t.feature6Title, desc: t.feature6Desc },
                  { icon: FileText, title: t.feature7Title, desc: t.feature7Desc },
                  { icon: Download, title: t.feature8Title, desc: t.feature8Desc }
                ].map((item, i) => (
                  <motion.div 
                    key={i} 
                    variants={fadeInUp}
                    className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-center flex flex-col items-center"
                  >
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                      <item.icon className="w-8 h-8" />
                    </div>
                    <div className="text-lg font-black text-slate-900 mb-4">{item.title}</div>
                    <div className="text-sm text-slate-500 leading-relaxed">{item.desc}</div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            {/* How It Works */}
            <motion.div 
              initial="initial"
              whileInView="whileInView"
              viewport={{ once: true, margin: "-100px" }}
              className="py-20 w-full bg-slate-50"
            >
              <div className="max-w-6xl mx-auto px-4">
                <motion.h2 
                  variants={fadeInUp}
                  className="text-4xl font-black text-center mb-16 tracking-tight text-slate-900"
                >
                  {t.howItWorksTitle}
                </motion.h2>
                <motion.div 
                  variants={staggerContainer}
                  className="grid grid-cols-1 md:grid-cols-4 gap-8 relative"
                >
                  {[
                    { title: t.howItWorksStep1Title, desc: t.howItWorksStep1Desc },
                    { title: t.howItWorksStep2Title, desc: t.howItWorksStep2Desc },
                    { title: t.howItWorksStep3Title, desc: t.howItWorksStep3Desc },
                    { title: t.howItWorksStep4Title, desc: t.howItWorksStep4Desc }
                  ].map((step, i) => (
                    <motion.div 
                      key={i} 
                      variants={fadeInUp}
                      className="relative flex flex-col items-center text-center"
                    >
                      <div className="w-20 h-20 bg-white text-indigo-600 rounded-full flex items-center justify-center font-black text-3xl mb-6 shadow-sm border border-slate-100">
                        {i + 1}
                      </div>
                      <div className="text-lg font-black text-slate-900 mb-2">{step.title}</div>
                      <div className="text-sm text-slate-500 leading-relaxed max-w-[200px]">{step.desc}</div>
                      {i < 3 && (
                        <div className="hidden md:block absolute top-10 -right-4 text-slate-300">
                          <ChevronRight className="w-8 h-8" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
                <motion.p 
                  variants={fadeInUp}
                  className="text-center text-slate-500 mt-16 font-medium"
                >
                  {t.howItWorksFooter}
                </motion.p>
              </div>
            </motion.div>

            {/* Demo Result Section */}
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
              className="py-20 w-full bg-white rounded-t-3xl"
            >
              <div className="max-w-4xl mx-auto px-4">
                <h2 className="text-4xl font-black text-center mb-16 tracking-tight text-slate-900">{t.resultTitle}</h2>
                <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10">
                    <div>
                      <div className="flex justify-between mb-2 text-sm font-bold text-slate-700"><span>{t.matchingScore}</span><span>72%</span></div>
                      <div className="w-full bg-slate-200 rounded-full h-3"><div className="bg-indigo-600 h-3 rounded-full" style={{width: '72%'}}></div></div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-2 text-sm font-bold text-slate-700"><span>{t.atsScore}</span><span>81%</span></div>
                      <div className="w-full bg-slate-200 rounded-full h-3"><div className="bg-emerald-500 h-3 rounded-full" style={{width: '81%'}}></div></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-bold text-slate-900 mb-4">{t.missingSkills}</h4>
                      <div className="flex flex-wrap gap-2">
                        {['SQL', 'Communication', 'Leadership'].map(skill => <span key={skill} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">{skill}</span>)}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 mb-4">{t.strengths}</h4>
                      <div className="flex flex-wrap gap-2">
                        {['UX Design', 'Figma', 'User Research'].map(skill => <span key={skill} className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{skill}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-10">
                    <h4 className="font-bold text-slate-900 mb-4">{t.suggestions}</h4>
                    <ul className="space-y-2 text-sm text-slate-600">
                      {[t.suggestion1, t.suggestion2, t.suggestion3].map((s, i) => <li key={i} className="flex items-start gap-2">✅ {s}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
              className="py-20 w-full bg-slate-900 text-white text-center"
            >
              <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-12">
                <div><div className="text-5xl font-black mb-2"><Counter from={0} to={35} suffix="+" /></div><div className="text-slate-400 font-medium">{t.stats1}</div></div>
                <div><div className="text-5xl font-black mb-2"><Counter from={0} to={98} suffix="%" /></div><div className="text-slate-400 font-medium">{t.stats2}</div></div>
                <div><div className="text-5xl font-black mb-2"><Counter from={0} to={2} suffix="M+" /></div><div className="text-slate-400 font-medium">{t.stats3}</div></div>
              </div>
            </motion.div>

            {/* Target Users Section */}
            <motion.section 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={staggerContainer}
              className="w-full py-20 bg-white rounded-b-3xl"
            >
              <div className="container mx-auto px-4 text-center">
                <motion.h2 
                  variants={fadeInUp}
                  className="text-3xl md:text-4xl font-bold text-slate-900 mb-12"
                >
                  {t.targetUsersTitle}
                </motion.h2>
                <motion.div 
                  variants={staggerContainer}
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6"
                >
                  {[
                    { label: t.targetUsersItem1, icon: GraduationCap },
                    { label: t.targetUsersItem2, icon: Search },
                    { label: t.targetUsersItem3, icon: Users },
                    { label: t.targetUsersItem4, icon: Globe },
                    { label: t.targetUsersItem5, icon: FileCheck },
                  ].map((item, index) => (
                    <motion.div 
                      key={index} 
                      variants={fadeInUp}
                      className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow flex flex-col items-center gap-4"
                    >
                      <item.icon className="w-8 h-8 text-indigo-600" />
                      <p className="font-semibold text-slate-800">{item.label}</p>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </motion.section>

            {/* CTA Section */}
            <motion.section 
              variants={scaleIn}
              initial="initial"
              whileInView="whileInView"
              viewport={{ once: true, margin: "-100px" }}
              className="w-full py-12 px-4"
            >
              <div className="container mx-auto max-w-5xl bg-indigo-600 rounded-3xl p-8 md:p-16 text-center shadow-xl">
                <motion.h2 
                  variants={fadeInUp}
                  className="text-2xl md:text-4xl font-bold text-white mb-8 tracking-tight"
                >
                  {t.ctaTitle}
                </motion.h2>
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
                  <motion.button 
                    variants={fadeInUp}
                    onClick={handleLogin}
                    className="px-8 py-4 bg-white text-indigo-600 font-bold rounded-full text-lg hover:bg-slate-100 transition-all shadow-lg hover:shadow-indigo-300/50 cursor-pointer hover:scale-105 active:scale-95"
                  >
                    {t.ctaBtn}
                  </motion.button>
                  <motion.a 
                    variants={fadeInUp}
                    href="https://hr.thanhnghiep.top" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="px-8 py-4 bg-indigo-500 text-white font-bold rounded-full text-lg hover:bg-indigo-400 transition-all shadow-lg hover:shadow-indigo-400/50 flex items-center justify-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
                  >
                    Dành cho nhà tuyển dụng <ArrowRight className="w-4 h-4" />
                  </motion.a>
                </div>
                <motion.p 
                  variants={fadeInUp}
                  className="text-indigo-100 font-medium text-sm"
                >
                  {t.ctaSub}
                </motion.p>
              </div>
            </motion.section>

            {/* FAQ Section */}
            <motion.section 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
              className="w-full py-20 bg-slate-50"
            >
              <div className="w-full max-w-3xl mx-auto px-4">
                <h2 className="text-3xl md:text-4xl font-black text-center mb-12 tracking-tight text-slate-900">{t.faqTitle}</h2>
                <div className="space-y-4">
                  {t.faqItems.map((item: any, index: number) => (
                    <motion.div 
                      layout
                      key={index} 
                      className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all hover:border-indigo-200"
                    >
                      <button 
                        onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                        className="w-full flex items-center justify-between p-6 text-left focus:outline-none"
                      >
                        <span className="font-bold text-slate-800 pr-8 flex-1">{item.q}</span>
                        <div className={cn(
                          "shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center transition-transform duration-300",
                          openFaqIndex === index ? "rotate-180 bg-indigo-50 text-indigo-600" : "text-slate-400"
                        )}>
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      </button>
                      <AnimatePresence initial={false}>
                        {openFaqIndex === index && (
                          <motion.div 
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div className="px-6 pb-6 text-slate-600 text-sm leading-relaxed whitespace-pre-line border-t border-slate-50 pt-4">
                              {item.a}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.section>
          </div>
    </div>
  );
}
