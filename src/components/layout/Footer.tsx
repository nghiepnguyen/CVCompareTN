import { FileSearch } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { resetAnalyticsConsentPrompt } from '../../lib/ga4';

export function Footer() {
  const { setActiveTab, reportLanguage, t } = useUI();

  return (
    <footer className="relative z-10 border-t border-border bg-primary-light pt-12 pb-24 lg:py-20">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-4 md:grid-cols-2">
          <div className="lg:col-span-2">
            <div
              className="flex items-center gap-3 mb-6 group cursor-pointer"
              onClick={() => {
                setActiveTab('analyze');
                window.scrollTo(0, 0);
              }}
            >
              <div className="relative w-10 h-10 dark:bg-primary bg-accent rounded-xl flex items-center justify-center shadow-xl">
                <div className="absolute inset-0 bg-accent opacity-20 blur-lg rounded-full" />
                <FileSearch className="text-white w-5 h-5 relative z-10" />
              </div>
              <span className="text-xl font-extrabold tracking-tighter text-text-main font-sans">
                cv<span className="text-accent">Fit</span>.pro
              </span>
            </div>
            <p className="text-sm text-text-muted leading-relaxed max-w-sm">{t.footerDesc}</p>
          </div>

          <div>
            <h4 className="font-sans text-xs font-black uppercase tracking-[0.2em] text-text-light mb-6">
              {t.footerPopularKeywords}
            </h4>
            <ul className="text-sm font-medium text-text-muted space-y-3">
              <li className="hover:text-accent transition-colors cursor-default">{t.footerKeyword1}</li>
              <li className="hover:text-accent transition-colors cursor-default">{t.footerKeyword2}</li>
              <li className="hover:text-accent transition-colors cursor-default">{t.footerKeyword3}</li>
              <li className="hover:text-accent transition-colors cursor-default">{t.footerKeyword4}</li>
            </ul>
          </div>

          <div>
            <h4 className="font-sans text-xs font-black uppercase tracking-[0.2em] text-text-light mb-6">
              {t.footerContactSupport}
            </h4>
            <div className="space-y-4">
              <p className="text-sm font-medium text-text-muted">
                {t.footerEmailLabel}{' '}
                <a
                  href={`mailto:${import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}`}
                  className="text-text-main hover:text-accent transition-colors"
                >
                  {import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}
                </a>
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="https://www.facebook.com/Cvfitpro"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="flex h-9 w-9 items-center justify-center rounded-full dark:bg-white/[0.03] bg-surface-muted text-text-muted transition-all hover:bg-accent/10 hover:text-accent active:scale-95 border border-border"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.89h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
                  </svg>
                </a>
                <a
                  href="https://www.linkedin.com/company/cvfitpro/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className="flex h-9 w-9 items-center justify-center rounded-full dark:bg-white/[0.03] bg-surface-muted text-text-muted transition-all hover:bg-accent/10 hover:text-accent active:scale-95 border border-border"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 lg:mt-20 flex flex-col items-center justify-between gap-6 border-t border-border pt-10 md:flex-row">
          <div className="flex flex-wrap gap-8 justify-center md:justify-start text-xs font-bold text-text-light">
            <a
              href={`/${reportLanguage}/privacy`}
              onClick={(e) => { e.preventDefault(); setActiveTab('privacy'); window.scrollTo(0, 0); }}
              className="hover:text-accent transition-colors"
            >
              {t.footerPrivacyPolicy}
            </a>
            <a
              href={`/${reportLanguage}/terms`}
              onClick={(e) => { e.preventDefault(); setActiveTab('terms'); window.scrollTo(0, 0); }}
              className="hover:text-accent transition-colors"
            >
              {t.footerTermsOfService}
            </a>
            <button
              type="button"
              onClick={() => {
                resetAnalyticsConsentPrompt();
                window.scrollTo(0, 0);
              }}
              className="hover:text-accent transition-colors cursor-pointer"
            >
              {t.footerCookieSettings}
            </button>
            <a
              href="https://blog.cvfit.pro"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              {t.footerBlog}
            </a>
            <a
              href={`/${reportLanguage}/about`}
              onClick={(e) => { e.preventDefault(); setActiveTab('about'); window.scrollTo(0, 0); }}
              className="hover:text-accent transition-colors"
            >
              {t.aboutPageTitle}
            </a>
          </div>
          <p className="text-xs font-bold text-text-light text-center md:text-right">
            © {new Date().getFullYear()} {t.appBrandName}. {t.footerCopyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
