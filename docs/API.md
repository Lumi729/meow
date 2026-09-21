# 接口核对记录

核对日期：2026-09-21。先阅读官方规范与接口文档，再实现；未使用第三方 SDK 或推测 endpoint。

## 官方依据

- SillyTavern UI 扩展规范：https://docs.sillytavern.app/for-contributors/writing-extensions/
- Git URL 安装：https://docs.sillytavern.app/extensions/
- NovelAI 官方主 API：https://api.novelai.net/docs/
- NovelAI 官方图像 Swagger：https://image.novelai.net/docs/index.html
- 官方机器可读定义：https://image.novelai.net/docs/doc.json
- SillyTavern release 核对提交：`06bde939fb1e9c4c8d8641d810f0a916b5bce127`，package version `1.19.0`。
- 服务端桥接：https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/endpoints/novelai.js
- 官方前端调用、模型标识：https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions/stable-diffusion/index.js
- 密钥函数：https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/secrets.js

## 两层协议

Meow 调用同源 `POST /api/novelai/generate-image`，沿用官方前端的扁平字段：prompt、negative_prompt、model、width、height、steps、scale、seed、sampler、scheduler、upscale_ratio、decrisper、variety_boost、sm、sm_dyn。请求头由 getRequestHeaders() 提供，包含酒馆 CSRF 保护；不包含 NovelAI Token。

酒馆从当前用户密钥读取 `SECRET_KEYS.NOVEL`，向 `https://image.novelai.net/ai/generate-image` 发送 Bearer Token 和 `{action, input, model, parameters}`。官方 Swagger 的 ImageGenerationRequest / RequestParameters 明确列出这些结构；V4 条件包含 caption/base_caption/char_captions。酒馆负责构造 V4 正负提示、params_version 等上游参数。

官方图像接口支持 ZIP，以及显式 Accept: application/json 时的 JSON 图像结果。本版复用酒馆默认 ZIP 路径，酒馆解压 PNG 并返回纯 base64 文本；Meow 不把它误当 JSON 或 ZIP，先检查 PNG 标头再在浏览器解码。

官方 schema 对模型/采样器只给字符串类型，未枚举完整可用值。因此 V4.5 Full/Curated 的模型标识和 Euler Ancestral/Karras 使用已核对的 SillyTavern 官方实现，不编造新模型。尺寸、步数上限是本扩展基础版的保守产品限制，不宣称是官方完整配额或免费保证。

## 生命周期与限制

根目录 manifest 指定 JS/CSS，利用 getContext()、APP_READY（可在已就绪后补发）、renderExtensionTemplateAsync() 和独立 meow 设置键。模板目录从 import.meta.url 推导，兼容重命名安装目录。仅密钥模块使用相对导入，因为上下文未暴露 writeSecret；该内部函数可能随酒馆版本变化，需要重新核对。

用户点击后才生成，单次一个请求，无自动重试。没有真实凭证时只能验证协议与模拟行为，不能验证当前用户订阅、上游可用性或实际画质。
