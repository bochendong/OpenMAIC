'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Github } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '@/lib/store/auth';

type OauthConfig = { google: boolean; github: boolean };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function RegisterPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const login = useAuthStore((s) => s.login);

  const [oauth, setOauth] = useState<OauthConfig | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [oauthBusy, setOauthBusy] = useState<'google' | 'github' | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/oauth-config');
        const j = (await r.json()) as OauthConfig;
        if (alive) setOauth(j);
      } catch {
        if (alive) setOauth({ google: false, github: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      router.replace('/my-courses');
    }
  }, [status, session, router]);

  const hasOauth = useMemo(() => Boolean(oauth && (oauth.google || oauth.github)), [oauth]);

  const onSubmitLocal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const finalName = name.trim();
    const finalEmail = email.trim().toLowerCase();
    if (!finalName) {
      setError('请输入昵称');
      return;
    }
    if (!isValidEmail(finalEmail)) {
      setError('请输入有效邮箱');
      return;
    }
    login({ name: finalName, email: finalEmail });
    router.push('/my-courses');
  };

  if (status === 'loading' || oauth === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center apple-mesh-bg">
        <div className="size-8 animate-spin rounded-full border-2 border-[#007AFF] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden apple-mesh-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-1 absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.15)_0%,transparent_70%)]" />
        <div className="animate-orb-2 absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.12)_0%,transparent_70%)]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl items-center justify-center px-4 py-16 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="apple-glass rounded-[28px] p-8">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
                注册 OpenMAIC
              </h1>
              <p className="mt-2 text-sm text-[#86868b] dark:text-[#a1a1a6]">
                创建账号后即可开始搭建课程与笔记本。
              </p>
            </div>

            <div className="space-y-5">
              {hasOauth && oauth ? (
                <div className="space-y-3">
                  {oauth.google ? (
                    <button
                      type="button"
                      disabled={oauthBusy !== null}
                      onClick={() => {
                        setOauthBusy('google');
                        void signIn('google', { callbackUrl: '/my-courses' });
                      }}
                      className="apple-btn apple-btn-secondary flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium disabled:opacity-60"
                    >
                      <span className="text-base font-semibold text-[#4285F4]">G</span>
                      使用 Google 注册
                    </button>
                  ) : null}
                  {oauth.github ? (
                    <button
                      type="button"
                      disabled={oauthBusy !== null}
                      onClick={() => {
                        setOauthBusy('github');
                        void signIn('github', { callbackUrl: '/my-courses' });
                      }}
                      className="apple-btn flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] text-sm font-medium text-white shadow-sm transition hover:bg-[#2d2d2f] disabled:opacity-60 dark:bg-white dark:text-[#1d1d1f] dark:hover:bg-[#f5f5f7]"
                    >
                      <Github className="size-5" strokeWidth={1.75} />
                      使用 GitHub 注册
                    </button>
                  ) : null}
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={onSubmitLocal}>
                <div className="space-y-1.5">
                  <label htmlFor="register-name" className="text-xs font-medium text-[#86868b]">
                    昵称
                  </label>
                  <input
                    id="register-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：Dongpo"
                    autoComplete="nickname"
                    className="apple-input h-11 w-full px-3.5 text-sm text-[#1d1d1f] placeholder-[#c7c7cc] outline-none dark:text-white dark:placeholder-[#48484a]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="register-email" className="text-xs font-medium text-[#86868b]">
                    邮箱
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="apple-input h-11 w-full px-3.5 text-sm text-[#1d1d1f] placeholder-[#c7c7cc] outline-none dark:text-white dark:placeholder-[#48484a]"
                  />
                </div>
                {error ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-600 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="apple-btn apple-btn-primary h-11 w-full rounded-xl text-sm"
                >
                  创建账号并进入我的课程
                </button>
              </form>

              <div className="flex items-center justify-between text-xs text-[#86868b] dark:text-[#a1a1a6]">
                <Link href="/" className="hover:text-[#1d1d1f] dark:hover:text-white">
                  返回首页
                </Link>
                <Link href="/login" className="hover:text-[#1d1d1f] dark:hover:text-white">
                  已有账号？去登录
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
