'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ArrowRight,
  Languages,
  MessageSquareText,
  Presentation,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { SyntaraMark } from '@/components/brand/syntara-mark';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import type { PPTShapeElement, PPTTextElement, Slide } from '@/lib/types/slides';
import type { StageListItem } from '@/lib/utils/stage-storage';

const BASE_THEME = {
  backgroundColor: '#f8fafc',
  themeColors: ['#2563eb', '#0f172a', '#f59e0b', '#14b8a6'],
  fontColor: '#0f172a',
  fontName: 'Microsoft YaHei',
};

const RECT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

function createTextElement(args: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  content: string;
  defaultColor?: string;
  textType?: PPTTextElement['textType'];
  fill?: string;
}): PPTTextElement {
  return {
    id: args.id,
    type: 'text',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    content: args.content,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: args.defaultColor ?? '#0f172a',
    textType: args.textType,
    lineHeight: 1.35,
    fill: args.fill,
  };
}

function createRectElement(args: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  opacity?: number;
}): PPTShapeElement {
  return {
    id: args.id,
    type: 'shape',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    viewBox: [200, 200],
    path: RECT_PATH,
    fixedRatio: false,
    fill: args.fill,
    opacity: args.opacity,
  };
}

function buildNotebookSlide(args: {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  accent: string;
  note: string;
  bulletA: string;
  bulletB: string;
}): Slide {
  return {
    id: args.id,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: BASE_THEME,
    background: {
      type: 'gradient',
      gradient: {
        type: 'linear',
        rotate: 135,
        colors: [
          { pos: 0, color: '#fffaf0' },
          { pos: 60, color: '#eef4ff' },
          { pos: 100, color: '#f8fafc' },
        ],
      },
    },
    elements: [
      createRectElement({
        id: `${args.id}-panel-dark`,
        left: 560,
        top: 88,
        width: 270,
        height: 126,
        fill: '#0f172a',
      }),
      createRectElement({
        id: `${args.id}-panel-accent`,
        left: 622,
        top: 256,
        width: 248,
        height: 134,
        fill: args.accent,
      }),
      createRectElement({
        id: `${args.id}-panel-soft`,
        left: 718,
        top: 120,
        width: 180,
        height: 92,
        fill: '#ffffff',
        opacity: 0.9,
      }),
      createTextElement({
        id: `${args.id}-kicker`,
        left: 72,
        top: 72,
        width: 280,
        height: 30,
        defaultColor: '#2563eb',
        content: `<p style="font-size:16px;font-weight:700;color:#2563eb;">${args.kicker}</p>`,
      }),
      createTextElement({
        id: `${args.id}-title`,
        left: 72,
        top: 104,
        width: 430,
        height: 108,
        textType: 'title',
        content: `<p style="font-size:34px;font-weight:800;color:#0f172a;">${args.title}</p><p style="font-size:19px;color:#475569;">${args.subtitle}</p>`,
      }),
      createTextElement({
        id: `${args.id}-bullets`,
        left: 72,
        top: 248,
        width: 430,
        height: 124,
        textType: 'content',
        content: `<p style="font-size:18px;color:#0f172a;">1. ${args.bulletA}</p><p style="font-size:18px;color:#0f172a;">2. ${args.bulletB}</p><p style="font-size:18px;color:#0f172a;">3. 用页面、讲解、练习继续展开</p>`,
      }),
      createTextElement({
        id: `${args.id}-note-dark`,
        left: 586,
        top: 114,
        width: 210,
        height: 70,
        defaultColor: '#f8fafc',
        content: `<p style="font-size:26px;font-weight:700;color:#f8fafc;">Notebook</p><p style="font-size:14px;color:#cbd5e1;">从主题到可讲解的课堂页面</p>`,
      }),
      createTextElement({
        id: `${args.id}-note-accent`,
        left: 648,
        top: 286,
        width: 190,
        height: 74,
        defaultColor: '#0f172a',
        content: `<p style="font-size:24px;font-weight:700;color:#0f172a;">${args.note}</p><p style="font-size:14px;color:#334155;">真实组件预览</p>`,
      }),
    ],
  };
}

const HERO_SLIDE = buildNotebookSlide({
  id: 'home-hero-slide',
  kicker: 'AI Lesson Flow',
  title: '矩阵与线性系统',
  subtitle: '从 Ax = b 到 RREF，再过渡到矩阵运算与乘法',
  accent: '#fbbf24',
  note: 'RREF',
  bulletA: '先把方程组写成增广矩阵',
  bulletB: '用高斯消元判断唯一解、无穷多解或无解',
});

