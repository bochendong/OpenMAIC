import { redirect } from 'next/navigation';

/** 旧路径 /admin/llm 重定向到统一控制台 */
export default function AdminLLMRedirectPage() {
  redirect('/admin?section=llm');
}
