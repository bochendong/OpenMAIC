'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LogOut, Search, Settings } from 'lucide-react';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAuthStore } from '@/lib/store/auth';
import { useAuthSignOut } from '@/lib/hooks/use-auth-sign-out';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AppCoreNavList } from '@/components/app-core-nav-list';
import { ChatContactsRail } from '@/components/chat-contacts-rail';
import { resolveCourseOrchestratorAvatar } from '@/lib/constants/course-chat';

/** Apple-style glass navigation surface */
const surfaceClass = cn(
  'flex h-full flex-col overflow-hidden apple-glass-heavy',
  'rounded-[20px] transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
);

const scrollClass = cn(
  'min-h-0 flex-1 overflow-y-auto py-2',
  '[&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-900/15',
  'dark:[&::-webkit-scrollbar-thumb]:bg-white/20',
  'hover:[&::-webkit-scrollbar-thumb]:bg-slate-900/25 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/30',
);

export interface AppLeftRailProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

/** 进入这些路由时清空「当前课程」。侧栏「商城」：未选课程 → `/store/courses`（课程商城）；已选课程 → `/store`（笔记本商城） */
const COURSE_CONTEXT_CLEAR_PREFIXES = [
  '/my-courses',
  '/settings',
  '/login',
  '/courses/new',
  '/notifications',
] as const;

