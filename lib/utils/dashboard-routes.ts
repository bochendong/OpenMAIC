/**
 * 左侧栏「Dashboard」壳层：与课程/课堂内工作区分界，
 * 在此区域内固定展示 Dashboard / 课程商城 / 虚拟讲师 / 个人中心 / 设置。
 */
export function isDashboardRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname;
  if (p === '/') return true;
  if (p === '/my-courses') return true;
  if (p === '/profile' || p.startsWith('/profile/')) return true;
  if (p === '/settings' || p.startsWith('/settings/')) return true;
  if (p === '/live2d' || p.startsWith('/live2d/')) return true;
  /** 课程商城（含详情）属于 Dashboard，不与笔记本商城 `/store` 混用 */
  if (p === '/store/courses' || p.startsWith('/store/courses/')) return true;
  if (p === '/notifications' || p.startsWith('/notifications/')) return true;
  if (p === '/agent-teams' || p.startsWith('/agent-teams/')) return true;
  return false;
}
