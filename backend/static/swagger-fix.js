// Исправление для Swagger UI: добавление токена в заголовки для multipart запросов
(function() {
    'use strict';
    
    console.log('[Swagger Fix] Script loading...');
    
    // Ключ для сохранения токена в localStorage
    const TOKEN_STORAGE_KEY = 'swagger-fix-bearer-token';
    
    // Функция для сохранения токена
    function saveToken(token) {
        if (token && token.length > 20) {
            localStorage.setItem(TOKEN_STORAGE_KEY, token);
            console.log('[Swagger Fix] 💾 Token saved to localStorage');
            return true;
        }
        return false;
    }
    
    // Функция для получения токена из localStorage
    function getStoredToken() {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (token && token.length > 20) {
            return token;
        }
        return null;
    }
    
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
    
    // Перехватываем ввод токена в поле Swagger UI
    function setupTokenCapture() {
        // Используем MutationObserver для отслеживания изменений в DOM
        const observer = new MutationObserver(function(mutations) {
            // Ищем поле ввода токена
            const tokenInputs = document.querySelectorAll('input[type="text"], input[type="password"], input');
            tokenInputs.forEach(function(input) {
                // Проверяем текущее значение
                const value = input.value || '';
                if (isValidToken(value)) {
                    const token = value.replace(/^Bearer\s+/i, '').trim();
                    saveToken(token);
                }
                
                // Сохраняем токен при изменении
                if (!input._swaggerFixListener) {
                    input._swaggerFixListener = true;
                    input.addEventListener('input', function(e) {
                        const value = e.target.value || '';
                        if (isValidToken(value)) {
                            const token = value.replace(/^Bearer\s+/i, '').trim();
                            saveToken(token);
                            console.log('[Swagger Fix] 🎯 Token captured from input field!');
                        }
                    });
                }
            });
        });
        
        // Наблюдаем за изменениями в body
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
        
        // Также проверяем сразу после загрузки и периодически
        function checkInputs() {
            const allInputs = document.querySelectorAll('input');
            allInputs.forEach(function(input) {
                const value = input.value || '';
                if (isValidToken(value)) {
                    const token = value.replace(/^Bearer\s+/i, '').trim();
                    saveToken(token);
                }
            });
        }
        
        // Проверяем сразу и периодически
        setTimeout(checkInputs, 500);
        setTimeout(checkInputs, 2000);
        setInterval(checkInputs, 3000);
    }
    
    setupTokenCapture();
    
    // Функция для получения токена из Swagger UI
    function getAuthToken() {
        try {
            // Способ 0: Из localStorage (самый надежный, сохраняется между сессиями)
            const storedToken = getStoredToken();
            if (storedToken) {
                return storedToken;
            }
            
            // Способ 1: Прямой поиск в DOM (актуальный токен в полях)
            const allInputs = document.querySelectorAll('input[type="text"], input');
            for (let input of allInputs) {
                const value = input.value || '';
                if (isValidToken(value)) {
                    const token = value.replace(/^Bearer\s+/i, '').trim();
                    saveToken(token); // Сохраняем для будущего использования
                    console.log('[Swagger Fix] 🎯 Token found in DOM input!');
                    return token;
                }
            }
            
            // Способ 2: Из системы авторизации Swagger UI
            if (window.ui && window.ui.getSystem) {
                try {
                    const system = window.ui.getSystem();
                    const authSelectors = system.authSelectors;
                    if (authSelectors && authSelectors.getAuthorized) {
                        const authorized = authSelectors.getAuthorized();
                        if (authorized && authorized.BearerAuth) {
                            let token = authorized.BearerAuth.value || authorized.BearerAuth;
                            // Проверяем, что это не строка "string" (дефолтное значение Swagger)
                            if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                cachedToken = token;
                                console.log('[Swagger Fix] Token found from authSelectors');
                                return token;
                            }
                        }
                    }
                } catch(e) {
                    console.log('[Swagger Fix] Error accessing authSelectors:', e);
                }
            }
            
            // Способ 3: Прямой доступ к state Swagger UI
            if (window.ui && window.ui.getSystem) {
                try {
                    const system = window.ui.getSystem();
                    const state = system.getState();
                    if (state && state.auth && state.auth.authorized) {
                        const bearerAuth = state.auth.authorized.BearerAuth;
                        if (bearerAuth) {
                            let token = bearerAuth.value || bearerAuth;
                            if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                cachedToken = token;
                                console.log('[Swagger Fix] Token found from state');
                                return token;
                            }
                        }
                    }
                } catch(e) {
                    console.log('[Swagger Fix] Error accessing state:', e);
                }
            }
            
            // Способ 4: Из localStorage (Swagger UI хранит там авторизацию)
            const swaggerAuth = localStorage.getItem('swagger-ui-auth');
            if (swaggerAuth) {
                try {
                    const auth = JSON.parse(swaggerAuth);
                    if (auth.BearerAuth) {
                        let token = auth.BearerAuth.value || auth.BearerAuth;
                        if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                            cachedToken = token;
                            console.log('[Swagger Fix] Token found from localStorage');
                            return token;
                        }
                    }
                } catch(e) {
                    console.log('[Swagger Fix] Error parsing localStorage:', e);
                }
            }
            
            // Способ 5: Ищем во всех ключах localStorage, которые могут содержать токен
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('swagger') || key.includes('auth')) {
                    try {
                        const value = localStorage.getItem(key);
                        if (value) {
                            const parsed = JSON.parse(value);
                            if (parsed && parsed.BearerAuth) {
                                let token = parsed.BearerAuth.value || parsed.BearerAuth;
                                if (token && typeof token === 'string' && token !== 'string' && token.length > 20) {
                                    cachedToken = token;
                                    console.log('[Swagger Fix] Token found from localStorage key:', key);
                                    return token;
                                }
                            }
                        }
                    } catch(e) {
                        // Не JSON, пропускаем
                    }
                }
            }
            
            return null;
        } catch(e) {
            console.error('[Swagger Fix] Error getting auth token:', e);
            return null;
        }
    }
    
    // Слушаем изменения в localStorage для обновления токена
    window.addEventListener('storage', function(e) {
        if (e.key && (e.key.includes('swagger') || e.key.includes('auth'))) {
            cachedToken = null; // Сбрасываем кэш
            console.log('[Swagger Fix] Storage changed, refreshing token cache');
        }
    });
    
    // Также слушаем события авторизации в Swagger UI
    function setupSwaggerAuthListener() {
        if (window.ui && window.ui.getSystem) {
            try {
                const system = window.ui.getSystem();
                // Подписываемся на изменения состояния авторизации
                system.subscribe((state) => {
                    if (state && state.auth) {
                        cachedToken = null; // Сбрасываем кэш при изменении auth
                        const token = getAuthToken();
                        if (token) {
                            console.log('[Swagger Fix] 🔑 Token updated via state subscription');
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
    
    // Перехватываем fetch API (Swagger UI использует fetch)
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        options = options || {};
        const isMultipart = options.body instanceof FormData;
        const urlStr = typeof url === 'string' ? url : url.toString();
        
        // Проверяем, это запрос к нашему API
        if (urlStr.includes('/api/') && isMultipart) {
            // Получаем токен (будет искать в localStorage и DOM)
            const token = getAuthToken();
            
            if (token) {
                // Создаем или используем существующие headers
                if (!options.headers) {
                    options.headers = {};
                }
                
                // Преобразуем headers в объект, если это Headers
                let headersObj = {};
                if (options.headers instanceof Headers) {
                    options.headers.forEach((value, key) => {
                        headersObj[key] = value;
                    });
                } else if (options.headers instanceof Object) {
                    headersObj = options.headers;
                }
                
                // Добавляем Authorization, если его нет
                if (!headersObj['Authorization'] && !headersObj['authorization']) {
                    headersObj['Authorization'] = 'Bearer ' + token;
                    options.headers = headersObj;
                    console.log('[Swagger Fix] ✅ Added Authorization header to multipart request:', urlStr);
                } else {
                    console.log('[Swagger Fix] ⚠️ Authorization header already exists');
                }
            } else {
                console.log('[Swagger Fix] ❌ No token available for request:', urlStr);
                // Попробуем еще раз через небольшую задержку
                console.log('[Swagger Fix] 🔍 Attempting to find token again...');
                setTimeout(function() {
                    const retryToken = getAuthToken();
                    if (retryToken) {
                        console.log('[Swagger Fix] ✅ Token found on retry!');
                    } else {
                        console.log('[Swagger Fix] ❌ Token still not found. Please check:');
                        console.log('[Swagger Fix] 1. Did you click "Authorize" button?');
                        console.log('[Swagger Fix] 2. Did you enter the token in BearerAuth field?');
                        console.log('[Swagger Fix] 3. Did you click "Authorize" after entering token?');
                    }
                }, 100);
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
        const isMultipart = data instanceof FormData;
        const url = this._swaggerUrl;
        
        if (url && url.includes('/api/') && isMultipart) {
            const token = getAuthToken();
            
            if (token) {
                const hasAuth = this._swaggerHeaders && 
                               (this._swaggerHeaders['authorization'] || this._swaggerHeaders['Authorization']);
                
                if (!hasAuth) {
                    originalSetRequestHeader.call(this, 'Authorization', 'Bearer ' + token);
                    console.log('[Swagger Fix] ✅ Added Authorization header to XHR multipart request:', url);
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
    
    // Также слушаем клики на кнопку Authorize и кнопки закрытия модального окна
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
            setTimeout(function() {
                // Ищем токен в полях ввода после клика
                const inputs = document.querySelectorAll('input');
                let found = false;
                for (let input of inputs) {
                    const value = input.value || '';
                    if (isValidToken(value)) {
                        const token = value.replace(/^Bearer\s+/i, '').trim();
                        saveToken(token);
                        console.log('[Swagger Fix] 🔑 Token found and saved after Authorize click!');
                        found = true;
                        break;
                    }
                }
                
                // Проверяем сохраненный токен
                if (!found) {
                    const token = getAuthToken();
                    if (token) {
                        console.log('[Swagger Fix] 🔑 Token found in storage!');
                    } else {
                        console.log('[Swagger Fix] ⚠️ Token still not found after Authorize click');
                        console.log('[Swagger Fix] 💡 Tip: Make sure you entered the token in the BearerAuth field and clicked "Authorize"');
                        console.log('[Swagger Fix] 💡 The token should start with "eyJ" (JWT format)');
                    }
                }
            }, 1500); // Увеличиваем задержку, чтобы Swagger UI успел сохранить токен
        }
    });
    
    console.log('[Swagger Fix] ✅ Multipart authorization fix loaded successfully!');
})();