/**
 * http.js — Lightweight fetch() wrapper that replaces $.ajax
 *
 * Usage:
 *   FFPWA.http({ url, method, headers, data, dataType, timeout, success, error, complete })
 *
 * Returns a Promise that resolves with the parsed response and also calls
 * success/error/complete callbacks for backward compatibility with $.ajax callers.
 */
(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    window.FFPWA.http = function(options) {
        var opts = options || {};
        var url = opts.url;
        var method = (opts.method || opts.type || 'GET').toUpperCase();
        var headers = opts.headers || {};
        var body = null;
        var timeout = opts.timeout || 30000;

        // Build body
        if (opts.data) {
            if (typeof opts.data === 'string') {
                body = opts.data;
            } else {
                body = JSON.stringify(opts.data);
            }
            // Ensure Content-Type is set for JSON bodies
            if (!headers['Content-Type'] && !headers['content-type']) {
                headers['Content-Type'] = 'application/json';
            }
        }

        var controller = null;
        var timeoutId = null;
        var timedOut = false;

        // Timeout via AbortController
        if (typeof AbortController !== 'undefined') {
            controller = new AbortController();
            timeoutId = setTimeout(function() {
                timedOut = true;
                controller.abort();
            }, timeout);
        }

        var fetchOptions = {
            method: method,
            headers: headers
        };

        if (body !== null) {
            fetchOptions.body = body;
        }

        if (controller) {
            fetchOptions.signal = controller.signal;
        }

        return fetch(url, fetchOptions).then(function(response) {
            if (timeoutId) clearTimeout(timeoutId);

            // Parse response based on dataType
            var parsePromise;
            var dataType = opts.dataType || 'json';
            if (dataType === 'json') {
                parsePromise = response.text().then(function(text) {
                    try {
                        return text ? JSON.parse(text) : {};
                    } catch (e) {
                        return {};
                    }
                });
            } else if (dataType === 'text') {
                parsePromise = response.text();
            } else {
                parsePromise = response.text().then(function(text) {
                    try {
                        return text ? JSON.parse(text) : {};
                    } catch (e) {
                        return text;
                    }
                });
            }

            return parsePromise.then(function(data) {
                // Mimic jQuery: xhr-like object for error callbacks
                if (!response.ok) {
                    var xhrLike = {
                        status: response.status,
                        statusText: response.statusText || '',
                        responseJSON: data,
                        responseText: typeof data === 'string' ? data : JSON.stringify(data)
                    };
                    if (opts.error) {
                        opts.error(xhrLike, 'error', new Error('HTTP ' + response.status));
                    }
                    var err = new Error('HTTP ' + response.status);
                    err.xhr = xhrLike;
                    err.status = response.status;
                    err.responseJSON = data;
                    throw err;
                }

                if (opts.success) {
                    opts.success(data, 'success', response);
                }
                return data;
            });
        }).catch(function(err) {
            if (timeoutId) clearTimeout(timeoutId);

            // Timeout or network error
            var xhrLike = err.xhr;
            if (!xhrLike) {
                xhrLike = {
                    status: 0,
                    statusText: timedOut ? 'timeout' : 'network error',
                    responseJSON: null,
                    responseText: ''
                };
            }
            var textStatus = timedOut ? 'timeout' : 'error';
            if (opts.error) {
                opts.error(xhrLike, textStatus, err);
            }
            throw err;
        }).then(function(data) {
            if (opts.complete) {
                opts.complete(xhrLike || { status: 200 });
            }
            return data;
        }, function(err) {
            if (opts.complete) {
                opts.complete({ status: 0 });
            }
            throw err;
        });
    };
})();