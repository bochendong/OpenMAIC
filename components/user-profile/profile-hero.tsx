'use client';

import { ProfileAvatarPicker } from './profile-avatar-picker';

type ProfileHeroProps = {
  title?: string;
  description?: string;
};

export function ProfileHero({
  title = '个人中心',
  description = '在这里统一管理头像、昵称、个人简介，并查看你自己的模型调用与 token 用量趋势。',
}: ProfileHeroProps) {
  return (
    <section className="apple-glass rounded-[28px] p-6 md:p-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(12rem,17.5rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="order-2 min-w-0 lg:order-1">
          <div className="mx-auto w-full max-w-[17.5rem] lg:mx-0">
            <ProfileAvatarPicker size="lg" />
          </div>
        </div>
        <div className="order-1 min-w-0 lg:order-2">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            {title}
          </h1>
          <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}
