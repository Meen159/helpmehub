// src/config/api.js
export const API_URL = "https://asia-southeast1-api-helpmehub-2026.cloudfunctions.net/api/widget";
export const WIDGET_API_KEY = "f38d2f3e8517467db5a67382bfbf05ef0c9138b03e9368452d2bce978718c3c2"; // แก้เป็น Key ของแต่ละโปรเจกต์ตรงนี้
export const HOSTING_ORIGIN = "https://cms.helpmehub.co";

const widgetThemeConfigCache = new Map();

export function getWidgetRuntimeConfig() {
	const config = window.InverzConfig || window.INVERZ_WIDGET_CONFIG || {};
	const queryParams = new URLSearchParams(window.location.search);
	return {
		apiKey: config.apiKey || queryParams.get('apiKey') || WIDGET_API_KEY,
		projectId: config.projectId || queryParams.get('projectId') || '1',
		user: config.user || null
	};
}

export function getScopedChatUserStorageKey(apiKey) {
	return `chat_user:${apiKey || WIDGET_API_KEY}`;
}

export async function fetchWidgetThemeConfig(apiKey) {
	const resolvedApiKey = apiKey || getWidgetRuntimeConfig().apiKey || WIDGET_API_KEY;

	if (!widgetThemeConfigCache.has(resolvedApiKey)) {
		const endpoints = [
			`${API_URL}/init?apiKey=${encodeURIComponent(resolvedApiKey)}`
		];

		const request = (async () => {
			let lastError = null;

			for (const endpoint of endpoints) {
				try {
					const response = await fetch(endpoint, {
						headers: { Accept: 'application/json' }
					});

					if (!response.ok) {
						throw new Error(`HTTP ${response.status} ${response.statusText}`);
					}

					const data = await response.json();
					if (data?.status === 'ok' && data.themeConfig) {
						return data.themeConfig;
					}

					throw new Error('Invalid theme payload');
				} catch (error) {
					lastError = error;
				}
			}

			console.error('Failed to load widget theme from all endpoints:', lastError);
			return null;
		})();

		widgetThemeConfigCache.set(resolvedApiKey, request);
	}

	return widgetThemeConfigCache.get(resolvedApiKey);
}

export function resolveWidgetMediaUrl(imageUrl) {
	if (!imageUrl) return null;
	if (/^(https?:|data:|blob:)/i.test(imageUrl)) return imageUrl;

	const cleaned = String(imageUrl).replace(/^\/+/, '');
	if (cleaned.startsWith('chat_images/')) {
		return `https://storage.googleapis.com/chatbot-storage-2025/${cleaned}`;
	}

	const apiBase = API_URL.replace(/\/widget$/, '');
	return `${apiBase}/${cleaned}`;
}