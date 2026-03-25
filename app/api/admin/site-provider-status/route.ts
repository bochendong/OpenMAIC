import { apiSuccess } from '@/lib/server/api-response';
import { requireAdmin } from '@/lib/server/admin-auth';
import {
  getAdminProviderEnvHints,
  getSiteProviderAdminView,
} from '@/lib/server/provider-config';

export async function GET() {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  const view = getSiteProviderAdminView();
  const tavilyEnv = process.env.TAVILY_API_KEY?.trim();
  let { webSearch } = view;
  const tavilyIdx = webSearch.findIndex((r) => r.id === 'tavily');
  if (tavilyIdx >= 0) {
    const row = webSearch[tavilyIdx];
    if (!row.hasApiKey && tavilyEnv) {
      webSearch = webSearch.slice();
      webSearch[tavilyIdx] = { ...row, hasApiKey: true };
    }
  } else if (tavilyEnv) {
    webSearch = [...webSearch, { id: 'tavily', hasApiKey: true, baseUrl: null, models: null }];
  }

  return apiSuccess({
    ...view,
    webSearch,
    envHints: getAdminProviderEnvHints(),
    tavilyRootEnvPresent: Boolean(tavilyEnv),
  });
}