const STORE_SLIDES: Slide[] = [
  buildNotebookSlide({
    id: 'store-slide-1',
    kicker: 'University Course',
    title: '线性代数导学',
    subtitle: '把抽象概念拆成例题、讲解和练习',
    accent: '#60a5fa',
    note: 'Ax=b',
    bulletA: '概念页和例题页交替推进',
    bulletB: '课堂讲解和聊天问答打通',
  }),
  buildNotebookSlide({
    id: 'store-slide-2',
    kicker: 'Lab Notebook',
    title: '概率图模型速览',
    subtitle: '把研究阅读变成可以追问的课堂',
    accent: '#34d399',
    note: 'MAP',
    bulletA: '论文要点先整理成结构页',
    bulletB: '关键公式和图表在讲解中展开',
  }),
  buildNotebookSlide({
    id: 'store-slide-3',
    kicker: 'Skill Sprint',
    title: 'Python 数据分析',
    subtitle: '边讲代码，边讨论，边卖模板',
    accent: '#f472b6',
    note: 'Code',
    bulletA: '代码块、表格和问答同屏衔接',
    bulletB: '适合快速做演示、复用、售卖',
  }),
];

function ResponsiveSlideShowcase({ slide, speechText }: { slide: Slide; speechText: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-[22px] bg-slate-100"
        style={{ aspectRatio: '16 / 9' }}
      >
        {frameWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={frameWidth}
            viewportSize={slide.viewportSize}
            viewportRatio={slide.viewportRatio}
          />
        ) : null}
        <TalkingAvatarOverlay
          speaking
          cadence="active"
          speechText={speechText}
          className="right-4 top-4 w-36 sm:w-44"
        />
        <div className="absolute bottom-4 left-4 max-w-[250px] rounded-2xl bg-slate-950/88 px-4 py-3 text-left text-white shadow-lg">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Live teaching</p>
          <p className="mt-1 text-sm font-semibold">{speechText}</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const isZh = locale === 'zh-CN';
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const authMode = useAuthStore((state) => state.authMode);
  const logout = useAuthStore((state) => state.logout);
  const currentCourseName = useCurrentCourseStore((state) => state.name);

  const copy = useMemo(
    () =>
      isZh
        ? {
            heroBadge: '真实组件 · Mock Data',
            heroTitle: '把首页改成真正的产品入口',
            heroDescription:
              '首页不再堆很多无关模块，而是直接展示 Syntara 最核心的三块能力：幻灯片加 Live2D 讲解、聊天协作、内容商城。',
            primaryCta: isLoggedIn ? '我的课程' : '登录体验',
            secondaryCta: '打开聊天',
            tertiaryCta: '进入商城',
            currentCourse: currentCourseName
              ? `当前课程：${currentCourseName}`
              : '支持本地优先快速体验',
            sections: {
              slide: {
                badge: '幻灯片 + Live2D',
                title: '课堂页直接就是产品本体',
                description:
                  '这里不是一张宣传海报，而是直接放真实 slide 缩略图和 Live2D 讲解人。以后首页想展示新能力，也应该尽量走真实组件。',
              },
              chat: {
                badge: '聊天',
                title: '聊天预览直接复用消息组件',
                description:
                  '首页上的问答区不再自造一套样式，而是直接复用站内聊天消息组件和输入框，只是这里填的是 mock data。',
                prompt: '请把这页再补一个完整的高斯消元例题',
              },
              store: {
                badge: '商城',
                title: '商城区直接放真实卡片',
                description:
                  '课程卡片、封面 slide、标签和按钮都沿用站内真实组件。首页只是提前把用户会看到的内容样子摆出来。',
                action: '查看模板',
              },
            },
            chatMessages: [
              {
                role: 'user' as const,
                text: '为什么我们要把线性系统写成矩阵，而不是一直写很多方程？',
              },
              {
                role: 'assistant' as const,
                text: '因为矩阵把重复的系数结构统一起来，做消元、讲算法、写程序都会更清楚。',
              },
              {
                role: 'user' as const,
                text: '那判断唯一解、无穷多解、无解的时候，讲课最容易混淆的点是什么？',
              },
              {
                role: 'assistant' as const,
                text: '关键是看化简后的行：有没有矛盾行、有没有自由变量，而不是一上来就背术语。',
              },
            ],
            speech: '现在把线性系统写成 Ax = b，再通过 RREF 判断解的情况。',
          }
        : {
            heroBadge: 'Real Components · Mock Data',
            heroTitle: 'Turn the homepage into a real product surface',
            heroDescription:
              'The homepage now focuses on the three product surfaces that matter most: slides with Live2D teaching, chat collaboration, and the marketplace.',
            primaryCta: isLoggedIn ? 'My courses' : 'Sign in',
            secondaryCta: 'Open chat',
            tertiaryCta: 'Open store',
            currentCourse: currentCourseName
              ? `Current course: ${currentCourseName}`
              : 'Works in fast local-first mode',
            sections: {
              slide: {
                badge: 'Slides + Live2D',
                title: 'The classroom preview is the real product',
                description:
                  'This is not a fake poster. We reuse the real slide thumbnail and the real Live2D presenter overlay directly on the homepage.',
              },
              chat: {
                badge: 'Chat',
                title: 'The chat preview uses the real message components',
                description:
                  'Instead of drawing a fake chat mockup, the homepage uses the site message components and input field with mocked content.',
                prompt: 'Add one full Gaussian elimination example to this lesson',
              },
              store: {
                badge: 'Marketplace',
                title: 'The store section uses the real gallery cards',
                description:
                  'Course cards, slide covers, tags, and action buttons all come from the real marketplace component stack.',
                action: 'View template',
              },
            },
            chatMessages: [
              {
                role: 'user' as const,
                text: 'Why should we rewrite a linear system as a matrix instead of keeping many equations?',
              },
              {
                role: 'assistant' as const,
                text: 'Because matrices compress the repeated coefficient structure and make elimination, teaching, and programming far clearer.',
              },
              {
                role: 'user' as const,
                text: 'What is the easiest thing to confuse when deciding one solution, infinitely many, or no solution?',
              },
              {
                role: 'assistant' as const,
                text: 'Focus on the reduced rows: contradictory rows mean no solution, free variables mean infinitely many, otherwise you get a unique one.',
              },
            ],
            speech: 'Rewrite the system as Ax = b, then use RREF to classify the solution.',
          },
    [currentCourseName, isLoggedIn, isZh],
  );

  const storeCards = useMemo<StageListItem[]>(
    () => [
      {
        id: 'mock-stage-1',
        name: isZh ? '线性代数导学模板' : 'Linear Algebra Starter',
        description: isZh
          ? '适合做定义页、例题页、课堂讲解页的一整套模板。'
          : 'A reusable notebook template for concepts, worked examples, and classroom delivery.',
        sceneCount: 18,
        tags: isZh
          ? ['大学课程', '矩阵', '例题密集']
          : ['University', 'Matrices', 'Worked examples'],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
        updatedAt: Date.now() - 1000 * 60 * 30,
      },
      {
        id: 'mock-stage-2',
        name: isZh ? '论文讲读课堂模板' : 'Paper Reading Deck',
        description: isZh
          ? '适合把论文结构拆成章节、公式讲解、讨论与追问。'
          : 'Good for turning papers into sections, equation walkthroughs, and live discussion.',
        sceneCount: 12,
        tags: isZh ? ['科研', '论文讲解', '互动讨论'] : ['Research', 'Papers', 'Discussion'],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 9,
        updatedAt: Date.now() - 1000 * 60 * 90,
      },
      {
        id: 'mock-stage-3',
        name: isZh ? '代码教学快启包' : 'Code Teaching Pack',
        description: isZh
          ? '适合边展示代码、边聊天答疑、边做知识商品化。'
          : 'Designed for code teaching, discussion, and packaging reusable learning products.',
        sceneCount: 15,
        tags: isZh ? ['编程', '商城', '课堂演示'] : ['Programming', 'Store', 'Classroom'],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
        updatedAt: Date.now() - 1000 * 60 * 60 * 5,
      },
    ],
    [isZh],
  );

  const handleLogout = useCallback(async () => {
    logout();
    if (authMode === 'oauth') {
      await signOut({ callbackUrl: '/' });
      return;
    }
    router.push('/');
  }, [authMode, logout, router]);

  const goToMyCoursesOrLogin = useCallback(() => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    router.push('/my-courses');
  }, [isLoggedIn, router]);

  const goToChat = useCallback(() => {
    router.push(isLoggedIn ? '/chat' : '/login');
  }, [isLoggedIn, router]);

  const goToStore = useCallback(() => {
    router.push(isLoggedIn ? '/store' : '/login');
  }, [isLoggedIn, router]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#f8fbff_48%,#ffffff_100%)] text-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-[28rem] w-[28rem] rounded-full bg-sky-200/35 blur-3xl" />
        <div className="absolute right-[-6%] top-[16%] h-[24rem] w-[24rem] rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[25%] h-[26rem] w-[26rem] rounded-full bg-violet-200/25 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <SyntaraMark />
            <div>
              <p className="text-base font-semibold tracking-tight">Syntara</p>
              <p className="text-xs text-slate-500">Slides, chat, marketplace</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setLocale(isZh ? 'en-US' : 'zh-CN')}
            >
              <Languages className="size-4" />
              {isZh ? 'English' : '中文'}
            </Button>
            <Button type="button" size="sm" className="rounded-full" onClick={goToMyCoursesOrLogin}>
              {copy.primaryCta}
            </Button>
            {isLoggedIn ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={handleLogout}
              >
                {isZh ? '退出' : 'Log out'}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pb-20 pt-8 md:px-8 md:pt-12">
        <section className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="space-y-6">
            <Badge
              variant="outline"
              className="rounded-full border-slate-300 bg-white/75 px-3 py-1 text-slate-700"
            >
              <Sparkles className="size-3.5" />
              {copy.heroBadge}
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
                {copy.heroTitle}
              </h1>
              <p className="max-w-xl text-base leading-8 text-slate-600 md:text-lg">
                {copy.heroDescription}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" size="lg" className="rounded-full px-5" onClick={goToMyCoursesOrLogin}>
                {copy.primaryCta}
                <ArrowRight className="size-4" />
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="rounded-full px-5"
                onClick={goToChat}
              >
                {copy.secondaryCta}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                className="rounded-full px-4"
                onClick={goToStore}
              >
                {copy.tertiaryCta}
              </Button>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5">
                {copy.currentCourse}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5">
                {isZh ? '首页全部使用真实组件预览' : 'Real components across the homepage'}
              </span>
            </div>
          </div>

          <ResponsiveSlideShowcase slide={HERO_SLIDE} speechText={copy.speech} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border border-slate-200/80 bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-3">
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-slate-50 text-slate-700"
              >
                <Presentation className="size-3.5" />
                {copy.sections.slide.badge}
              </Badge>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {copy.sections.slide.title}
              </CardTitle>
              <CardDescription className="max-w-lg text-sm leading-7 text-slate-600">
                {copy.sections.slide.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="font-medium text-slate-900">
                  {isZh ? '适合首页保留的内容' : 'What belongs on the homepage'}
                </p>
                <p className="mt-1 leading-7">
                  {isZh
                    ? '讲解页、Live2D、课程内容本身都是真实产品能力，所以首页应该优先展示这些，而不是再另外画一套虚假的说明图。'
                    : 'Slides, Live2D, and lesson content are already real product surfaces, so the homepage should show them instead of separate fake artwork.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200/80 bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-3">
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-slate-50 text-slate-700"
              >
                <MessageSquareText className="size-3.5" />
                {copy.sections.chat.badge}
              </Badge>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {copy.sections.chat.title}
              </CardTitle>
              <CardDescription className="max-w-lg text-sm leading-7 text-slate-600">
                {copy.sections.chat.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-2 pb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Notebook Copilot</p>
                    <p className="text-xs text-slate-500">
                      {isZh
                        ? '已连接到课程和课堂上下文'
                        : 'Connected to notebook and classroom context'}
                    </p>
                  </div>
                  <Badge className="rounded-full bg-slate-900 text-white">
                    {isZh ? '预览' : 'Preview'}
                  </Badge>
                </div>

                <div className="h-[272px] overflow-hidden">
                  <Conversation className="h-full">
                    <ConversationContent className="gap-4 p-4">
                      {copy.chatMessages.map((message, index) => (
                        <Message key={`${message.role}-${index}`} from={message.role}>
                          <MessageContent>
                            <p className="leading-7">{message.text}</p>
                          </MessageContent>
                        </Message>
                      ))}
                    </ConversationContent>
                  </Conversation>
                </div>

                <div className="mt-2 flex gap-2 border-t border-slate-200 px-2 pt-3">
                  <Input readOnly value={copy.sections.chat.prompt} className="bg-white" />
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 rounded-full px-4"
                    onClick={goToChat}
                  >
                    {isZh ? '发送' : 'Send'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <div className="max-w-2xl space-y-3">
            <Badge
              variant="outline"
              className="rounded-full border-slate-300 bg-white/80 text-slate-700"
            >
              <ShoppingBag className="size-3.5" />
              {copy.sections.store.badge}
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              {copy.sections.store.title}
            </h2>
            <p className="text-base leading-8 text-slate-600">{copy.sections.store.description}</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {storeCards.map((card, index) => (
              <CourseGalleryCard
                key={card.id}
                listIndex={index}
                badge={isZh ? 'Mock Data' : 'Mock Data'}
                subtitle={isZh ? '首页预览' : 'Homepage preview'}
                course={card}
                slide={STORE_SLIDES[index]}
                tags={card.tags}
                secondaryLabel={isZh ? '互动课件' : 'Interactive notebook'}
                actionLabel={copy.sections.store.action}
                onAction={goToStore}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
