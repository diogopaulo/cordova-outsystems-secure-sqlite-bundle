// Force dependency load
var SQLiteCipher = require('cordova-sqlcipher-adapter.SQLitePlugin');
var SecureStorage = require('cordova-plugin-secure-storage.SecureStorage');

// Validate SQLite plugin API is properly set
if (typeof(window.sqlitePlugin) === "undefined") {
    throw new Error("Dependencies were not loaded correctly: window.sqlitePlugin is not defined.");
}

if (typeof(window.sqlitePlugin.openDatabase) !== "function") {
    throw new Error("Dependencies were not loaded correctly: window.sqlitePlugin does not provide an `openDatabase` function.");
}

var OUTSYSTEMS_KEYSTORE = "outsystems-key-store"
var LOCAL_STORAGE_KEY = "outsystems-local-storage-key";

var lskCache = "";

/**
 * Provides the currently stored Local Storage Key or generates a new one.
 *
 * @param {Function} successCallback    Called with a successfully acquired LSK.
 * @param {Function} errorCallback      Called when an error occurs acquiring the LSK.
 */
function acquireLsk(successCallback, errorCallback) {
    // If the key is cached, use it
    if (lskCache) {
        successCallback(lskCache);
        return;
    }

    // Otherwise, open the OutSystems key store
    var initFn = function() {
        var ss = new SecureStorage(
            function () {
                // and when initialized attempt to get the stored key
                ss.get(
                    function (value) {
                        lskCache = value;
                        console.log("Got Local Storage key");
                        if(!successCallback) console.log("successCallback is undefined!");
                        successCallback(lskCache);
                    },
                    function (error) {
                        // If there's no key yet, generate a new one and store it
                        var newKey = generateKey();
                        lskCache = undefined;
                        console.log("Setting new Local Storage key");
                        if(!errorCallback) console.log("errorCallback is undefined!");
                        ss.set(
                            function (key) {
                                lskCache = newKey;
                                if(!successCallback) console.log("error successCallback is undefined!");
                                successCallback(lskCache);
                            },
                            errorCallback,
                            LOCAL_STORAGE_KEY,
                            newKey);
                    },
                    LOCAL_STORAGE_KEY);
            },
            function(error) {
                if (error.message === "Device is not secure") {
tb                    if (window.confirm("In order to use this app, your device must have a secure lock screen. Press OK to setup your device.")) {
                        ss.secureDevice(
                            initFn,
                            function() {
                                navigator.app.exitApp();
                            }
                        );
                    } else {
                        navigator.app.exitApp();
                    }
                } else {
                    if(!errorCallback) console.log("errorCallback is undefined!");
                    errorCallback(error);
                }
            },
            OUTSYSTEMS_KEYSTORE);
     };

     initFn();
}

/**
 * Securely generates a new key.
 *
 * @return {String} The generated key.
 */
function generateKey() {

    function makeVisible(c) {
        c += 32;
        if (c < 127) return c;
        return c + 34;
    }

    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(
            a,
            function(c) {
                return String.fromCharCode( makeVisible(c) );
            }).join("");
}

/**
 * Validates the options passed to a `openDatabase` call are correctly set.
 *
 * @param {Object} options  Options object to be passed to a `openDatabase` call.
 */
function validateDbOptions(options) {
    if (typeof options.key !== 'string' || options.key.length === 0) {
        throw new Error("Attempting to open a database without a valid encryption key.");
    }
}

// Set the `isSQLCipherPlugin` feature flag to help ensure the right plugin was loaded
window.sqlitePlugin.sqliteFeatures["isSQLCipherPlugin"] = true;

// Override existing openDatabase to automatically provide the `key` option
var originalOpenDatabase = window.sqlitePlugin.openDatabase;
window.sqlitePlugin.openDatabase = function(options, successCallback, errorCallback) {
    return acquireLsk(
        function (key) {
            // Clone the options
            var newOptions = {};
            for (var prop in options) {
                if (options.hasOwnProperty(prop)) {
                    newOptions[prop] = options[prop];
                }
            }
            
            // Ensure `location` is set (it is mandatory now)
            if (newOptions.location === undefined) {
                newOptions.location = "default";
            }
            
            // Set the `key` to the one provided
            newOptions.key = key;

            // Validate the options and call the original openDatabase
            validateDbOptions(newOptions);
            if(!originalOpenDatabase) console.log("originalOpenDatabase is undefined!");
            return originalOpenDatabase.call(window.sqlitePlugin, newOptions, successCallback, errorCallback);
        },
        errorCallback);
};
