/**
 * 课程/笔记本卡片顶部封面用图（与头像素材无关）；按 seed 稳定映射。
 * 默认改为免费风景资源，优先使用课程自己的 `avatarUrl`，否则落到此处的稳定壁纸。
 *
 * Sources:
 * - Pexels / Pixabay via Pexels（free to use）
 */
const FILES: readonly string[] = [
  'https://images.pexels.com/photos/458798/pexels-photo-458798.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/13728513/pexels-photo-13728513.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/30440583/pexels-photo-30440583.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/13872330/pexels-photo-13872330.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/69941/pexels-photo-69941.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/2070307/pexels-photo-2070307.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/27822439/pexels-photo-27822439.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/12266687/pexels-photo-12266687.jpeg?auto=compress&cs=tinysrgb&w=1600',
] as const;

function hashStringToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 按 id 稳定选择一张封面图（无课件缩略图时使用） */
export function pickStableGalleryCoverUrl(seed: string): string {
  if (FILES.length === 0) return '';
  const i = hashStringToUint32(seed) % FILES.length;
  return FILES[i];
}
