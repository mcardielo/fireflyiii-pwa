(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    var auth = {
        unlocked: false,

        /* ─── Check if security (any method) is enabled ─── */
        isEnabled: function() {
            try {
                return localStorage.getItem('ffpwa_security') === 'true';
            } catch (e) { return false; }
        },

        /* ─── Enable/disable security ─── */
        setEnabled: function(enabled) {
            try {
                localStorage.setItem('ffpwa_security', enabled ? 'true' : 'false');
                if (!enabled) {
                    // Clean up sensitive data
                    localStorage.removeItem('ffpwa_pin_hash');
                    localStorage.removeItem('ffpwa_credential_id');
                    this.unlocked = false;
                }
            } catch (e) {}
        },

        /* ─── Get security method ─── */
        getMethod: function() {
            try { return localStorage.getItem('ffpwa_auth_method') || 'webauthn'; }
            catch (e) { return 'webauthn'; }
        },

        /* ─── Set security method ─── */
        setMethod: function(method) {
            try { localStorage.setItem('ffpwa_auth_method', method); } catch (e) {}
        },

        /* ─── Check if WebAuthn platform authenticator is available ─── */
        webauthnAvailable: function() {
            if (!window.PublicKeyCredential) return Promise.resolve(false);
            return PublicKeyCredential
                .isUserVerifyingPlatformAuthenticatorAvailable()
                .catch(function() { return false; });
        },

        /* ─── Register WebAuthn credential ─── */
        registerWebAuthn: function() {
            var challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            var userId = new Uint8Array(16);
            crypto.getRandomValues(userId);

            return navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: {
                        name: 'Firefly Ledger',
                        id: window.location.hostname
                    },
                    user: {
                        id: userId,
                        name: 'ffpwa-user',
                        displayName: 'Firefly Ledger'
                    },
                    pubKeyCredParams: [
                        { type: 'public-key', alg: -7 },    // ES256
                        { type: 'public-key', alg: -257 }   // RS256
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required',
                        residentKey: 'preferred'
                    },
                    timeout: 30000
                }
            }).then(function(credential) {
                // Store the credential ID (base64url)
                var credId = arrayBufferToBase64Url(credential.rawId);
                try { localStorage.setItem('ffpwa_credential_id', credId); } catch (e) {}
                return true;
            }).catch(function(err) {
                console.warn('[Auth] WebAuthn registration failed:', err.message);
                return false;
            });
        },

        /* ─── Authenticate with WebAuthn ─── */
        authenticateWebAuthn: function() {
            var challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            var credId;
            try { credId = localStorage.getItem('ffpwa_credential_id'); } catch (e) {}

            var allowCredentials = credId ? [{
                id: base64UrlToArrayBuffer(credId),
                type: 'public-key'
            }] : [];

            return navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    rpId: window.location.hostname,
                    userVerification: 'required',
                    allowCredentials: allowCredentials.length ? allowCredentials : undefined,
                    timeout: 30000
                }
            }).then(function() {
                return true;
            }).catch(function(err) {
                console.warn('[Auth] WebAuthn auth failed:', err.message);
                return false;
            });
        },

        /* ─── Set PIN ─── */
        setPin: function(pin) {
            return hashPin(pin).then(function(hash) {
                try { localStorage.setItem('ffpwa_pin_hash', hash); } catch (e) {}
            });
        },

        /* ─── Verify PIN ─── */
        verifyPin: function(pin) {
            var storedHash;
            try { storedHash = localStorage.getItem('ffpwa_pin_hash'); } catch (e) {}
            if (!storedHash) return Promise.resolve(false);
            return hashPin(pin).then(function(hash) {
                return hash === storedHash;
            });
        },

        /* ─── Check if a WebAuthn credential exists ─── */
        hasCredential: function() {
            try { return !!localStorage.getItem('ffpwa_credential_id'); } catch (e) { return false; }
        },

        /* ─── Check if PIN is configured ─── */
        hasPin: function() {
            try { return !!localStorage.getItem('ffpwa_pin_hash'); } catch (e) { return false; }
        },

        /* ─── Attempt unlock (tries webauthn then falls back to PIN) ─── */
        unlock: function(method) {
            if (this.unlocked) return Promise.resolve(true);

            var self = this;
            method = method || this.getMethod();

            if (method === 'webauthn') {
                return this.authenticateWebAuthn().then(function(success) {
                    if (success) {
                        self.unlocked = true;
                        return true;
                    }
                    return false;
                });
            }

            // PIN is handled by the UI (verifyPin is called separately)
            return Promise.resolve(false);
        },

        /* ─── Lock ─── */
        lock: function() {
            this.unlocked = false;
        },

        /* ─── Check if need to show lock screen for accounts ─── */
        needsAuth: function() {
            return this.isEnabled() && !this.unlocked;
        }
    };

    window.FFPWA.auth = auth;

    /* ─── Helpers ─── */

    function arrayBufferToBase64Url(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function base64UrlToArrayBuffer(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        var binary = atob(str);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function hashPin(pin) {
        var encoder = new TextEncoder();
        var data = encoder.encode(pin + 'ffpwa_salt');
        return crypto.subtle.digest('SHA-256', data).then(function(buffer) {
            var hex = '';
            var bytes = new Uint8Array(buffer);
            for (var i = 0; i < bytes.length; i++) {
                hex += bytes[i].toString(16).padStart(2, '0');
            }
            return hex;
        });
    }

})();