export function AppLeftRail({ collapsed, onCollapsedChange }: AppLeftRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const authName = useAuthStore((s) => s.name);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const signOutAndRedirect = useAuthSignOut();

  const courseId = useCurrentCourseStore((s) => s.id);
  const courseName = useCurrentCourseStore((s) => s.name);
  const courseAvatarUrl = useCurrentCourseStore((s) => s.avatarUrl);
  const clearCurrentCourse = useCurrentCourseStore((s) => s.clearCurrentCourse);

  const settingsActive = pathname === '/settings';

  const displayName =
    nickname.trim() || authName.trim() || t('profile.defaultNickname');

  const inCourseContext = Boolean(courseId);
  const resolvedCourseAvatar = resolveCourseOrchestratorAvatar(courseId, courseAvatarUrl);
  const railAvatarSrc = inCourseContext ? resolvedCourseAvatar : avatar;
  const railTitle = inCourseContext ? courseName : displayName;
  const railHref = inCourseContext ? `/course/${courseId}` : '/';
  const railTooltip = inCourseContext ? '课程主页' : '首页';

  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');

  const [contactSearchQuery, setContactSearchQuery] = useState('');

  useEffect(() => {
    if (!isChatPage) setContactSearchQuery('');
  }, [isChatPage]);

  useEffect(() => {
    if (!pathname) return;
    const shouldClear = COURSE_CONTEXT_CLEAR_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (shouldClear) clearCurrentCourse();
  }, [pathname, clearCurrentCourse]);

  const expandIfCollapsed = () => {
    if (collapsed) onCollapsedChange(false);
  };

  return (
    <>
      <aside
        className={cn(
          'pointer-events-none fixed left-4 top-4 z-[1300] h-[calc(100dvh-2rem)]',
          collapsed ? 'w-[88px]' : 'w-[min(270px,calc(100vw-2rem))]',
        )}
        aria-label="主导航"
      >
        <div className={cn('pointer-events-auto h-full', surfaceClass)}>
          {isChatPage ? (
            <div
              className={cn(
                'relative flex shrink-0 items-center gap-2 border-b border-slate-900/[0.08] dark:border-white/[0.08]',
                collapsed ? 'justify-center px-2 py-2' : 'px-2 py-2',
              )}
            >
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:text-foreground"
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              >
                {collapsed ? (
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                ) : (
                  <ChevronLeft className="size-4" strokeWidth={1.75} />
                )}
              </button>
              {!collapsed && (
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    placeholder="搜索联系人…"
                    aria-label="搜索联系人"
                    className="h-8 border-slate-900/[0.12] bg-black/[0.03] pl-8 text-sm dark:border-white/[0.12] dark:bg-white/[0.06]"
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              className={cn(
                'relative shrink-0 border-b border-slate-900/[0.08] dark:border-white/[0.08]',
                collapsed
                  ? 'flex flex-col items-center px-2 py-3'
                  : 'flex flex-col items-center px-4 pb-3 pt-10',
              )}
            >
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:text-foreground',
                  collapsed ? 'mb-2' : 'absolute left-2 top-2',
                )}
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              >
                {collapsed ? (
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                ) : (
                  <ChevronLeft className="size-4" strokeWidth={1.75} />
                )}
              </button>

              {!collapsed && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={railHref}
                        className={cn(
                          'block w-fit outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500',
                          inCourseContext ? 'rounded-2xl' : 'rounded-full',
                        )}
                      >
                        <img
                          src={railAvatarSrc}
                          alt=""
                          className={cn(
                            'size-[72px] object-cover ring-1 ring-black/5 dark:ring-white/10',
                            inCourseContext ? 'rounded-2xl' : 'rounded-full',
                          )}
                        />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{railTooltip}</TooltipContent>
                  </Tooltip>
                  <p className="mt-2 w-full truncate text-center text-sm font-medium text-foreground">
                    {railTitle}
                  </p>
                </>
              )}

              {collapsed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={railHref}
                      className={cn(
                        'block w-fit outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500',
                        inCourseContext ? 'rounded-xl' : 'rounded-full',
                      )}
                    >
                      <img
                        src={railAvatarSrc}
                        alt=""
                        className={cn(
                          'size-10 object-cover ring-1 ring-black/5 dark:ring-white/10',
                          inCourseContext ? 'rounded-xl' : 'rounded-full',
                        )}
                      />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{railTooltip}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}

          {isChatPage ? (
            <nav
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                collapsed ? 'px-1.5' : 'px-2',
              )}
              aria-label="聊天联系人"
            >
              <div className={cn(scrollClass, 'min-h-0 flex-1 px-0')}>
                <Suspense
                  fallback={
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">加载联系人…</div>
                  }
                >
                  <ChatContactsRail
                    courseId={courseId}
                    collapsed={collapsed}
                    courseName={courseName}
                    courseAvatarUrl={resolvedCourseAvatar}
                    searchQuery={contactSearchQuery}
                  />
                </Suspense>
              </div>
            </nav>
          ) : (
            <nav
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                collapsed ? 'px-1.5' : 'px-2',
              )}
              aria-label="页面导航"
            >
              <div className={cn(scrollClass, 'px-0')}>
                <AppCoreNavList
                  collapsed={collapsed}
                  onItemClick={(key) => {
                    if (key === 'chat') expandIfCollapsed();
                  }}
                />
              </div>
            </nav>
          )}

          <div className="shrink-0 border-t border-slate-900/[0.08] dark:border-white/[0.08]">
            {!collapsed ? (
              <div className="flex items-center gap-0.5 px-3 py-3">
                <div className="mr-auto min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight" title={displayName}>
                    {isLoggedIn ? displayName : 'Syntara'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {isLoggedIn ? '已登录' : '本地体验'}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => router.push('/settings')}
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
                        settingsActive &&
                          'bg-violet-600/14 text-foreground dark:bg-violet-400/[0.18]',
                      )}
                      aria-label="设置"
                    >
                      <Settings className="size-[18px]" strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">设置</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => (isLoggedIn ? void signOutAndRedirect() : router.push('/login'))}
                      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={isLoggedIn ? '退出登录' : '登录'}
                    >
                      <LogOut className="size-[18px]" strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{isLoggedIn ? '退出登录' : '登录'}</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-2 py-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => router.push('/settings')}
                      className={cn(
                        'flex size-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
                        settingsActive &&
                          'bg-violet-600/14 text-foreground dark:bg-violet-400/[0.18]',
                      )}
                      aria-label="设置"
                    >
                      <Settings className="size-[18px]" strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">设置</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => (isLoggedIn ? void signOutAndRedirect() : router.push('/login'))}
                      className="flex size-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={isLoggedIn ? '退出登录' : '登录'}
                    >
                      <LogOut className="size-[18px]" strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{isLoggedIn ? '退出登录' : '登录'}</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
