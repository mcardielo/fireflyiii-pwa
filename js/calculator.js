/**
 * Calculadora Modal - fireflyiii-pwa
 * Abre una calculadora completa y permite pegar el resultado en el campo amount.
 */
(function() {
    'use strict';

    var modal = null;
    var expressionEl = null;
    var resultEl = null;
    var expression = [];
    var currentInput = '';
    var lastResult = null;
    var resetNext = false;

    /**
     * Monta el modal desde el template (solo la primera vez).
     */
    function ensureModal() {
        if (modal) return;
        var tpl = document.getElementById('calc-modal-template');
        if (!tpl) return;
        var clone = tpl.content.cloneNode(true);
        document.body.appendChild(clone);
        modal = document.getElementById('calc-modal');
        expressionEl = document.getElementById('calc-expression');
        resultEl = document.getElementById('calc-result');
    }

    /**
     * Actualiza los displays.
     */
    function updateDisplay() {
        var exprParts = [];
        for (var i = 0; i < expression.length; i++) {
            var token = expression[i];
            if (typeof token === 'number') {
                exprParts.push(formatNum(token));
            } else {
                var opLabels = { '+': '+', '-': '−', '*': '×', '/': '÷' };
                exprParts.push(opLabels[token] || token);
            }
        }
        if (currentInput !== '') {
            exprParts.push(currentInput);
        }
        if (expressionEl) expressionEl.textContent = exprParts.join(' ') || ' ';

        // Mostrar resultado live si hay algo para evaluar
        var val = evaluateLive();
        if (resultEl) resultEl.textContent = val !== null ? formatNum(val) : '0';
    }

    function formatNum(n) {
        // Si es entero, sin decimales
        if (Number.isInteger(n)) return String(n);
        // Hasta 10 decimales, quitando ceros finales
        return parseFloat(n.toFixed(10)).toString();
    }

    /**
     * Evalúa la expresión actual sin efectos secundarios.
     * @returns {number|null}
     */
    function evaluateLive() {
        if (expression.length === 0 && currentInput === '') return null;
        if (currentInput === '' || currentInput === '.' || currentInput === '-') {
            // Si terminó en operador, evaluar sin el último operador
            if (expression.length === 0) return null;
            var tokens = expression.slice();
            if (typeof tokens[tokens.length - 1] === 'string') {
                tokens.pop();
            }
            if (tokens.length === 0) return null;
            return safeEval(tokens);
        }
        var tokens = expression.slice();
        tokens.push(parseFloat(currentInput));
        return safeEval(tokens);
    }

    /**
     * Safe eval: convierte tokens a string y usa Function().
     */
    function safeEval(tokens) {
        var exprStr = '';
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (typeof t === 'number') {
                exprStr += t;
            } else {
                exprStr += ' ' + t + ' ';
            }
        }
        if (!exprStr) return null;
        try {
            var result = new Function('return (' + exprStr + ')')();
            if (typeof result !== 'number' || !isFinite(result)) return null;
            return result;
        } catch (e) {
            return null;
        }
    }

    /**
     * Evalúa y finaliza: la expresión se reemplaza por el resultado.
     */
    function doEquals() {
        if (currentInput !== '' && currentInput !== '.' && currentInput !== '-') {
            expression.push(parseFloat(currentInput));
            currentInput = '';
        }
        // Si el último token es operador, quitarlo
        if (expression.length > 0 && typeof expression[expression.length - 1] === 'string') {
            expression.pop();
        }
        if (expression.length === 0) {
            if (resultEl) resultEl.textContent = '0';
            return;
        }
        var val = safeEval(expression);
        if (val !== null) {
            lastResult = val;
            expression = [val];
            if (resultEl) resultEl.textContent = formatNum(val);
        } else {
            if (resultEl) resultEl.textContent = 'Error';
            expression = [];
        }
        currentInput = '';
        resetNext = true;
        updateDisplay();
    }

    /**
     * Resetea todo el estado.
     */
    function doClear() {
        expression = [];
        currentInput = '';
        lastResult = null;
        resetNext = false;
        updateDisplay();
    }

    /**
     * Borra el último carácter del input actual.
     */
    function doBackspace() {
        if (resetNext) return; // no borrar resultado previo
        if (currentInput !== '') {
            currentInput = currentInput.slice(0, -1);
        } else if (expression.length > 0) {
            // Si no hay input actual, borrar el último token de la expresión
            expression.pop();
        }
        updateDisplay();
    }

    /**
     * Inserta un dígito.
     */
    function inputDigit(d) {
        if (resetNext) {
            expression = [];
            currentInput = '';
            resetNext = false;
        }
        // Si el último token de expresión es un número y no hay operador pendiente,
        // es porque estamos encadenando después de un resultado
        if (expression.length > 0 && typeof expression[expression.length - 1] === 'number' && currentInput === '') {
            // El usuario presionó = antes, ahora empieza nueva operación con otro número
            // Dejamos el resultado anterior como punto de partida
            currentInput = '';
        }
        if (currentInput === '0' && d !== '.') {
            currentInput = d;
        } else {
            currentInput += d;
        }
        updateDisplay();
    }

    /**
     * Inserta punto decimal.
     */
    function inputDecimal() {
        if (resetNext) {
            expression = [];
            currentInput = '0';
            resetNext = false;
        }
        if (currentInput === '') {
            currentInput = '0';
        }
        if (currentInput.indexOf('.') === -1) {
            currentInput += '.';
        }
        updateDisplay();
    }

    /**
     * Inserta un operador.
     */
    function inputOperator(op) {
        if (resetNext && lastResult !== null) {
            // Continuar desde el último resultado
            expression = [lastResult];
            resetNext = false;
        }
        if (currentInput !== '' && currentInput !== '.' && currentInput !== '-') {
            expression.push(parseFloat(currentInput));
            currentInput = '';
        }
        // Si ya hay un operador al final, reemplazarlo
        if (expression.length > 0 && typeof expression[expression.length - 1] === 'string') {
            expression[expression.length - 1] = op;
        } else if (expression.length > 0) {
            expression.push(op);
        }
        // Si expresión vacía y hay lastResult, usarlo como punto de partida
        if (expression.length === 0 && lastResult !== null) {
            expression = [lastResult, op];
        }
        updateDisplay();
    }

    /**
     * Aplica porcentaje al número actual.
     */
    function inputPercent() {
        if (currentInput === '' || currentInput === '.' || currentInput === '-') return;
        var num = parseFloat(currentInput);
        // Buscar el último número en la expresión (ignorando operadores)
        var prevNum = null;
        for (var i = expression.length - 1; i >= 0; i--) {
            if (typeof expression[i] === 'number') {
                prevNum = expression[i];
                break;
            }
        }
        if (prevNum !== null) {
            num = prevNum * num / 100;
        } else {
            num = num / 100;
        }
        currentInput = formatNum(num);
        updateDisplay();
    }

    /**
     * Abre el modal.
     */
    function open() {
        ensureModal();
        if (!modal) return;
        doClear();
        // Precargar con el valor actual del campo amount
        var currentAmount = document.getElementById('amount') ? document.getElementById('amount').value : '';
        if (currentAmount && !isNaN(parseFloat(currentAmount))) {
            currentInput = currentAmount;
            updateDisplay();
        }
        if (modal) modal.classList.remove('hidden');
    }

    /**
     * Cierra el modal.
     */
    function close() {
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Pega el resultado en el campo amount y cierra.
     */
    function useResult() {
        var val = evaluateLive();
        var amountEl = document.getElementById('amount');
        if (val !== null && val > 0) {
            if (amountEl) { amountEl.value = val.toFixed(2); amountEl.dispatchEvent(new Event('change')); }
        } else if (currentInput !== '' && !isNaN(parseFloat(currentInput))) {
            if (amountEl) { amountEl.value = parseFloat(currentInput).toFixed(2); amountEl.dispatchEvent(new Event('change')); }
        }
        close();
    }

    // ── Event Handlers ──
    document.addEventListener('click', function(e) {
        if (e.target.closest('#calc-btn')) {
            e.preventDefault();
            open();
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target.id === 'calc-modal') {
            close(); // cerrar al tocar overlay
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target.closest('#calc-cancel-btn')) {
            close();
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target.closest('#calc-use-btn')) {
            useResult();
        }
    });

    document.addEventListener('click', function(e) {
        var key = e.target.closest('.calc-key');
        if (!key) return;
        var action = key.getAttribute('data-action');
        var value = key.getAttribute('data-value');
        switch (action) {
            case 'digit': inputDigit(String(value)); break;
            case 'decimal': inputDecimal(); break;
            case 'operator': inputOperator(value); break;
            case 'equals': doEquals(); break;
            case 'clear': doClear(); break;
            case 'backspace': doBackspace(); break;
            case 'percent': inputPercent(); break;
        }
    });

    // Exportar API
    window.FFPWA.calculator = {
        open: open,
        close: close,
        useResult: useResult
    };

})();
