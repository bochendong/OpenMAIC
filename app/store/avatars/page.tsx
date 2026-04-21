'use client';

import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarCollectionStoreCard } from '@/components/gamification/avatar-collection-store-card';

export default function AvatarStorePage() {
  return (
    <div className="min-h-full w-full apple-mesh-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-2 absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.08)_0%,transparent_70%)]" />
        <div className="animate-orb-1 absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.06)_0%,transparent_70%)]" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <Button variant="ghost" size="sm" className="-ml-2 mb-4 rounded-lg" asChild>
          <Link href="/store/courses">{'← 课程商城'}</Link>
        </Button>
        <section className="mb-6 apple-glass rounded-[28px] p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-200">
              <ImageIcon className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                抽卡补给站
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                这里不再直接购买资源，而是通过补给站抽取头像与课堂讲师。
              </p>
            </div>
          </div>
        </section>
        <AvatarCollectionStoreCard />
      </main>
    </div>
  );
}
