// Исправление для Swagger UI: добавление токена в заголовки для multipart запросов
(function() {
    'use strict';
    
    console.log('[Swagger Fix] Script loading...');
    
    // Временное хранилище для токена, установленного через Swagger UI
    // Используется только если Swagger UI state недоступен
    let currentAuthToken = null;
    let tokenSource = null; // 'swagger-ui' или null
    
    // Функция для проверки, является ли строка токеном
    function isValidToken(value) {
        if (!value || typeof value !== 'string') return false;
        
        const trimmed = value.trim();
        if (trimmed.length < 10) return false; // Токены обычно длиннее
        
        // Убираем "Bearer " если есть
        const token = trimmed.replace(/^Bearer\s+/i, '').trim();
        
        // Проверяем длину (токены обычно достаточно длинные)
        if (token.length < 10) return false;
        
        // Токен не должен быть пустой строкой или дефолтным значением Swagger
        if (token === 'string' || token === 'token' || token === '') return false;
        
        // Токен не должен содержать только пробелы
        if (!token || token.trim().length === 0) return false;
        
        // Если это JWT (начинается с eyJ), это точно токен
        if (token.startsWith('eyJ')) return true;
        
        // Если это длинная строка без пробелов (возможно base64 или hex токен)
        if (token.length > 20 && !token.includes(' ') && !token.includes('\n')) {
            // Проверяем, что это не просто случайный текст
            // Токены обычно содержат буквы, цифры и специальные символы
            const hasValidChars = /^[a-zA-Z0-9\-_\.]+$/.test(token);
            if (hasValidChars && token.length >= 20) {
                return true;
            }
        }
        
        return false;
    }
    
    // НЕ сохраняем токены автоматически из полей ввода
    // Токены должны быть установлены через Swagger UI (кнопка "Authorize")
    // и будут получены через getAuthToken() из Swagger UI state
    
    // Функция для получения токена из Swagger UI
    // ВАЖНО: Использует токен ТОЛЬКО если пользователь явно авторизовался в Swagger UI
    // НЕ сохраняет токены - только читает из Swagger UI state
    function getAuthToken(debug = false) {
        try {
            // Способ 1: Из системы авторизации Swagger UI (приоритет - пользователь авторизовался)
            if (window.ui && window.ui.getSystem) {
                try {
                    const system = window.ui.getSystem();
                    const authSelectors = system.authSelectors;
                    if (authSelectors && authSelectors.getAuthorized) {
                        const authorized = authSelectors.getAuthorized();
                        if (debug) console.log('[Swagger Fix] 🔍 authSelectors.getAuthorized():', authorized);
                        if (authorized && authorized.BearerAuth) {
                            let token = authorized.BearerAuth.value || authorized.BearerAuth;
                            if (debug) console.log('[Swagger Fix] 🔍 BearerAuth token from authSelectors:', token?.substring(0, 30) + '...');
                            // Проверяем, что это не строка "string" (дефолтное значение Swagger)
                            if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                if (debug) console.log('[Swagger Fix] ✅ Token found via authSelectors');
                                return token;
                            }
                        }
                    }
                } catch(e) {
                    if (debug) console.log('[Swagger Fix] Error accessing authSelectors:', e);
                }
            }
            
            // Способ 2: Прямой доступ к state Swagger UI (пользователь авторизовался)
            if (window.ui && window.ui.getSystem) {
                try {
                    const system = window.ui.getSystem();
                    const state = system.getState();
                    if (debug) {
                        console.log('[Swagger Fix] 🔍 State.auth:', JSON.stringify(state?.auth, null, 2));
                        console.log('[Swagger Fix] 🔍 Full state structure:', Object.keys(state || {}));
                    }
                    if (state && state.auth) {
                        // Проверяем разные возможные пути к токену
                        if (state.auth.authorized && state.auth.authorized.BearerAuth) {
                            let token = state.auth.authorized.BearerAuth.value || state.auth.authorized.BearerAuth;
                            if (debug) console.log('[Swagger Fix] 🔍 Token from state.auth.authorized.BearerAuth:', token?.substring(0, 30) + '...');
                            if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                if (debug) console.log('[Swagger Fix] ✅ Token found via state.auth.authorized');
                                return token;
                            }
                        }
                        // Альтернативный путь
                        if (state.auth.data && state.auth.data.BearerAuth) {
                            let token = state.auth.data.BearerAuth.value || state.auth.data.BearerAuth;
                            if (debug) console.log('[Swagger Fix] 🔍 Token from state.auth.data.BearerAuth:', token?.substring(0, 30) + '...');
                            if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                if (debug) console.log('[Swagger Fix] ✅ Token found via state.auth.data');
                                return token;
                            }
                        }
                        // Проверяем все возможные пути в state.auth
                        if (debug) {
                            console.log('[Swagger Fix] 🔍 Checking all paths in state.auth...');
                            function checkObject(obj, path = '') {
                                for (const key in obj) {
                                    const value = obj[key];
                                    const currentPath = path ? path + '.' + key : key;
                                    if (typeof value === 'string' && value.startsWith('eyJ') && value.length > 20) {
                                        console.log('[Swagger Fix] 🔍 Found JWT token at:', currentPath, value.substring(0, 30) + '...');
                                    } else if (typeof value === 'object' && value !== null) {
                                        checkObject(value, currentPath);
                                    }
                                }
                            }
                            checkObject(state.auth, 'state.auth');
                        }
                    }
                } catch(e) {
                    if (debug) console.log('[Swagger Fix] Error accessing state:', e);
                }
            }
            
            // Способ 3: Из localStorage Swagger UI (только если Swagger UI сохранил туда токен)
            // Проверяем разные возможные ключи
            const swaggerAuthKeys = ['swagger-ui-auth', 'swagger_auth', 'swaggerAuth'];
            for (const key of swaggerAuthKeys) {
                const swaggerAuth = localStorage.getItem(key);
                if (swaggerAuth) {
                    try {
                        const auth = JSON.parse(swaggerAuth);
                        if (debug) console.log('[Swagger Fix] 🔍 localStorage[' + key + ']:', auth);
                        if (auth.BearerAuth) {
                            let token = auth.BearerAuth.value || auth.BearerAuth;
                            if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                if (debug) console.log('[Swagger Fix] ✅ Token found via localStorage[' + key + ']');
                                return token;
                            }
                        }
                        // Проверяем альтернативные структуры
                        if (auth.bearerAuth || auth.bearer || auth.token) {
                            let token = auth.bearerAuth || auth.bearer || auth.token;
                            if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                if (debug) console.log('[Swagger Fix] ✅ Token found via localStorage[' + key + '] (alt structure)');
                                return token;
                            }
                        }
                    } catch(e) {
                        if (debug) console.log('[Swagger Fix] Error parsing localStorage[' + key + ']:', e);
                    }
                }
            }
            
            // Способ 4: Проверяем все ключи localStorage, содержащие 'swagger' или 'auth'
            // И ищем токен напрямую в значениях
            if (debug) {
                console.log('[Swagger Fix] 🔍 Checking all localStorage keys...');
            }
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('swagger') || key.includes('auth'))) {
                    try {
                        const value = localStorage.getItem(key);
                        if (debug) console.log('[Swagger Fix] 🔍 localStorage[' + key + ']:', value?.substring(0, 100));
                        
                        // НЕ используем старый ключ swagger-fix-bearer-token
                        // Токен должен быть установлен через Swagger UI и будет получен из state или currentAuthToken
                    } catch(e) {
                        // Игнорируем
                    }
                }
            }
            
            // Способ 5: Используем токен из временного хранилища (если был установлен через Swagger UI)
            if (currentAuthToken && tokenSource === 'swagger-ui') {
                if (debug) console.log('[Swagger Fix] ✅ Token found from temporary storage (set via Swagger UI)');
                return currentAuthToken;
            }
            
            return null;
        } catch(e) {
            if (debug) console.error('[Swagger Fix] Error getting auth token:', e);
            return null;
        }
    }
    
    // Слушаем события авторизации в Swagger UI для логирования
    function setupSwaggerAuthListener() {
        if (window.ui && window.ui.getSystem) {
            try {
                const system = window.ui.getSystem();
                // Подписываемся на изменения состояния авторизации
                system.subscribe((state) => {
                    if (state && state.auth) {
                        const token = getAuthToken();
                        if (token) {
                            console.log('[Swagger Fix] 🔑 Token updated via Swagger UI state');
                        }
                    }
                });
            } catch(e) {
                console.log('[Swagger Fix] Could not setup auth listener:', e);
            }
        }
    }
    
    // Пытаемся настроить listener после загрузки Swagger UI
    setTimeout(setupSwaggerAuthListener, 1000);
    
    // Функция для проверки, является ли эндпоинт публичным (не требует авторизации)
    function isPublicEndpoint(url) {
        const publicPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/docs', '/redoc', '/openapi.json'];
        return publicPaths.some(path => url.includes(path));
    }
    
    // Перехватываем fetch API (Swagger UI использует fetch)
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        options = options || {};
        const urlStr = typeof url === 'string' ? url : url.toString();
        
        // Проверяем, это запрос к нашему API и не публичный эндпоинт
        if (urlStr.includes('/api/') && !isPublicEndpoint(urlStr)) {
            // Получаем токен ТОЛЬКО из Swagger UI (пользователь должен авторизоваться)
            const token = getAuthToken();
            
            if (token) {
                // Обрабатываем разные типы headers
                if (options.headers instanceof Headers) {
                    // Если это Headers объект, проверяем и добавляем токен
                    if (!options.headers.has('Authorization')) {
                        options.headers.set('Authorization', 'Bearer ' + token);
                        console.log('[Swagger Fix] ✅ Added Authorization header (Headers) to:', urlStr);
                    }
                } else if (options.headers && typeof options.headers === 'object') {
                    // Если это обычный объект
                    if (!options.headers['Authorization'] && !options.headers['authorization']) {
                        options.headers['Authorization'] = 'Bearer ' + token;
                        console.log('[Swagger Fix] ✅ Added Authorization header (Object) to:', urlStr);
                    }
                } else {
                    // Если headers отсутствуют или null/undefined, создаем новый объект
                    options.headers = {
                        'Authorization': 'Bearer ' + token
                    };
                    console.log('[Swagger Fix] ✅ Created headers with Authorization for:', urlStr);
                }
            } else {
                // Токен не найден - пользователь не авторизовался
                // Не логируем каждый раз, чтобы не засорять консоль
                // console.log('[Swagger Fix] ❌ No token for:', urlStr, '- Please authorize in Swagger UI');
            }
        }
        
        return originalFetch.apply(this, arguments);
    };
    
    // Также перехватываем XMLHttpRequest на всякий случай
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._swaggerUrl = url;
        this._swaggerMethod = method;
        this._swaggerHeaders = {};
        return originalOpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        this._swaggerHeaders = this._swaggerHeaders || {};
        this._swaggerHeaders[name.toLowerCase()] = value;
        return originalSetRequestHeader.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(data) {
        const url = this._swaggerUrl;
        
        // Проверяем, это запрос к нашему API и не публичный эндпоинт
        if (url && url.includes('/api/') && !isPublicEndpoint(url)) {
            const token = getAuthToken();
            
            if (token) {
                const hasAuth = this._swaggerHeaders && 
                               (this._swaggerHeaders['authorization'] || this._swaggerHeaders['Authorization']);
                
                if (!hasAuth) {
                    originalSetRequestHeader.call(this, 'Authorization', 'Bearer ' + token);
                    console.log('[Swagger Fix] ✅ Added Authorization header to XHR request:', url);
                }
            }
        }
        
        return originalSend.apply(this, arguments);
    };
    
    // Мониторинг изменений авторизации с детальным логированием
    let lastToken = null;
    setInterval(function() {
        const currentToken = getAuthToken();
        if (currentToken !== lastToken) {
            lastToken = currentToken;
            if (currentToken) {
                console.log('[Swagger Fix] 🔑 Auth token updated:', currentToken.substring(0, 30) + '...');
            } else {
                console.log('[Swagger Fix] 🔓 Auth token removed');
                // Детальная диагностика, почему токен не найден
                console.log('[Swagger Fix] 🔍 Debugging token search...');
                if (window.ui && window.ui.getSystem) {
                    try {
                        const system = window.ui.getSystem();
                        const state = system.getState();
                        console.log('[Swagger Fix] State.auth:', state?.auth);
                        console.log('[Swagger Fix] State.auth.authorized:', state?.auth?.authorized);
                        
                        const authSelectors = system.authSelectors;
                        if (authSelectors && authSelectors.getAuthorized) {
                            const authorized = authSelectors.getAuthorized();
                            console.log('[Swagger Fix] authSelectors.getAuthorized():', authorized);
                        }
                    } catch(e) {
                        console.log('[Swagger Fix] Error in debug:', e);
                    }
                }
                
                // Проверяем localStorage
                console.log('[Swagger Fix] localStorage keys:', Object.keys(localStorage));
                for (let key of Object.keys(localStorage)) {
                    if (key.includes('swagger') || key.includes('auth')) {
                        console.log('[Swagger Fix] localStorage[' + key + ']:', localStorage.getItem(key));
                    }
                }
            }
        }
    }, 2000);
    
    // Слушаем изменения в полях ввода в реальном времени (пока модальное окно открыто)
    function setupInputListener() {
        // Используем MutationObserver для отслеживания появления модального окна
        const observer = new MutationObserver(function(mutations) {
            // Ищем все поля ввода в модальных окнах
            const modalInputs = document.querySelectorAll('[role="dialog"] input, [class*="modal"] input, [class*="dialog"] input');
            modalInputs.forEach(function(input) {
                // Проверяем, не слушаем ли мы уже это поле
                if (!input._swaggerFixListener) {
                    input._swaggerFixListener = true;
                    
                    // Слушаем изменения значения
                    input.addEventListener('input', function(e) {
                        const value = (e.target.value || '').trim();
                        if (value && value.startsWith('eyJ') && value.length > 50) {
                            currentAuthToken = value;
                            tokenSource = 'swagger-ui';
                            console.log('[Swagger Fix] 🔑 Token captured from input field (real-time):', value.substring(0, 30) + '...');
                        }
                    });
                    
                    // Также проверяем текущее значение
                    const currentValue = (input.value || '').trim();
                    if (currentValue && currentValue.startsWith('eyJ') && currentValue.length > 50) {
                        currentAuthToken = currentValue;
                        tokenSource = 'swagger-ui';
                        console.log('[Swagger Fix] 🔑 Token found in input field:', currentValue.substring(0, 30) + '...');
                    }
                }
            });
        });
        
        // Наблюдаем за изменениями в body
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Также проверяем сразу
        setTimeout(function() {
            const modalInputs = document.querySelectorAll('[role="dialog"] input, [class*="modal"] input, [class*="dialog"] input');
            modalInputs.forEach(function(input) {
                const value = (input.value || '').trim();
                if (value && value.startsWith('eyJ') && value.length > 50) {
                    currentAuthToken = value;
                    tokenSource = 'swagger-ui';
                    console.log('[Swagger Fix] 🔑 Token found in input field (initial check):', value.substring(0, 30) + '...');
                }
            });
        }, 500);
    }
    
    setupInputListener();
    
    // Слушаем клики на кнопку Authorize для логирования
    document.addEventListener('click', function(e) {
        const target = e.target;
        const isAuthorizeBtn = target && (
            target.textContent === 'Authorize' || 
            target.textContent === 'Authorize ' ||
            target.closest('.btn-done') ||
            target.closest('[class*="authorize"]') ||
            target.closest('button[class*="authorize"]')
        );
        
        if (isAuthorizeBtn) {
            console.log('[Swagger Fix] 🔄 Authorize button clicked');
            
            // НЕ очищаем токен - он уже должен быть сохранен из поля ввода
            // Проверяем, есть ли уже сохраненный токен
            if (currentAuthToken && tokenSource === 'swagger-ui') {
                console.log('[Swagger Fix] 🔑 Using previously captured token:', currentAuthToken.substring(0, 30) + '...');
            } else {
                // Пытаемся найти токен в полях ввода (на случай, если модальное окно еще открыто)
                const modalInputs = document.querySelectorAll('[role="dialog"] input, [class*="modal"] input, [class*="dialog"] input, input');
                for (const input of modalInputs) {
                    const value = (input.value || '').trim();
                    if (value && value.startsWith('eyJ') && value.length > 50) {
                        currentAuthToken = value;
                        tokenSource = 'swagger-ui';
                        console.log('[Swagger Fix] 🔑 Token captured from input field on Authorize click:', value.substring(0, 30) + '...');
                        break;
                    }
                }
            }
            
            // Проверяем Swagger UI state после задержки
            setTimeout(function() {
                const token = getAuthToken(true); // Включаем детальное логирование
                if (token) {
                    if (token !== currentAuthToken) {
                        currentAuthToken = token;
                        tokenSource = 'swagger-ui';
                        console.log('[Swagger Fix] 🔑 Token found in Swagger UI state:', token.substring(0, 30) + '...');
                    }
                    console.log('[Swagger Fix] ✅ Token authorized in Swagger UI successfully!');
                } else if (currentAuthToken && tokenSource === 'swagger-ui') {
                    console.log('[Swagger Fix] ✅ Using token captured from input field');
                } else {
                    console.log('[Swagger Fix] ⚠️ Token not found after Authorize click');
                    console.log('[Swagger Fix] 💡 Tip: Make sure you entered the token in the BearerAuth field and clicked "Authorize"');
                    console.log('[Swagger Fix] 💡 The token should start with "eyJ" (JWT format)');
                }
            }, 1000); // Задержка для проверки state
        }
    });
    
    console.log('[Swagger Fix] ✅ Authorization fix v2.5 loaded successfully!');
    console.log('[Swagger Fix] 💡 To use protected endpoints:');
    console.log('[Swagger Fix] 1. Click "Authorize" button in Swagger UI');
    console.log('[Swagger Fix] 2. Enter your JWT token in BearerAuth field');
    console.log('[Swagger Fix] 3. Click "Authorize" to confirm');
    console.log('[Swagger Fix] 4. The token will be automatically added to all protected API requests');
})();