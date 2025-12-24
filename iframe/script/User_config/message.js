// 原生消息类

/**
 * 在页面右下角显示一条临时消息提示（Toast）
 *
 * @param {string} message - 要显示的消息文本，必填
 * @param {Object} [options] - 可选配置项
 * @param {number} [options.duration=3000] - 消息自动消失的毫秒数，默认 3000ms
 * @param {string} [options.type='info'] - 消息类型，可选 'info' | 'success' | 'warning' | 'error'
 * @param {boolean} [options.allowMultiple=false] - 是否允许多条消息同时存在
 *
 * @returns {void}
 *
 * @throws {TypeError} 当 message 不是字符串时抛出错误
 */
function showToast(message, options = {}) {
	// 参数校验
	if (typeof message !== 'string') {
		throw new TypeError('Parameter "message" must be a string.');
	}
	try {
		// 默认配置
		const config = {
			duration: 3000,
			type: 'info',
			allowMultiple: false,
			...options,
		};
		const validTypes = ['info', 'success', 'warning', 'error'];
		if (!validTypes.includes(config.type)) {
			console.warn(`不存在的消息类型"${config.type}"`);
			config.type = 'info';
		}
		let toastContainer = document.getElementById('__toast-container');
		if (!toastContainer) {
			toastContainer = document.createElement('div');
			toastContainer.id = '__toast-container';
			toastContainer.style.cssText = `
	                position: fixed;
	                bottom: 20px;
	                right: 20px;
	                z-index: 10000;
	                max-width: 80vw;
	                pointer-events: none;
	            `;
			document.body.appendChild(toastContainer);
		}
		if (!config.allowMultiple) {
			toastContainer.innerHTML = '';
		}
		const toastEl = document.createElement('div');
		toastEl.textContent = message;
		toastEl.style.cssText = `
	            background: ${
					config.type === 'success' ? '#4caf50' : config.type === 'warning' ? '#ff9800' : config.type === 'error' ? '#f44336' : '#333'
				};
	            color: white;
	            padding: 12px 16px;
	            border-radius: 6px;
	            margin-top: 8px;
	            font-size: 14px;
	            line-height: 1.4;
	            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
	            opacity: 0;
	            transform: translateY(20px);
	            transition: opacity 0.3s ease, transform 0.3s ease;
	            animation: __toast-fade-in 0.3s forwards;
	            pointer-events: auto;
	            word-break: break-word;
	        `;
		if (!document.getElementById('__toast-styles')) {
			const styleEl = document.createElement('style');
			styleEl.id = '__toast-styles';
			styleEl.textContent = `
	                @keyframes __toast-fade-in {
	                    to { opacity: 1; transform: translateY(0); }
	                }
	                @keyframes __toast-fade-out {
	                    to { opacity: 0; transform: translateY(20px); }
	                }
	            `;
			document.head.appendChild(styleEl);
		}
		toastContainer.appendChild(toastEl);
		requestAnimationFrame(() => {
			toastEl.style.animation = '__toast-fade-in 0.3s forwards';
		});
		const removeToast = () => {
			if (!toastEl.parentNode) return;
			toastEl.style.animation = '__toast-fade-out 0.3s forwards';
			setTimeout(() => {
				if (toastEl.parentNode) {
					toastEl.parentNode.removeChild(toastEl);
				}
			}, 300);
		};
		if (config.duration > 0) {
			setTimeout(removeToast, config.duration);
		}
		toastEl.addEventListener('click', removeToast, { once: true });
	} catch (error) {
		console.error('显示消息异常', error);
	}
}

function activateMimoAI() {
	// 防止重复注入
	if (window.__eda_ai_injected__) {
		console.log('[AI Assist] 已激活，跳过重复注入');
		return;
	}
	window.__eda_ai_injected__ = true;

	if (typeof ace === 'undefined') {
		console.error('[AI Assist] Ace 编辑器未加载');
		return;
	}

	let editor;
	try {
		editor = ace.edit('editor');
	} catch (e) {
		console.error('[AI Assist] 无法获取编辑器:', e);
		return;
	}

	window._ai_editor = editor;

	const safeShowToast =
		typeof window.showToast === 'function'
			? (msg) => {
					console.log('[TOAST]', msg);
					window.showToast(msg);
				}
			: (msg) => console.warn('[FALLBACK TOAST]', msg);

	async function callAI(prompt) {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 8000);
			const res = await fetch('http://127.0.0.1:5000/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: prompt }),
				signal: controller.signal,
			});
			clearTimeout(timeoutId);
			if (!res.ok || !res.body) throw new Error('Network error');

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let result = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const text = decoder.decode(value, { stream: true });
				const lines = text.split('\n');
				for (const line of lines) {
					if (line.startsWith('data: ') && !line.includes('[DONE]')) {
						result += line.slice(6);
					}
				}
			}
			return result.trim();
		} catch (err) {
			console.error('[AI Assist] AI 请求失败:', err);
			return 'Mimo 分析失败';
		}
	}

	// ========== 拦截“运行”按钮 ==========
	const runBtn = document.getElementById('run-btn');
	if (runBtn) {
		const newBtn = runBtn.cloneNode(true);
		runBtn.parentNode.replaceChild(newBtn, runBtn);
		newBtn.addEventListener('click', async () => {
			const code = editor.getValue().trim();
			if (!code) {
				safeShowToast('代码为空');
				return;
			}
			try {
				(0, eval)(code);
			} catch (error) {
				console.error('❌ 执行出错:', error);
				safeShowToast('检测到错误，Mimo 正在分析原因...');

				const explanation = await callAI(
					`[ERROR_ANALYSIS] 请用中文简明解释以下 JavaScript 错误：\n错误信息: ${error.message}\n代码:\n${code}`,
				);

				safeShowToast(explanation || 'Mimo 未能解析该错误');
			}
		});
	}

	// ========== 智能注释：基于 // 所在行的上一行 ==========
	let debounceTimer = null;
	let lastTriggerAt = 0;
	const COOLDOWN = 1500;

	editor.session.on('change', () => {
		const now = Date.now();
		if (now - lastTriggerAt < COOLDOWN) return;

		const cursor = editor.getCursorPosition();
		const currentLineText = editor.session.getLine(cursor.row);
		const trimmed = currentLineText.trim();

		// 触发条件：当前行是 "//" 或 "// "（严格行首）
		if (/^\/{2}\s*$/.test(trimmed)) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(async () => {
				lastTriggerAt = Date.now();

				const targetRow = cursor.row - 1;
				if (targetRow < 0) {
					safeShowToast('上方无代码可注释');
					return;
				}

				const codeToComment = editor.session.getLine(targetRow).trim();
				if (!codeToComment || codeToComment.startsWith('//')) {
					safeShowToast('上方不是有效代码');
					return;
				}

				safeShowToast('Mimo 正在生成注释...');

				const raw = await callAI(`[LINE_COMMENT] 请为以下 JavaScript 代码行生成一句简短中文注释（10字以内，不要标点）：\n${codeToComment}`);

				console.log('[AI LINE COMMENT]:', raw);

				let clean = (raw || '').trim();
				clean = clean.replace(/[。.，,！!？?；;…]+$/, '');

				if (clean && clean.length > 0 && clean.length <= 15 && !/Error|异常|失败|无法|sorry|undefined/i.test(clean)) {
					const insertPos = { row: cursor.row, column: currentLineText.length };
					editor.session.insert(insertPos, ` ${clean}`);
				} else {
					safeShowToast('Mimo 暂无法生成注释');
				}
			}, 600);
		}
	});
}
