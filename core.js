export const MODELS = Object.freeze({
    'nai-diffusion-4-5-full': 'NovelAI Diffusion V4.5 Full',
    'nai-diffusion-4-5-curated': 'NovelAI Diffusion V4.5 Curated',
});
export const DEFAULTS = Object.freeze({ model: 'nai-diffusion-4-5-full', prompt: '', negative_prompt: '', width: 832, height: 1216, steps: 28, scale: 5, seed: -1 });
export function buildRequest(settings, randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
    const s = { ...DEFAULTS, ...settings };
    if (typeof s.prompt !== 'string' || !s.prompt.trim()) throw new Error('先写一点画面描述吧。');
    if (!Object.hasOwn(MODELS, s.model)) throw new Error('请选择支持的模型。');
    const number = (key, min, max, integer = true) => {
        if (String(s[key]).trim() === '') throw new Error(`${key} 不能为空。`);
        const value = Number(s[key]);
        if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${key} 参数超出允许范围。`);
        return value;
    };
    const width = number('width', 64, 2048), height = number('height', 64, 2048);
    if (width % 64 || height % 64 || width * height > 1048576) throw new Error('尺寸须为 64 的倍数，基础版总像素不超过 1,048,576。');
    const seed = number('seed', -1, 4294967295);
    return { prompt: s.prompt.trim(), negative_prompt: String(s.negative_prompt ?? ''), model: s.model,
        width, height, steps: number('steps', 1, 28), scale: number('scale', 0, 10, false),
        seed: seed === -1 ? randomSeed() : seed, sampler: 'k_euler_ancestral', scheduler: 'karras',
        upscale_ratio: 1, decrisper: false, variety_boost: false, sm: false, sm_dyn: false };
}
export async function requestImage(payload, headers, signal, fetcher = fetch) {
    const response = await fetcher('/api/novelai/generate-image', { method: 'POST', headers, signal, body: JSON.stringify(payload) });
    if (!response.ok) {
        const messages = { 400: '请检查本地 NovelAI Token 和参数。', 401: '酒馆登录已过期或 Token 无效。', 403: '请求被拒绝，请检查酒馆登录和权限。', 404: '当前酒馆缺少生图接口，请更新 SillyTavern。', 429: '请求过于频繁，请稍后手动重试。' };
        throw new Error(messages[response.status] || `生图失败（HTTP ${response.status}）。请检查 Token、Anlas 余额和酒馆服务器日志；不会自动重试。`);
    }
    const data = (await response.text()).trim();
    if (!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('服务器未返回有效的 PNG 图片。');
    return `data:image/png;base64,${data}`;
}
